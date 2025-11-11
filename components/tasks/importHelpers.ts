import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { generateOccurrences } from "../../utils/taskValidation";

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
  habitAuto?: boolean; // tự động đánh hoàn thành nếu hết hạn
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
  if (!ws_tasks) {
    throw new Error("Sheet 'Công việc' không tồn tại trong file Excel.");
  }

  // Xác định dòng header linh hoạt (hỗ trợ cả template có 1 hay 2 dòng hướng dẫn)
  const rawRows: any[] = XLSX.utils.sheet_to_json(ws_tasks, { header: 1, defval: "" }) as any[];
  const norm = (v: any) => normalize(String(v || ""));
  let headerRowIdx = 1; // mặc định: dòng 2 là header
  for (let i = 0; i < Math.min(5, rawRows.length); i++) {
    const row = rawRows[i] as any[];
    if (!Array.isArray(row)) continue;
    const hasTitle = row.some((cell) => {
      const n = norm(cell);
      return n === norm("Tiêu đề") || n === norm("Tiêu đề (Title)") || n === norm("Title");
    });
    const hasStart = row.some((cell) => {
      const n = norm(cell);
      return n === norm("Ngày bắt đầu") || n === norm("Ngày bắt đầu (Start Date)") || n === norm("Start Date");
    });
    if (hasTitle && hasStart) { headerRowIdx = i; break; }
  }

  // Lấy dãy header để xác định cột (A, B, C, ...)
  const headerCells: any[] = Array.isArray(rawRows[headerRowIdx]) ? (rawRows[headerRowIdx] as any[]) : [];
  const findHeaderIndex = (names: string[]): number => {
    for (let idx = 0; idx < headerCells.length; idx++) {
      const cellVal = headerCells[idx];
      const nCell = norm(cellVal);
      for (const name of names) {
        if (nCell === norm(name)) return idx;
      }
    }
    return -1;
  };
  const toColumnLetter = (idx: number): string => {
    // idx: 0-based
    let n = idx + 1;
    let s = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - rem - 1) / 26);
    }
    return s || "";
  };
  const cellRef = (idx: number, displayName: string) =>
    idx >= 0 ? `Cột ${toColumnLetter(idx)} (${displayName})` : `Cột '${displayName}'`;

  // Ghi nhớ vị trí một số cột quan trọng để thông báo lỗi chi tiết
  const idxTitle = findHeaderIndex(["Tiêu đề", "Title"]);
  const idxStartDate = findHeaderIndex(["Ngày bắt đầu", "Start Date"]);
  const idxStartTime = findHeaderIndex(["Giờ bắt đầu", "Start Time"]);
  const idxEndTime = findHeaderIndex(["Giờ kết thúc", "End Time"]);
  const idxAuto = findHeaderIndex(["Tự động hoàn thành", "Auto Complete", "Tự động hoàn thành nếu hết hạn"]);
  const idxFreq = findHeaderIndex(["Lặp theo", "Frequency"]);
  const idxDows = findHeaderIndex(["Ngày trong tuần", "Days Of Week"]);
  const idxDoms = findHeaderIndex(["Ngày trong tháng", "Days Of Month"]);
  const idxRepeatEnd = findHeaderIndex(["Ngày kết thúc lặp", "Repeat End Date"]);
  const idxYearlyCount = findHeaderIndex(["Số lần lặp/năm", "Yearly Count"]);
  const idxMerge = findHeaderIndex(["Gộp nhiều ngày", "Merge Streak"]);

  // Đọc JSON với dòng header đã xác định; dòng header sẽ được dùng làm key
  const taskRows = XLSX.utils.sheet_to_json(ws_tasks, { defval: "", range: headerRowIdx });

  const errors: string[] = [];
  const rowsOut: ParsedRow[] = [];
  const nowPlus1h = Date.now() + 60 * 60 * 1000;

  for (const [index, row] of (taskRows as any[]).entries()) {
    // Tính lại số dòng Excel thực tế cho thông báo lỗi: (headerRowIdx là 0-based)
    const excelRowIdx = headerRowIdx + 2 + index; // headerRowIdx=1 => bắt đầu từ dòng 3

    const title = getCell(row, "Tiêu đề", ["Title"]);

    if (!title || !String(title).trim()) {
      // If the row contains other data but no title, treat as an error.
      const rawStartDate = getCell(row, "Ngày bắt đầu", ["Start Date"]);
      const rawStartTime = getCell(row, "Giờ bắt đầu", ["Start Time"]);
      const rawEndTime = getCell(row, "Giờ kết thúc", ["End Time"]);
      const anyOther =
        rawStartDate ||
        rawStartTime ||
        rawEndTime ||
        getCell(row, "Mô tả", ["Description"]) ||
        getCell(row, "Mức độ", ["Priority"]);
      if (anyOther) {
        errors.push(`Dòng ${excelRowIdx}: ${cellRef(idxTitle, "Tiêu đề")} - Thiếu 'Tiêu đề'`);
      }
      continue;
    }

    const rawStartDate = getCell(row, "Ngày bắt đầu", ["Start Date"]);
    const rawStartTime = getCell(row, "Giờ bắt đầu", ["Start Time"]);
    const rawEndTime = getCell(row, "Giờ kết thúc", ["End Time"]);

    if (!rawStartDate) {
      errors.push(`Dòng ${excelRowIdx}: ${cellRef(idxStartDate, "Ngày bắt đầu")} - Thiếu 'Ngày bắt đầu'`);
      continue;
    }
    if (!rawStartTime) {
      errors.push(`Dòng ${excelRowIdx}: ${cellRef(idxStartTime, "Giờ bắt đầu")} - Thiếu 'Giờ bắt đầu'`);
      continue;
    }
    if (!rawEndTime) {
      errors.push(`Dòng ${excelRowIdx}: ${cellRef(idxEndTime, "Giờ kết thúc")} - Thiếu 'Giờ kết thúc'`);
      continue;
    }

    const startDateMs = parseDateOnlyVi(rawStartDate);
    const startTimeObj = parseTimeVi(rawStartTime);
    const endTimeObj = parseTimeVi(rawEndTime);

    if (!startDateMs) {
      const val = rawStartDate != null ? String(rawStartDate) : "";
      errors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxStartDate, "Ngày bắt đầu")} - Sai định dạng (giá trị: '${val}', cần dd/MM/yyyy)`
      );
      continue;
    }
    if (!startTimeObj) {
      const val = rawStartTime != null ? String(rawStartTime) : "";
      errors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxStartTime, "Giờ bắt đầu")} - Sai định dạng (giá trị: '${val}', cần HH:MM)`
      );
      continue;
    }
    if (!endTimeObj) {
      const val = rawEndTime != null ? String(rawEndTime) : "";
      errors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxEndTime, "Giờ kết thúc")} - Sai định dạng (giá trị: '${val}', cần HH:MM)`
      );
      continue;
    }

    const final_start_at = combineDateTimeMs(startDateMs, startTimeObj);
    const final_end_at = combineDateTimeMs(startDateMs, endTimeObj);

    if (!final_start_at || !final_end_at || final_end_at <= final_start_at) {
      errors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxEndTime, "Giờ kết thúc")} - phải sau 'Giờ bắt đầu'`
      );
      continue;
    }

    // Reminder fields (optional)
    const rawRemindBefore = getCell(row, "Nhắc trước", ["Remind Before"]);
    const rawMethod = getCell(row, "Phương thức nhắc", ["Method"]);
    const reminderEnabled =
      (rawRemindBefore != null && String(rawRemindBefore).trim() !== "") ||
      (rawMethod != null && String(rawMethod).trim() !== "");
    const reminderTime = reminderEnabled ? parseLeadVi(rawRemindBefore) : 0;
    let reminderMethod: "notification" | "alarm" | undefined = undefined;
    if (reminderEnabled) {
      if (rawMethod == null || rawMethod === "") {
        reminderMethod = "notification";
      } else if (typeof rawMethod === "number") {
        reminderMethod = rawMethod === 2 ? "alarm" : "notification";
      } else {
        const methodStr = String(rawMethod).toLowerCase();
        reminderMethod =
          methodStr.includes("alarm") || methodStr.includes("chuông")
            ? "alarm"
            : methodStr === "2"
            ? "alarm"
            : "notification";
      }
    }

    // Repeat fields (optional, enabled iff any repeat field present)
  const rawAuto = getCell(row, "Tự động hoàn thành", ["Auto Complete", "Tự động hoàn thành nếu hết hạn"]);
    // Interpret auto-complete: "có", "yes", "true", "1" => true; "không", "no", "false", "0", "2" => false
    let habitAuto: boolean | undefined = undefined;
    if (rawAuto != null && String(rawAuto).trim() !== "") {
      const vAuto = String(rawAuto).trim().toLowerCase();
      if (["1", "có", "co", "yes", "y", "true", "x"].includes(vAuto)) habitAuto = true;
      else if (["0", "2", "không", "khong", "no", "n", "false"].includes(vAuto)) habitAuto = false;
    }

  const rawFreq = getCell(row, "Lặp theo", ["Frequency"]);
  const rawDows = getCell(row, "Ngày trong tuần", ["Days Of Week"]);
  const rawDoms = getCell(row, "Ngày trong tháng", ["Days Of Month"]);
  const rawEndDate = getCell(row, "Ngày kết thúc lặp", ["Repeat End Date"]);
  const rawYearlyCount = getCell(row, "Số lần lặp/năm", ["Yearly Count"]);
  const rawMerge = getCell(row, "Gộp nhiều ngày", ["Merge Streak"]);
    const hasAnyRepeat = [rawFreq, rawDows, rawDoms, rawEndDate, rawYearlyCount, rawMerge]
      .some(v => v != null && String(v).trim() !== "");

    const parsedRow: ParsedRow = {
      title: String(title),
      description: getCell(row, "Mô tả", ["Description"]) || "",
      start_at: final_start_at,
      end_at: final_end_at,
      priority: mapPriorityVi(getCell(row, "Mức độ", ["Priority"])),
      status: "pending",
  habitMerge: hasAnyRepeat ? parseBooleanVi(rawMerge, true) : false,
  habitAuto,
      reminderEnabled,
      reminderTime: reminderEnabled ? reminderTime : undefined,
      reminderMethod: reminderEnabled ? reminderMethod : undefined,
      repeatEnabled: hasAnyRepeat,
      repeatFrequency: hasAnyRepeat && rawFreq ? mapFrequencyVi(rawFreq) : undefined,
      repeatDaysOfWeek: hasAnyRepeat ? parseDowsVi(rawDows) : [],
      repeatDaysOfMonth: hasAnyRepeat ? parseDomList(rawDoms) : [],
      repeatEndDate: hasAnyRepeat ? parseDateOnlyVi(rawEndDate) : undefined,
      yearlyCount: hasAnyRepeat && rawYearlyCount
        ? Math.max(1, Math.min(100, parseInt(String(rawYearlyCount), 10) || 1))
        : undefined,
      meta: {
        usedCombined: true,
        validStartDate: true,
        validStartTime: true,
        validEndTime: true,
        originalRow: excelRowIdx,
      },
    };

    // Bổ sung các ràng buộc giống TaskModal
    // 1) Start time phải >= now + 1h (áp dụng cho import như thêm mới)
    if (parsedRow.start_at && parsedRow.start_at < nowPlus1h) {
      errors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxStartTime, "Giờ bắt đầu")} - Phải muộn hơn hiện tại ít nhất 1 giờ.`
      );
    }

    // 2) Ràng buộc lặp
    if (parsedRow.repeatEnabled && parsedRow.repeatFrequency) {
      const freq = parsedRow.repeatFrequency;
      if (freq === "weekly" && (!parsedRow.repeatDaysOfWeek || parsedRow.repeatDaysOfWeek.length === 0)) {
        errors.push(`Dòng ${excelRowIdx}: ${cellRef(idxDows, "Ngày trong tuần")} - Lặp theo Tuần phải chọn ít nhất 1 ngày (ví dụ: T2).`);
      }
      if (freq === "monthly" && (!parsedRow.repeatDaysOfMonth || parsedRow.repeatDaysOfMonth.length === 0)) {
        errors.push(`Dòng ${excelRowIdx}: ${cellRef(idxDoms, "Ngày trong tháng")} - Lặp theo Tháng phải chọn ít nhất 1 ngày (ví dụ: 15).`);
      }
      if (freq === "yearly") {
        const yc = parsedRow.yearlyCount ?? 0;
        if (yc < 2) {
          errors.push(`Dòng ${excelRowIdx}: ${cellRef(idxYearlyCount, "Số lần lặp/năm")} - Lặp theo Năm cần 'Số lần lặp/năm' >= 2.`);
        }
      } else {
        if (!parsedRow.repeatEndDate) {
          errors.push(`Dòng ${excelRowIdx}: ${cellRef(idxRepeatEnd, "Ngày kết thúc lặp")} - Thiếu 'Ngày kết thúc lặp' cho kiểu lặp (${freq}).`);
        }
      }

      // 3) Tối thiểu sinh >= 2 lần lặp
      if (parsedRow.start_at && parsedRow.end_at) {
        const recInput = {
          enabled: true,
          frequency: parsedRow.repeatFrequency,
          interval: 1,
          daysOfWeek: parsedRow.repeatDaysOfWeek,
          daysOfMonth: parsedRow.repeatDaysOfMonth,
          endDate: parsedRow.repeatEndDate,
        } as any;
        let occs: Array<{ startAt: number; endAt: number }> = [];
        try {
          occs = generateOccurrences(parsedRow.start_at, parsedRow.end_at, recInput);
        } catch {
          occs = [{ startAt: parsedRow.start_at, endAt: parsedRow.end_at }];
        }
        if (occs.length < 2) {
          errors.push(
            `Dòng ${excelRowIdx}: ${cellRef(idxFreq, "Lặp theo")} - Cấu hình lặp chưa hợp lệ (cần tối thiểu 2 lần xuất hiện). Kiểm tra 'Ngày kết thúc lặp' hoặc lựa chọn ngày.`
          );
        }
      }
    }

    rowsOut.push(parsedRow);
  }

  // Kiểm tra trùng thời gian giữa các dòng import (cross-row)
  for (let i = 0; i < rowsOut.length; i++) {
    for (let j = i + 1; j < rowsOut.length; j++) {
      const a = rowsOut[i];
      const b = rowsOut[j];
      if (!a.start_at || !a.end_at || !b.start_at || !b.end_at) continue;
      if (a.start_at < b.end_at && b.start_at < a.end_at) {
        const rA = a.meta?.originalRow ?? "?";
        const rB = b.meta?.originalRow ?? "?";
        errors.push(`Dòng ${rA} & Dòng ${rB}: Trùng khoảng thời gian (các cột ${cellRef(idxStartTime, "Giờ bắt đầu")}, ${cellRef(idxEndTime, "Giờ kết thúc")}).`);
      }
    }
  }

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

    // --- Single Sheet: Công việc (Tasks + Reminders + Repetition) ---
    const taskData = [
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
        createCell("Tùy chọn. Nhắc trước. Đơn vị: phút/giờ/ngày. Ví dụ: '15 phút'."),
        createCell("Tùy chọn. Phương thức nhắc: Thông báo hoặc Chuông báo."),
        createCell("Tùy chọn. Tự động hoàn thành nếu hết hạn (Có/Không)."),
        createCell("Tùy chọn. Lặp theo: Ngày/Tuần/Tháng/Năm."),
        createCell("Tùy chọn. Cho lặp theo Tuần. Ngày trong tuần, phân cách bởi dấu phẩy: T2,T4,T6."),
        createCell("Tùy chọn. Cho lặp theo Tháng. Ngày trong tháng, phân cách bởi dấu phẩy: 1,15,28."),
        createCell("Tùy chọn. Ngày kết thúc lặp. Định dạng: dd/MM/yyyy."),
        createCell("Tùy chọn. Cho lặp theo Năm. Số nguyên 1..100."),
        createCell("Tùy chọn. Gộp nhiều ngày vào 1 streak (Có/Không)."),
      ],
      [
        createCell("Tiêu đề", mandatoryHeaderCellStyle),
        createCell("Mô tả"),
        createCell("Ngày bắt đầu", mandatoryHeaderCellStyle),
        createCell("Giờ bắt đầu", mandatoryHeaderCellStyle),
        createCell("Giờ kết thúc", mandatoryHeaderCellStyle),
        createCell("Mức độ"),
  createCell("Nhắc trước"),
  createCell("Phương thức nhắc"),
  createCell("Tự động hoàn thành"),
  createCell("Lặp theo"),
        createCell("Ngày trong tuần"),
        createCell("Ngày trong tháng"),
        createCell("Ngày kết thúc lặp"),
        createCell("Số lần lặp/năm"),
        createCell("Gộp nhiều ngày"),
      ],
    ];
    taskData.push([
      createCell("Ôn tập Toán"),
      createCell("Chương 1: Hàm số"),
      createCell("20/11/2025"),
      createCell("08:00"),
      createCell("09:00"),
      createCell("Trung bình"),
  createCell("15 phút"),
  createCell("Thông báo"),
  createCell("Có"),
  createCell("Tuần"),
      createCell("T2,T4"),
      createCell("") ,
      createCell("31/12/2025"),
      createCell(""),
      createCell("Không"),
    ]);
    const ws_tasks = XLSX.utils.aoa_to_sheet(taskData);
    ws_tasks["!rows"] = [
      { hpt: 65 }, // Dòng 1 (index 0) - Hướng dẫn tiếng Việt
      { hpt: 20 }, // Dòng 2 (index 1) - Tiêu đề cột
    ];
    XLSX.utils.book_append_sheet(wb, ws_tasks, "Công việc");
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