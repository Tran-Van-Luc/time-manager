import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

// The type definition for a parsed row remains the same.
export type ParsedRow = {
  title: string;
  description?: string;
  start_at?: number;
  end_at?: number;
  priority?: "low" | "medium" | "high";
  status?: "pending" | "in-progress" | "completed";
  reminderEnabled?: boolean;
  reminderTime?: number;
  reminderMethod?: "notification" | "alarm";
  repeatEnabled?: boolean;
  repeatFrequency?: "daily" | "weekly" | "monthly" | "yearly";
  repeatInterval?: number;
  repeatDaysOfWeek?: string[];
  repeatDaysOfMonth?: string[];
  repeatEndDate?: number;
  yearlyCount?: number;
  habitMerge?: boolean;
  meta?: {
    usedCombined?: boolean;
    validStartDate?: boolean;
    validStartTime?: boolean;
    validEndTime?: boolean;
    originalRow?: number;
  };
};

// --- Utility and parsing helper functions ---

const parseViDateTime = (s: string): number => {
  if (!s) return NaN;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})-(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return NaN;
  const [, hh, mm, dd, MM, yyyy] = m;
  const d = new Date(
    Number(yyyy),
    Number(MM) - 1,
    Number(dd),
    Number(hh),
    Number(mm),
    0,
    0
  );
  return d.getTime();
};

const parseBooleanVi = (s: any, def: boolean = false): boolean => {
  if (typeof s === "boolean") return s;
  if (s == null || s === "") return def;
  const v = String(s).trim().toLowerCase();
  if (["1", "true", "có", "co", "x", "yes", "y"].includes(v)) return true;
  if (["2", "false", "không", "khong", "no", "n"].includes(v)) return false;
  return def;
};

const mapPriorityVi = (s: any): "low" | "medium" | "high" => {
  if (s == null || s === "") return "medium"; // default 2 = medium
  if (typeof s === "number") {
    if (s === 1) return "low";
    if (s === 3) return "high";
    return "medium";
  }
  const v = String(s)
    .trim()
    .toLowerCase();
  if (["1", "thấp", "thap", "low"].some(tok => v.includes(tok))) return "low";
  if (["3", "cao", "high"].some(tok => v.includes(tok))) return "high";
  // Default: medium (2)
  return "medium";
};

const mapFrequencyVi = (s: any): "daily" | "weekly" | "monthly" | "yearly" => {
  if (s == null || s === "") return "daily"; // default 1 = daily
  if (typeof s === "number") {
    if (s === 2) return "weekly";
    if (s === 3) return "monthly";
    if (s === 4) return "yearly";
    return "daily";
  }
  const v = String(s || "")
    .trim()
    .toLowerCase();
  if (v.includes("tuần") || v.includes("tuan") || v.includes("weekly") || v === "2")
    return "weekly";
  if (v.includes("tháng") || v.includes("thang") || v.includes("monthly") || v === "3")
    return "monthly";
  if (v.includes("năm") || v.includes("nam") || v.includes("year") || v === "4")
    return "yearly";
  return "daily";
};

const parseLeadVi = (s: any): number => {
  if (s == null) return 0;
  const v = String(s).trim().toLowerCase();
  const m = v.match(/^(\d+)\s*(phút|phut|p|giờ|gio|g|ngày|ngay|n)?/);
  if (!m) return 0;
  const num = parseInt(m[1], 10);
  const unit = m[2] || "phút";
  if (["giờ", "gio", "g"].includes(unit)) return num * 60;
  if (["ngày", "ngay", "n"].includes(unit)) return num * 1440;
  return num;
};

