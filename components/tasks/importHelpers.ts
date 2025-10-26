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

const parseBooleanVi = (s: any): boolean => {
  if (typeof s === "boolean") return s;
  if (s == null) return false;
  const v = String(s).trim().toLowerCase();
  return ["có", "co", "true", "1", "x", "yes", "y"].includes(v);
};
const mapPriorityVi = (s: any): "low" | "medium" | "high" => {
  const v = String(s || "")
    .trim()
    .toLowerCase();
  if (v.includes("cao") || v.includes("high")) return "high";
  if (v.includes("trung") || v.includes("trung binh") || v.includes("medium"))
    return "medium";
  if (v.includes("thấp") || v.includes("thap") || v.includes("low"))
    return "low";
  return "medium";
};

const mapFrequencyVi = (s: any): "daily" | "weekly" | "monthly" | "yearly" => {
  const v = String(s || "")
    .trim()
    .toLowerCase();
  if (v.includes("tuần") || v.includes("tuan") || v.includes("weekly"))
    return "weekly";
  if (v.includes("tháng") || v.includes("thang") || v.includes("monthly"))
    return "monthly";
  if (v.includes("năm") || v.includes("nam") || v.includes("year"))
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
      // Bỏ qua các dòng trống không có tiêu đề
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

  // Nếu có lỗi ngay từ bước đọc file cơ bản, trả về luôn
  if (errors.length > 0) {
    return { rows: [], errors };
  }

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
      const method = String(
        getCell(row, "Phương thức nhắc", ["Method"]) || ""
      ).toLowerCase();
      task.reminderMethod =
        method.includes("alarm") || method.includes("chuông")
          ? "alarm"
          : "notification";
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
      task.habitMerge = parseBooleanVi(
        getCell(row, "Gộp nhiều ngày", ["Merge Streak"])
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
      // Kết hợp style cơ bản, style tùy chọn và định dạng Text
      const cellStyle = {
        ...baseStyle,
        ...style,
        numFmt: "@", // Ký hiệu cho định dạng Text trong Excel
      };
      // Trả về đối tượng ô với kiểu 's' (string) và style đã kết hợp
      return { v: value, t: "s", s: cellStyle };
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
          "Mandatory if start time is present. Format: dd/MM/yyyy.",
          mandatoryCellStyle
        ),
        createCell(
          "Optional. 24h format: HH:MM. If empty, the task is for the whole day."
        ),
        createCell(
          "Optional. 24h format: HH:MM. Must be later than the start time."
        ),
        createCell(
          "Optional. Values: Low, Medium, or High (case-insensitive)."
        ),
      ],
      [
        createCell(
          "Bắt buộc. Chuỗi text, mô tả ngắn cho công việc.",
          mandatoryCellStyle
        ),
        createCell("Tùy chọn. Mô tả chi tiết hơn."),
        createCell(
          "Bắt buộc khi có giờ bắt đầu. Định dạng dd/MM/yyyy.",
          mandatoryCellStyle
        ),
        createCell(
          "Tùy chọn. Định dạng 24h HH:MM. Nếu trống, công việc sẽ tính cho cả ngày."
        ),
        createCell("Tùy chọn. Định dạng 24h HH:MM, phải lớn hơn giờ bắt đầu."),
        createCell("Tùy chọn. Giá trị: Thấp, Trung bình hoặc Cao."),
      ],
      [
        createCell("Tiêu đề (Title)", mandatoryHeaderCellStyle),
        createCell("Mô tả (Description)"),
        createCell("Ngày bắt đầu (Start Date)", mandatoryHeaderCellStyle),
        createCell("Giờ bắt đầu (Start Time)"),
        createCell("Giờ kết thúc (End Time)"),
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