const parseDateOnlyVi = (s: any): number | undefined => {
  if (s == null || s === "") return undefined;

  let d: Date | undefined;

  if (s instanceof Date) {
    d = s;
  } else if (typeof s === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    d = new Date(excelEpoch.getTime() + s * 86400 * 1000);
  } else if (typeof s === "string") {
    const v = s.trim();
    if (v.includes("-") && v.includes("T")) {
      d = new Date(v);
    } else {
      const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const dd = parseInt(m[1], 10),
          MM = parseInt(m[2], 10),
          yyyy = parseInt(m[3], 10);
        d = new Date(yyyy, MM - 1, dd);
      }
    }
  }

  if (!d || isNaN(d.getTime())) {
    return undefined;
  }

  const normalizedDate = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    0,
    0,
    0,
    0
  );

  return normalizedDate.getTime();
};

const parseTimeVi = (s: any): { h: number; m: number } | undefined => {
  if (s == null || s === "") return undefined;
  // If it's already a Date, extract hours/minutes
  if (s instanceof Date) {
    return { h: s.getHours(), m: s.getMinutes() };
  }
  // Excel sometimes stores times as fractional numbers (e.g., 0.375 = 09:00)
  if (typeof s === 'number') {
    // if it's >1 it might be epoch days, ignore here
    const frac = s % 1;
    const totalSeconds = Math.round(frac * 24 * 3600);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (isNaN(h) || isNaN(m)) return undefined;
    return { h, m };
  }

  const v = String(s).trim();
  // Accept formats like "9:00", "09:00", "9:00:00", and with AM/PM tokens such as SA/CH/AM/PM or Vietnamese words
  const m = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(sa|ch|am|pm|sang|chieu|sáng|chiều)?$/i);
  if (!m) return undefined;
  let h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const sec = m[3] ? parseInt(m[3], 10) : 0;
  const ampm = m[4] ? String(m[4]).toLowerCase() : '';
  if (ampm) {
    const isPM = ['ch', 'chieu', 'chiều', 'pm'].includes(ampm);
    const isAM = ['sa', 'sang', 'sáng', 'am'].includes(ampm);
    if (isPM && h < 12) h = h + 12;
    if (isAM && h === 12) h = 0;
  }
  if (isNaN(h) || isNaN(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return undefined;
  return { h, m: mm };
};

const combineDateTimeMs = (
  dateMs?: number,
  time?: { h: number; m: number }
): number | undefined => {
  if (dateMs == null || !time) return undefined;
  const d = new Date(dateMs);
  d.setHours(time.h, time.m, 0, 0);
  return d.getTime();
};

const mapDowVi = (token: string): string | null => {
  const t = token.trim().toLowerCase();
  if (t === "t2" || t.includes("thứ 2") || t.includes("thu 2")) return "Mon";
  if (t === "t3" || t.includes("thứ 3") || t.includes("thu 3")) return "Tue";
  if (t === "t4" || t.includes("thứ 4") || t.includes("thu 4")) return "Wed";
  if (t === "t5" || t.includes("thứ 5") || t.includes("thu 5")) return "Thu";
  if (t === "t6" || t.includes("thứ 6") || t.includes("thu 6")) return "Fri";
  if (t === "t7" || t.includes("thứ 7") || t.includes("thu 7")) return "Sat";
  if (t === "cn" || t.includes("chủ nhật") || t.includes("chu nhat"))
    return "Sun";
  return null;
};

const parseDowsVi = (s: any): string[] => {
  if (!s) return [];
  return String(s)
    .split(",")
    .map((x) => mapDowVi(x))
    .filter((x): x is string => !!x);
};

const parseDomList = (s: any): string[] => {
  if (!s) return [];
  return String(s)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[:]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const getCell = (row: any, primary: string, aliases: string[] = []): any => {
  const target = normalize(primary);
  const keys = Object.keys(row);
  for (const k of keys) {
    const nk = normalize(String(k));
    if (nk === target || aliases.some((a) => normalize(a) === nk))
      return row[k];
  }
  return undefined;
};

export type ParseResult = { rows: ParsedRow[]; errors: string[] };

export async function parseFile(uri: string): Promise<ParseResult> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const wb = XLSX.read(base64, { type: "base64", cellDates: true });

  const ws_tasks = wb.Sheets["Công việc"];
  const ws_reminders = wb.Sheets["Nhắc nhở"];
  const ws_repetition = wb.Sheets["Lặp lại"];

  if (!ws_tasks) {
    throw new Error("Sheet 'Công việc' không tồn tại trong file Excel.");
  }

  const taskRows = XLSX.utils.sheet_to_json(ws_tasks, { defval: "", range: 2 });
  const reminderRows = ws_reminders
    ? XLSX.utils.sheet_to_json(ws_reminders, { defval: "", range: 2 })
    : [];
  const repetitionRows = ws_repetition
    ? XLSX.utils.sheet_to_json(ws_repetition, { defval: "", range: 2 })
    : [];
    
  const errors: string[] = [];
  const tasksMap = new Map<string, ParsedRow>();

  for (const [index, row] of (taskRows as any[]).entries()) {
    const excelRowIdx = 4 + index; // Dòng 1-2 là hướng dẫn, 3 là header, 4 là dữ liệu
    const title = getCell(row, "Tiêu đề", ["Title"]);

    if (!title || !String(title).trim()) {
      // If the row contains other data but no title, treat as an error.
      const rawStartDate = getCell(row, "Ngày bắt đầu", ["Start Date"]);
      const rawStartTime = getCell(row, "Giờ bắt đầu", ["Start Time"]);
      const rawEndTime = getCell(row, "Giờ kết thúc", ["End Time"]);
      const anyOther = rawStartDate || rawStartTime || rawEndTime || getCell(row, "Mô tả", ["Description"]) || getCell(row, "Mức độ", ["Priority"]);
      if (anyOther) {
        errors.push(`Dòng ${excelRowIdx}: Thiếu 'Tiêu đề'`);
      }
      // Skip empty or already-reported rows
      continue;
    }

    const rawStartDate = getCell(row, "Ngày bắt đầu", ["Start Date"]);
    const rawStartTime = getCell(row, "Giờ bắt đầu", ["Start Time"]);
    const rawEndTime = getCell(row, "Giờ kết thúc", ["End Time"]);

    if (!rawStartDate) {
      errors.push(`Dòng ${excelRowIdx}: Thiếu 'Ngày bắt đầu'`);
      continue;
    }
    if (!rawStartTime) {
      errors.push(`Dòng ${excelRowIdx}: Thiếu 'Giờ bắt đầu'`);
      continue;
    }
     if (!rawEndTime) {
      errors.push(`Dòng ${excelRowIdx}: Thiếu 'Giờ kết thúc'`);
      continue;
    }

    const startDateMs = parseDateOnlyVi(rawStartDate);
    const startTimeObj = parseTimeVi(rawStartTime);
    const endTimeObj = parseTimeVi(rawEndTime);

    if (!startDateMs) {
      errors.push(`Dòng ${excelRowIdx}: Sai định dạng 'Ngày bắt đầu' (cần là dd/MM/yyyy)`);
      continue;
    }
    if (!startTimeObj) {
      errors.push(`Dòng ${excelRowIdx}: Sai định dạng 'Giờ bắt đầu' (cần là HH:MM)`);
      continue;
    }
    if (!endTimeObj) {
      errors.push(`Dòng ${excelRowIdx}: Sai định dạng 'Giờ kết thúc' (cần là HH:MM)`);
      continue;
    }
    
    const final_start_at = combineDateTimeMs(startDateMs, startTimeObj);
    const final_end_at = combineDateTimeMs(startDateMs, endTimeObj);

    if (!final_start_at || !final_end_at || final_end_at <= final_start_at) {
        errors.push(`Dòng ${excelRowIdx}: 'Giờ kết thúc' phải sau 'Giờ bắt đầu'`);
        continue;
    }

    const parsedRow: ParsedRow = {
      title: String(title),
      description: getCell(row, "Mô tả", ["Description"]) || "",
      start_at: final_start_at,
      end_at: final_end_at,
      priority: mapPriorityVi(getCell(row, "Mức độ", ["Priority"])),
      status: 'pending',
  // habitAuto removed: auto-complete feature is no longer supported in import template
      habitMerge: false,
      reminderEnabled: false,
      repeatEnabled: false,
      repeatDaysOfWeek: [],
      repeatDaysOfMonth: [],
      meta: {
        usedCombined: false,
        validStartDate: true,
        validStartTime: true,
        validEndTime: true,
        originalRow: excelRowIdx,
      },
    };
    tasksMap.set(normalize(parsedRow.title), parsedRow);
  }

  // (Không trả về ngay — tiếp tục validate các sheet Nhắc nhở và Lặp lại để gom hết lỗi)

  // --- START: Validation for Reminders & Repetition sheets ---
  // Validate that titles in 'Nhắc nhở' and 'Lặp lại' (if present)
  // 1) match a title in the 'Công việc' sheet (tasksMap)
  // 2) are not duplicated within their own sheet
  const validateSheetTitles = (rows: any[], sheetPrettyName: string) => {
    const seen = new Set<string>();
    for (const [index, row] of (rows as any[]).entries()) {
      const excelRowIdx = 4 + index; // dữ liệu bắt đầu từ dòng 4
      const titleRaw = getCell(row, "Tiêu đề", ["Title"]) || "";
      if (!titleRaw || String(titleRaw).trim() === "") continue; // bỏ qua nếu không có tiêu đề
      const normalizedTitle = normalize(titleRaw);
      if (!tasksMap.has(normalizedTitle)) {
        errors.push(
          `Dòng ${excelRowIdx} trong sheet '${sheetPrettyName}': Tiêu đề '${String(
            titleRaw
          )}' không khớp bất kỳ tiêu đề nào trong sheet 'Công việc'.`
        );
      }
      if (seen.has(normalizedTitle)) {
        errors.push(
          `Dòng ${excelRowIdx} trong sheet '${sheetPrettyName}': Tiêu đề '${String(
            titleRaw
          )}' bị trùng lặp trong sheet '${sheetPrettyName}'.`
        );
      } else {
        seen.add(normalizedTitle);
      }
    }
  };

  if (reminderRows && (reminderRows as any[]).length > 0) {
    validateSheetTitles(reminderRows as any[], "Nhắc nhở");
  }
  if (repetitionRows && (repetitionRows as any[]).length > 0) {
    validateSheetTitles(repetitionRows as any[], "Lặp lại");
  }

  // Nếu có lỗi validate, trả về để người dùng sửa file Excel
  if (errors.length > 0) {
    return { rows: [], errors };
  }
  // --- END: Validation for Reminders & Repetition sheets ---

  for (const row of reminderRows as any[]) {
    const title = getCell(row, "Tiêu đề", ["Title"]) || "";
    if (!title) continue;
    const normalizedTitle = normalize(title);

    if (tasksMap.has(normalizedTitle)) {
      const task = tasksMap.get(normalizedTitle)!;
      task.reminderEnabled = true;
      task.reminderTime = parseLeadVi(
        getCell(row, "Nhắc trước", ["Remind Before"])
      );

      // Accept numeric encodings: 1 = notification, 2 = alarm; default = notification
      const rawMethod = getCell(row, "Phương thức nhắc", ["Method"]);
      if (rawMethod == null || rawMethod === "") {
        task.reminderMethod = "notification";
      } else if (typeof rawMethod === "number") {
        task.reminderMethod = rawMethod === 2 ? "alarm" : "notification";
      } else {
        const methodStr = String(rawMethod).toLowerCase();
        task.reminderMethod =
          methodStr.includes("alarm") || methodStr.includes("chuông")
            ? "alarm"
            : methodStr === "2"
            ? "alarm"
            : "notification";
      }
    }
  }

  for (const row of repetitionRows as any[]) {
    const title = getCell(row, "Tiêu đề", ["Title"]) || "";
    if (!title) continue;
    const normalizedTitle = normalize(title);

    if (tasksMap.has(normalizedTitle)) {
      const task = tasksMap.get(normalizedTitle)!;
      task.repeatEnabled = true;
      task.repeatFrequency = mapFrequencyVi(
        getCell(row, "Lặp theo", ["Frequency"])
      );
      task.repeatDaysOfWeek = parseDowsVi(
        getCell(row, "Ngày trong tuần", ["Days Of Week"])
      );
      task.repeatDaysOfMonth = parseDomList(
        getCell(row, "Ngày trong tháng", ["Days Of Month"])
      );
      task.repeatEndDate = parseDateOnlyVi(
        getCell(row, "Ngày kết thúc lặp", ["Repeat End Date"])
      );
      const yearlyCountRaw = getCell(row, "Số lần lặp/năm", ["Yearly Count"]);
      task.yearlyCount = yearlyCountRaw
        ? Math.max(1, Math.min(100, parseInt(String(yearlyCountRaw), 10) || 1))
        : undefined;

      // Gộp nhiều ngày: 1 = có (true), 2 = không (false). Default = 1 (true) if empty.
      task.habitMerge = parseBooleanVi(
        getCell(row, "Gộp nhiều ngày", ["Merge Streak"]),
        true
      );
    }
  }

  const rowsOut = Array.from(tasksMap.values());
  return { rows: rowsOut, errors };
}

export async function exportTemplate() {
  try {
    const wb = XLSX.utils.book_new();

    const baseStyle = { alignment: { wrapText: true, vertical: "top" } };
    const mandatoryCellStyle = {
      fill: { fgColor: { rgb: "FFCDD2" } },
      font: { color: { rgb: "9C0006" } },
    };
    const mandatoryHeaderCellStyle = {
      ...mandatoryCellStyle,
      font: { ...mandatoryCellStyle.font, bold: true },
    };
    
    // *** THAY ĐỔI CHÍNH Ở ĐÂY ***
    const createCell = (value: string, style?: object) => {
      // Convert sentence breaks into newlines for better Excel cell display.
      const textVal = value == null ? "" : String(value).replace(/\.\s+/g, ".\n");

      const cellStyle = {
        ...baseStyle,
        ...style,
        numFmt: "@",
      };
      return { v: textVal, t: "s", s: cellStyle };
    };

    // --- Sheet 1: Công việc (Tasks) ---
    const taskData = [
      [
        createCell(
          "Mandatory. A short text description for the task.",
          mandatoryCellStyle
        ),
        createCell("Optional. A more detailed description."),
        createCell(
          "Mandatory. Format: dd/MM/yyyy.",
          mandatoryCellStyle
        ),
        createCell(
          "Mandatory. 24h format: HH:MM.",
          mandatoryCellStyle
        ),
        createCell(
          "Mandatory. 24h format: HH:MM. Must be later than the start time.",
          mandatoryCellStyle
        ),
        createCell(
          "Optional. Values: Low, Medium, or High (case-insensitive). If empty, default is Medium."
        ),
      ],
      [
        createCell(
          "Bắt buộc. Chuỗi text, mô tả ngắn cho công việc.",
          mandatoryCellStyle
        ),
        createCell("Tùy chọn. Mô tả chi tiết hơn."),
        createCell(
          "Bắt buộc. Định dạng dd/MM/yyyy.",
          mandatoryCellStyle
        ),
        createCell(
          "Bắt buộc. Định dạng 24h HH:MM.",
          mandatoryCellStyle
        ),
        createCell("Bắt buộc. Định dạng 24h HH:MM, phải lớn hơn giờ bắt đầu.", mandatoryCellStyle),
  createCell("Tùy chọn. Giá trị: Thấp, Trung bình hoặc Cao. Nếu để trống mặc định là Trung bình."),
      ],
      [
        createCell("Tiêu đề (Title)", mandatoryHeaderCellStyle),
        createCell("Mô tả (Description)"),
        createCell("Ngày bắt đầu (Start Date)", mandatoryHeaderCellStyle),
        createCell("Giờ bắt đầu (Start Time)", mandatoryHeaderCellStyle),
        createCell("Giờ kết thúc (End Time)", mandatoryHeaderCellStyle),
        createCell("Mức độ (Priority)"),
      ],
    ];
    taskData.push([
      createCell("Ôn tập Toán"),
      createCell("Chương 1: Hàm số"),
      createCell("20/10/2025"),
      createCell("08:00"),
      createCell("09:00"),
      createCell("Trung bình"),
    ]);
    const ws_tasks = XLSX.utils.aoa_to_sheet(taskData);
    ws_tasks["!rows"] = [
      { hpt: 45 }, // Dòng 1 (index 0) - Hướng dẫn tiếng Anh
      { hpt: 45 }, // Dòng 2 (index 1) - Hướng dẫn tiếng Việt
      { hpt: 20 }, // Dòng 3 (index 2) - Tiêu đề cột
    ];
    ws_tasks["!cols"] = [
      { wch: 40 },
      { wch: 50 },
      { wch: 25 },
      { wch: 25 },
      { wch: 25 },
      { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, ws_tasks, "Công việc");

    // --- Sheet 2: Nhắc nhở (Reminders) ---
    const reminderData = [
      [
        createCell(
          "Mandatory. Must match a title from the 'Công việc' sheet.",
          mandatoryCellStyle
        ),
        createCell(
          "Mandatory. Supports units: minute, hour, day. Ex: '15 minutes'.",
          mandatoryCellStyle
        ),
        createCell(
          "Mandatory. Values: 'Thông báo' (Notification) or 'Chuông báo' (Alarm).",
          mandatoryCellStyle
        ),
      ],
      [
        createCell(
          "Bắt buộc. Phải khớp với một tiêu đề trong sheet 'Công việc'.",
          mandatoryCellStyle
        ),
        createCell(
          "Bắt buộc. Hỗ trợ đơn vị: phút, giờ, ngày. Ví dụ: '15 phút'.",
          mandatoryCellStyle
        ),
        createCell(
          "Bắt buộc. Giá trị: 'Thông báo' hoặc 'Chuông báo'.",
          mandatoryCellStyle
        ),
      ],
      [
        createCell("Tiêu đề (Title)", mandatoryHeaderCellStyle),
        createCell("Nhắc trước (Remind Before)", mandatoryHeaderCellStyle),
        createCell("Phương thức nhắc (Method)", mandatoryHeaderCellStyle),
      ],
    ];
    reminderData.push([
      createCell("Ôn tập Toán"),
      createCell("15 phút"),
      createCell("Thông báo"),
    ]);
    const ws_reminders = XLSX.utils.aoa_to_sheet(reminderData);
    ws_reminders["!rows"] = [
      { hpt: 60 }, // Dòng 1 (index 0) - Hướng dẫn tiếng Anh
      { hpt: 60 }, // Dòng 2 (index 1) - Hướng dẫn tiếng Việt
      { hpt: 20 }, // Dòng 3 (index 2) - Tiêu đề cột
    ];
    ws_reminders["!cols"] = [{ wch: 40 }, { wch: 40 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, ws_reminders, "Nhắc nhở");

    // --- Sheet 3: Lặp lại (Repetition) ---
    const repetitionData = [
      [
        createCell(
          "Mandatory. Must match a title from the 'Công việc' sheet.",
          mandatoryCellStyle
        ),
        createCell(
          "Mandatory. Values: Ngày, Tuần, Tháng, or Năm.",
          mandatoryCellStyle
        ),
        createCell(
          "Required for 'Tuần' (Weekly) repeat. Comma-separated. Ex: T2,T4,T6.",
          mandatoryCellStyle
        ),
        createCell(
          "Required for 'Tháng' (Monthly) repeat. Comma-separated. Ex: 1,15,28.",
          mandatoryCellStyle
        ),
        createCell(
          "Mandatory. The end date for the repetition. Format: dd/MM/yyyy.",
          mandatoryCellStyle
        ),
        createCell(
          "Required for 'Năm' (Yearly) repeat. Integer between 1-100.",
          mandatoryCellStyle
        ),
        createCell(
          "Optional (Yes/No). If enabled, all repeats are counted as one streak.",
          {}
        ),
        // Auto-complete column removed
      ],
      [
        createCell(
          "Bắt buộc. Phải khớp với một tiêu đề trong sheet 'Công việc'.",
          mandatoryCellStyle
        ),
        createCell(
          "Bắt buộc. Giá trị: Ngày, Tuần, Tháng hoặc Năm.",
          mandatoryCellStyle
        ),
        createCell(
          "Bắt buộc nếu lặp theo Tuần. Phân cách bởi dấu phẩy. Vd: T2,T4,6.",
          mandatoryCellStyle
        ),
        createCell(
          "Bắt buộc nếu lặp theo Tháng. Phân cách bởi dấu phẩy. Vd: 1,15,28.",
          mandatoryCellStyle
        ),
        createCell(
          "Bắt buộc. Ngày kết thúc lặp. Định dạng: dd/MM/yyyy.",
          mandatoryCellStyle
        ),
        createCell(
          "Bắt buộc nếu lặp theo Năm. Số nguyên 1..100.",
          mandatoryCellStyle
        ),
        createCell(
          "Tùy chọn (Có/Không). Nếu Có, các ngày lặp tính là 1 đơn vị.",
          {}
        ),
        // Auto-complete column removed
      ],
      [
        createCell("Tiêu đề (Title)", mandatoryHeaderCellStyle),
        createCell("Lặp theo (Frequency)", mandatoryHeaderCellStyle),
        createCell("Ngày trong tuần (Days Of Week)", mandatoryHeaderCellStyle),
        createCell(
          "Ngày trong tháng (Days Of Month)",
          mandatoryHeaderCellStyle
        ),
        createCell(
          "Ngày kết thúc lặp (Repeat End Date)",
          mandatoryHeaderCellStyle
        ),
        createCell("Số lần lặp/năm (Yearly Count)", mandatoryHeaderCellStyle),
        createCell("Gộp nhiều ngày (Merge Streak)", {}),
      ],
    ];
    repetitionData.push([
      createCell("Ôn tập Toán"),
      createCell("Tuần"),
      createCell("T2,T4"),
      createCell(""),
      createCell("31/12/2025"),
      createCell(""),
      createCell("Không"),
    ]);
    const ws_repetition = XLSX.utils.aoa_to_sheet(repetitionData);
    ws_repetition["!rows"] = [
      { hpt: 65 }, // Dòng 1 (index 0) - Hướng dẫn tiếng Anh
      { hpt: 65 }, // Dòng 2 (index 1) - Hướng dẫn tiếng Việt
      { hpt: 20 }, // Dòng 3 (index 2) - Tiêu đề cột
    ];
    ws_repetition["!cols"] = [
      { wch: 40 },
      { wch: 40 },
      { wch: 45 },
      { wch: 45 },
      { wch: 40 },
      { wch: 40 },
      { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, ws_repetition, "Lặp lại");

    const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const uri =
      (FileSystem.documentDirectory || FileSystem.cacheDirectory || "") +
      "mau-nhap-lieu.xlsx";
    await FileSystem.writeAsStringAsync(uri, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        dialogTitle: "Chia sẻ mẫu nhập liệu",
        UTI: "org.openxmlformats.spreadsheetml.sheet",
      });
    }

    return { excelUri: uri };
  } catch (e) {
    console.error(e);
    throw e;
  }
}