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

  // Numeric input: 1 -> low, 2 -> medium, 3 -> high
  if (typeof s === "number") {
    if (s === 1) return "low";
    if (s === 2) return "medium";
    if (s === 3) return "high";
    return "medium";
  }

  // String input: accept exact tokens only, not substring matches
  const raw = String(s).trim().toLowerCase();
  const v = raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

  if (["1", "thap", "low"].includes(v)) return "low";
  if (["2", "trung binh", "medium"].includes(v)) return "medium";
  if (["3", "cao", "high"].includes(v)) return "high";

  // Default: medium (2)
  return "medium";
};

// Strict priority parser: only accept empty or exact 1/2/3 (number or string)
const parsePriorityStrict = (s: any): { priority?: "low" | "medium" | "high"; provided: boolean; invalid: boolean } => {
  if (s == null || String(s).trim() === "") return { provided: false, invalid: false };
  if (typeof s === "number") {
    if (s === 1) return { priority: "low", provided: true, invalid: false };
    if (s === 2) return { priority: "medium", provided: true, invalid: false };
    if (s === 3) return { priority: "high", provided: true, invalid: false };
    return { provided: true, invalid: true };
  }
  const str = String(s).trim();
  if (/^[1-3]$/.test(str)) {
    const n = parseInt(str, 10);
    if (n === 1) return { priority: "low", provided: true, invalid: false };
    if (n === 2) return { priority: "medium", provided: true, invalid: false };
    if (n === 3) return { priority: "high", provided: true, invalid: false };
  }
  return { provided: true, invalid: true };
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

// Strict parser for repeat frequency: only 1..4; empty -> no repeat
const parseRepeatFrequencyStrict = (
  s: any
): { freq?: "daily" | "weekly" | "monthly" | "yearly"; empty: boolean; invalid: boolean } => {
  if (s == null || String(s).trim() === "") return { empty: true, invalid: false };
  let n: number | undefined;
  if (typeof s === "number") n = s;
  else {
    const str = String(s).trim();
    if (/^\d+$/.test(str)) n = parseInt(str, 10);
  }
  if (n == null) return { empty: false, invalid: true };
  if (n === 1) return { freq: "daily", empty: false, invalid: false };
  if (n === 2) return { freq: "weekly", empty: false, invalid: false };
  if (n === 3) return { freq: "monthly", empty: false, invalid: false };
  if (n === 4) return { freq: "yearly", empty: false, invalid: false };
  return { empty: false, invalid: true };
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

// Parse 'Nhắc trước' with explicit unit for strict validation
const parseLeadInfoVi = (
  s: any
): { unit: "minute" | "hour" | "day"; value: number } | undefined => {
  if (s == null || String(s).trim() === "") return undefined;
  const v = String(s).trim().toLowerCase();
  const m = v.match(/^(\d+)\s*(phút|phut|p|giờ|gio|g|ngày|ngay|n)?/);
  if (!m) return undefined;
  const value = parseInt(m[1], 10);
  const unitRaw = m[2] || "phút";
  if (["giờ", "gio", "g"].includes(unitRaw)) return { unit: "hour", value };
  if (["ngày", "ngay", "n"].includes(unitRaw)) return { unit: "day", value };
  return { unit: "minute", value };
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

// Strict string format validator for dd/MM/yyyy, but still accept Date/Excel-number
const parseDateOnlyViStrict = (
  s: any
): { ms?: number; invalidFormat: boolean; provided: boolean } => {
  if (s == null || String(s).trim() === "") return { invalidFormat: false, provided: false };
  if (s instanceof Date || typeof s === "number") {
    const ms = parseDateOnlyVi(s);
    return ms != null ? { ms, invalidFormat: false, provided: true } : { invalidFormat: true, provided: true };
  }
  const str = String(s).trim();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return { invalidFormat: true, provided: true };
  const dd = parseInt(m[1], 10), MM = parseInt(m[2], 10), yyyy = parseInt(m[3], 10);
  const d = new Date(yyyy, MM - 1, dd, 0, 0, 0, 0);
  if (isNaN(d.getTime())) return { invalidFormat: true, provided: true };
  return { ms: d.getTime(), invalidFormat: false, provided: true };
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

// Strict numeric parser for weekly days: accepts only 2..8 (Mon..Sun)
const parseWeeklyDaysStrict = (s: any): { days?: string[]; invalid: boolean; provided: boolean } => {
  if (s == null || String(s).trim() === "") return { days: [], invalid: false, provided: false };
  const tokens = String(s)
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return { days: [], invalid: false, provided: false };
  const mapNumToDow = (n: number): string | undefined => {
    if (n === 2) return "Mon";
    if (n === 3) return "Tue";
    if (n === 4) return "Wed";
    if (n === 5) return "Thu";
    if (n === 6) return "Fri";
    if (n === 7) return "Sat";
    if (n === 8) return "Sun";
    return undefined;
  };
  const out: string[] = [];
  for (const tok of tokens) {
    if (!/^\d+$/.test(tok)) return { invalid: true, provided: true };
    const n = parseInt(tok, 10);
    const mapped = mapNumToDow(n);
    if (!mapped) return { invalid: true, provided: true };
    if (!out.includes(mapped)) out.push(mapped);
  }
  return { days: out, invalid: false, provided: true };
};

const parseDomList = (s: any): string[] => {
  if (!s) return [];
  return String(s)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
};

// Strict numeric parser for monthly days: accepts only 1..31
const parseMonthlyDaysStrict = (
  s: any
): { days?: string[]; invalid: boolean; provided: boolean } => {
  if (s == null || String(s).trim() === "") return { days: [], invalid: false, provided: false };
  const tokens = String(s)
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return { days: [], invalid: false, provided: false };
  const out: string[] = [];
  for (const tok of tokens) {
    if (!/^\d+$/.test(tok)) return { invalid: true, provided: true };
    const n = parseInt(tok, 10);
    if (n < 1 || n > 31) return { invalid: true, provided: true };
    const sTok = String(n);
    if (!out.includes(sTok)) out.push(sTok);
  }
  return { days: out, invalid: false, provided: true };
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

export async function parseFile(uri: string, options?: { dryRun?: boolean }): Promise<ParseResult> {
  const dryRun = !!options?.dryRun;
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
  const idxPriority = findHeaderIndex(["Mức độ", "Priority"]);
  const idxDows = findHeaderIndex(["Ngày trong tuần", "Days Of Week"]);
  const idxDoms = findHeaderIndex(["Ngày trong tháng", "Days Of Month"]);
  const idxRepeatEnd = findHeaderIndex(["Ngày kết thúc lặp", "Repeat End Date"]);
  const idxYearlyCount = findHeaderIndex(["Số lần lặp/năm", "Yearly Count"]);
  const idxMerge = findHeaderIndex(["Gộp nhiều ngày", "Merge Streak"]);
  const idxRemindBefore = findHeaderIndex(["Nhắc trước", "Remind Before"]);
  const idxMethod = findHeaderIndex(["Phương thức nhắc", "Method"]);

  // Đọc JSON với dòng header đã xác định; dòng header sẽ được dùng làm key
  const taskRows = XLSX.utils.sheet_to_json(ws_tasks, { defval: "", range: headerRowIdx });

  const errors: string[] = [];
  const rowsOut: ParsedRow[] = [];
  const nowPlus1h = Date.now() + 60 * 60 * 1000;
  const todayStartMs = new Date().setHours(0, 0, 0, 0);

  for (const [index, row] of (taskRows as any[]).entries()) {
    // Tính lại số dòng Excel thực tế cho thông báo lỗi: (headerRowIdx là 0-based)
    const excelRowIdx = headerRowIdx + 2 + index; // headerRowIdx=1 => bắt đầu từ dòng 3

    // Collect per-row errors so all issues are reported at once
    const rowErrors: string[] = [];

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
        rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxTitle, "Tiêu đề")} - Thiếu 'Tiêu đề'`);
      }
      // continue collecting other errors for the same row
    }

    const rawStartDate = getCell(row, "Ngày bắt đầu", ["Start Date"]);
    const rawStartTime = getCell(row, "Giờ bắt đầu", ["Start Time"]);
    const rawEndTime = getCell(row, "Giờ kết thúc", ["End Time"]);

    if (!rawStartDate) {
      rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxStartDate, "Ngày bắt đầu")} - Thiếu 'Ngày bắt đầu'`);
    }
    if (!rawStartTime) {
      rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxStartTime, "Giờ bắt đầu")} - Thiếu 'Giờ bắt đầu'`);
    }
    if (!rawEndTime) {
      rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxEndTime, "Giờ kết thúc")} - Thiếu 'Giờ kết thúc'`);
    }

    const startDateMs = parseDateOnlyVi(rawStartDate);
    const startTimeObj = parseTimeVi(rawStartTime);
    const endTimeObj = parseTimeVi(rawEndTime);

    if (!startDateMs) {
      const val = rawStartDate != null ? String(rawStartDate) : "";
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxStartDate, "Ngày bắt đầu")} - Sai định dạng (giá trị: '${val}', cần dd/MM/yyyy)`
      );
    }
    if (!startTimeObj) {
      const val = rawStartTime != null ? String(rawStartTime) : "";
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxStartTime, "Giờ bắt đầu")} - Sai định dạng (giá trị: '${val}', cần HH:MM)`
      );
    }
    if (!endTimeObj) {
      const val = rawEndTime != null ? String(rawEndTime) : "";
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxEndTime, "Giờ kết thúc")} - Sai định dạng (giá trị: '${val}', cần HH:MM)`
      );
    }

    const final_start_at = combineDateTimeMs(startDateMs, startTimeObj);
    const final_end_at = combineDateTimeMs(startDateMs, endTimeObj);

    if (!final_start_at || !final_end_at || final_end_at <= final_start_at) {
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxEndTime, "Giờ kết thúc")} - phải sau 'Giờ bắt đầu'`
      );
    }

    // Reminder fields (optional)
    const rawRemindBefore = getCell(row, "Nhắc trước", ["Remind Before"]);
    const rawMethod = getCell(row, "Phương thức nhắc", ["Method"]);
    const leadInfo = parseLeadInfoVi(rawRemindBefore);
    let reminderEnabled = false;
    let reminderTime = 0;
    let reminderMethod: "notification" | "alarm" | undefined = undefined;

    if (leadInfo) {
      // Validate ranges: phút 1..10080, giờ 1..168, ngày 1..7
      let validRange = false;
      if (leadInfo.unit === "minute") validRange = leadInfo.value >= 1 && leadInfo.value <= 10080;
      if (leadInfo.unit === "hour") validRange = leadInfo.value >= 1 && leadInfo.value <= 168;
      if (leadInfo.unit === "day") validRange = leadInfo.value >= 1 && leadInfo.value <= 7;
      if (!validRange) {
        const val = String(rawRemindBefore);
        const rangeText = leadInfo.unit === "minute" ? "1..10080 phút" : leadInfo.unit === "hour" ? "1..168 giờ" : "1..7 ngày";
        rowErrors.push(
          `Dòng ${excelRowIdx}: ${cellRef(idxRemindBefore, "Nhắc trước")} - Giá trị ngoài phạm vi cho phép (${rangeText}). Giá trị: '${val}'.`
        );
      } else {
        reminderEnabled = true;
        if (leadInfo.unit === "minute") reminderTime = leadInfo.value;
        if (leadInfo.unit === "hour") reminderTime = leadInfo.value * 60;
        if (leadInfo.unit === "day") reminderTime = leadInfo.value * 1440;

        // Determine method; only accept 1 or 2. Default to notification when omitted.
        if (rawMethod == null || String(rawMethod).trim() === "") {
          reminderMethod = "notification";
        } else {
          let methodNum: number | undefined;
          if (typeof rawMethod === "number") {
            methodNum = rawMethod;
          } else {
            const s = String(rawMethod).trim();
            if (/^\d+$/.test(s)) {
              methodNum = parseInt(s, 10);
            } else {
              rowErrors.push(
                `Dòng ${excelRowIdx}: ${cellRef(idxMethod, "Phương thức nhắc")} - Sai định dạng. Chỉ chấp nhận 1 (Thông báo) hoặc 2 (Chuông báo). Giá trị: '${s}'.`
              );
            }
          }
          if (methodNum != null) {
            if (methodNum === 1) reminderMethod = "notification";
            else if (methodNum === 2) reminderMethod = "alarm";
            else {
              rowErrors.push(
                `Dòng ${excelRowIdx}: ${cellRef(idxMethod, "Phương thức nhắc")} - Giá trị không hợp lệ. Chỉ chấp nhận 1 (Thông báo) hoặc 2 (Chuông báo). Giá trị: '${methodNum}'.`
              );
              reminderMethod = "notification";
            }
          } else {
            // Fallback to notification when unparsable but lead time valid
            reminderMethod = "notification";
          }
        }
      }
    } else if (rawRemindBefore != null && String(rawRemindBefore).trim() !== "") {
      const val = String(rawRemindBefore);
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxRemindBefore, "Nhắc trước")} - Sai định dạng. Hợp lệ: 'x phút', 'x giờ', hoặc 'x ngày' với x là số nguyên dương.`
      );
    }
    // If user provided a reminder method but remind-before is missing/invalid, report format and validity issues for the method too
    if (!leadInfo && rawMethod != null && String(rawMethod).trim() !== "") {
      const rawMethodStr = String(rawMethod).trim();
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxMethod, "Phương thức nhắc")} - 'Phương thức nhắc' chỉ áp dụng khi 'Nhắc trước' hợp lệ.`
      );
      if (!/^\d+$/.test(rawMethodStr)) {
        rowErrors.push(
          `Dòng ${excelRowIdx}: ${cellRef(idxMethod, "Phương thức nhắc")} - Sai định dạng. Chỉ chấp nhận 1 (Thông báo) hoặc 2 (Chuông báo). Giá trị: '${rawMethodStr}'.`
        );
      } else {
        const mn = parseInt(rawMethodStr, 10);
        if (mn !== 1 && mn !== 2) {
          rowErrors.push(
            `Dòng ${excelRowIdx}: ${cellRef(idxMethod, "Phương thức nhắc")} - Giá trị không hợp lệ. Chỉ chấp nhận 1 (Thông báo) hoặc 2 (Chuông báo). Giá trị: '${mn}'.`
          );
        }
      }
    }

    // Repeat fields (optional, enabled iff any repeat field present)
    const rawAuto = getCell(row, "Tự động hoàn thành", ["Auto Complete", "Tự động hoàn thành nếu hết hạn"]);
    // Strict: only 1 (Không) or 2 (Có). Default when empty: Không (false)
    let habitAuto: boolean = false;
    if (rawAuto != null && String(rawAuto).trim() !== "") {
      let num: number | undefined;
      if (typeof rawAuto === "number") {
        num = rawAuto;
      } else {
        const s = String(rawAuto).trim();
        if (/^\d+$/.test(s)) {
          num = parseInt(s, 10);
        } else {
          rowErrors.push(
            `Dòng ${excelRowIdx}: ${cellRef(idxAuto, "Tự động hoàn thành")} - Sai định dạng. Chỉ chấp nhận 1 (Không) hoặc 2 (Có). Giá trị: '${s}'.`
          );
        }
      }
      if (num != null) {
        if (num === 1) habitAuto = false; // Không
        else if (num === 2) habitAuto = true; // Có
        else {
          rowErrors.push(
            `Dòng ${excelRowIdx}: ${cellRef(idxAuto, "Tự động hoàn thành")} - Giá trị không hợp lệ. Chỉ chấp nhận 1 (Không) hoặc 2 (Có). Giá trị: '${num}'.`
          );
          habitAuto = false;
        }
      }
    }

    const rawFreq = getCell(row, "Lặp theo", ["Frequency"]);
    const rawDows = getCell(row, "Ngày trong tuần", ["Days Of Week"]);
    const rawDoms = getCell(row, "Ngày trong tháng", ["Days Of Month"]);
    const rawEndDate = getCell(row, "Ngày kết thúc lặp", ["Repeat End Date"]);
    const rawYearlyCount = getCell(row, "Số lần lặp/năm", ["Yearly Count"]);
    const rawMerge = getCell(row, "Gộp nhiều ngày", ["Merge Streak"]);
    const freqParsed = parseRepeatFrequencyStrict(rawFreq);
    if (freqParsed.invalid) {
      const val = rawFreq != null ? String(rawFreq) : "";
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxFreq, "Lặp theo")} - Sai định dạng. Chỉ chấp nhận 1 (Ngày), 2 (Tuần), 3 (Tháng), 4 (Năm). Giá trị: '${val}'.`
      );
    }
    const repeatEnabledFlag = !!freqParsed.freq;
    // Validate weekly days: must be numeric 2..8 and only allowed when weekly frequency
    const dowsStrict = parseWeeklyDaysStrict(rawDows);
    if (dowsStrict.provided && freqParsed.freq !== "weekly") {
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxDows, "Ngày trong tuần")} - 'Lặp theo' phải là Tuần (2) khi nhập 'Ngày trong tuần'.`
      );
      if (dowsStrict.invalid) {
        const val = rawDows != null ? String(rawDows) : "";
        rowErrors.push(
          `Dòng ${excelRowIdx}: ${cellRef(idxDows, "Ngày trong tuần")} - Sai định dạng. Chỉ chấp nhận các số 2,3,4,5,6,7,8 cách nhau bởi dấu phẩy. Giá trị: '${val}'.`
        );
      }
    }
    if (freqParsed.freq === "weekly" && dowsStrict.invalid) {
      const val = rawDows != null ? String(rawDows) : "";
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxDows, "Ngày trong tuần")} - Sai định dạng. Chỉ chấp nhận các số 2,3,4,5,6,7,8, cách nhau bởi dấu phẩy. Giá trị: '${val}'.`
      );
    }

    // Validate monthly days: must be numeric 1..31 and only allowed when monthly frequency
    const domsStrict = parseMonthlyDaysStrict(rawDoms);
    if (domsStrict.provided && freqParsed.freq !== "monthly") {
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxDoms, "Ngày trong tháng")} - 'Lặp theo' phải là Tháng (3) khi nhập 'Ngày trong tháng'.`
      );
      if (domsStrict.invalid) {
        const val = rawDoms != null ? String(rawDoms) : "";
        rowErrors.push(
          `Dòng ${excelRowIdx}: ${cellRef(idxDoms, "Ngày trong tháng")} - Sai định dạng. Chỉ chấp nhận các số 1..31, phân cách bởi dấu phẩy. Giá trị: '${val}'.`
        );
      }
    }
    if (freqParsed.freq === "monthly" && domsStrict.invalid) {
      const val = rawDoms != null ? String(rawDoms) : "";
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxDoms, "Ngày trong tháng")} - Sai định dạng. Chỉ chấp nhận các số 1..31, cách nhau bởi dấu phẩy. Giá trị: '${val}'.`
      );
    }

    // Strict parser for yearly count: only 2..100; require yearly when provided
    const parseYearlyCountStrict = (s: any): { count?: number; provided: boolean; invalid: boolean } => {
      if (s == null || String(s).trim() === "") return { provided: false, invalid: false };
      const str = String(s).trim();
      if (!/^\d+$/.test(str)) return { provided: true, invalid: true };
      const n = parseInt(str, 10);
      if (n < 2 || n > 100) return { provided: true, invalid: true };
      return { count: n, provided: true, invalid: false };
    };
    const ycStrict = parseYearlyCountStrict(rawYearlyCount);
    // Pre-compute yearly end date (inclusive end-of-day) when frequency is yearly
    const yearlyEndMs = (() => {
      if (freqParsed.freq !== "yearly") return undefined;
      if (!final_start_at) return undefined;
      const d = new Date(final_start_at);
      const yearsToAdd = ycStrict.count && ycStrict.count >= 2 ? ycStrict.count - 1 : 1;
      d.setFullYear(d.getFullYear() + yearsToAdd);
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    })();
    // Validate repeat end date rules (only for daily/weekly/monthly)
    const endDateStrict = parseDateOnlyViStrict(rawEndDate);
    // Compute inclusive end-of-day ms for non-yearly end date when provided
    const endDateInclusiveMs = (() => {
      if (!endDateStrict || endDateStrict.ms == null) return undefined;
      const d = new Date(endDateStrict.ms);
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    })();
    const needEndDate = freqParsed.freq === "daily" || freqParsed.freq === "weekly" || freqParsed.freq === "monthly";
    // If provided while freq is not daily/weekly/monthly -> error
    if (endDateStrict.provided && !needEndDate) {
      rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxRepeatEnd, "Ngày kết thúc lặp")} - 'Lặp theo' phải là 1 (Ngày), 2 (Tuần) hoặc 3 (Tháng) khi nhập 'Ngày kết thúc lặp'.`);
      if (endDateStrict.invalidFormat) {
        const val = rawEndDate != null ? String(rawEndDate) : "";
        rowErrors.push(
          `Dòng ${excelRowIdx}: ${cellRef(idxRepeatEnd, "Ngày kết thúc lặp")} - Sai định dạng (giá trị: '${val}', cần dd/MM/yyyy).`
        );
      }
    }
    // If need end date and provided but invalid format -> error
    if (needEndDate && endDateStrict.provided && endDateStrict.invalidFormat) {
      const val = rawEndDate != null ? String(rawEndDate) : "";
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxRepeatEnd, "Ngày kết thúc lặp")} - Sai định dạng (giá trị: '${val}', cần dd/MM/yyyy).`
      );
    }
    // If need end date and provided with valid format but not after today -> error
    if (needEndDate && endDateStrict.ms != null && endDateStrict.ms <= todayStartMs) {
      const val = rawEndDate != null ? String(rawEndDate) : "";
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxRepeatEnd, "Ngày kết thúc lặp")} - Phải lớn hơn ngày hiện tại.`
      );
    }
    if (ycStrict.provided && freqParsed.freq !== "yearly") {
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxYearlyCount, "Số lần lặp/năm")} - 'Lặp theo' phải là Năm (4) khi nhập 'Số lần lặp/năm'.`
      );
      if (ycStrict.invalid) {
        const val = rawYearlyCount != null ? String(rawYearlyCount) : "";
        rowErrors.push(
          `Dòng ${excelRowIdx}: ${cellRef(idxYearlyCount, "Số lần lặp/năm")} - Sai định dạng. Chỉ chấp nhận số nguyên 2..100. Giá trị: '${val}'.`
        );
      }
    }
    if (freqParsed.freq === "yearly" && ycStrict.invalid) {
      const val = rawYearlyCount != null ? String(rawYearlyCount) : "";
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxYearlyCount, "Số lần lặp/năm")} - Sai định dạng. Chỉ chấp nhận số nguyên trong khoảng 2..100. Giá trị: '${val}'.`
      );
    }

    // If user provided 'Gộp nhiều ngày' but repeat is not enabled/valid, report explicit error and format problems
    if (rawMerge != null && String(rawMerge).trim() !== "" && !repeatEnabledFlag) {
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxMerge, "Gộp nhiều ngày")} - 'Gộp nhiều ngày' chỉ áp dụng khi 'Lặp theo' hợp lệ (1..4).`
      );
      const rawMergeStr = String(rawMerge).trim();
      if (!/^\d+$/.test(rawMergeStr)) {
        rowErrors.push(
          `Dòng ${excelRowIdx}: ${cellRef(idxMerge, "Gộp nhiều ngày")} - Sai định dạng. Chỉ chấp nhận 1 (Không) hoặc 2 (Có). Giá trị: '${rawMergeStr}'.`
        );
      } else {
        const mn = parseInt(rawMergeStr, 10);
        if (mn !== 1 && mn !== 2) {
          rowErrors.push(
            `Dòng ${excelRowIdx}: ${cellRef(idxMerge, "Gộp nhiều ngày")} - Giá trị không hợp lệ. Chỉ chấp nhận 1 (Không) hoặc 2 (Có). Giá trị: '${mn}'.`
          );
        }
      }
    }

    // Validate priority column explicitly so user gets a clear error when invalid
    const rawPriority = getCell(row, "Mức độ", ["Priority"]);
    const priParsed = parsePriorityStrict(rawPriority);
    if (priParsed.invalid) {
      const val = rawPriority != null ? String(rawPriority) : "";
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxPriority, "Mức độ")} - Sai định dạng 'Mức độ'. Chỉ chấp nhận 1(Thấp), 2(Trung bình) hoặc 3(Cao). Giá trị: '${val}'.`
      );
    }

    const parsedRow: ParsedRow = {
      title: String(title),
      description: getCell(row, "Mô tả", ["Description"]) || "",
      start_at: final_start_at,
      end_at: final_end_at,
      // Use strict parsed priority when provided; default to medium when omitted
      priority: priParsed.provided ? priParsed.priority : mapPriorityVi(getCell(row, "Mức độ", ["Priority"])),
      status: "pending",
      habitMerge: (() => {
        if (!repeatEnabledFlag) return false;
        if (rawMerge == null || String(rawMerge).trim() === "") return false; // default Không when repeat is valid and merge empty
        let num: number | undefined;
        if (typeof rawMerge === "number") num = rawMerge;
        else if (/^\d+$/.test(String(rawMerge).trim())) num = parseInt(String(rawMerge).trim(), 10);
        if (num == null) {
          rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxMerge, "Gộp nhiều ngày")} - Sai định dạng. Chỉ chấp nhận 1 (Không) hoặc 2 (Có). Giá trị: '${String(rawMerge)}'.`);
          return false;
        }
        if (num === 1) return false;
        if (num === 2) return true;
        rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxMerge, "Gộp nhiều ngày")} - Giá trị không hợp lệ. Chỉ chấp nhận 1 (Không) hoặc 2 (Có). Giá trị: '${num}'.`);
        return false;
      })(),
      habitAuto,
      reminderEnabled,
      reminderTime: reminderEnabled ? reminderTime : undefined,
      reminderMethod: reminderEnabled ? reminderMethod : undefined,
      repeatEnabled: repeatEnabledFlag,
      repeatFrequency: repeatEnabledFlag ? freqParsed.freq : undefined,
      repeatDaysOfWeek: repeatEnabledFlag && freqParsed.freq === "weekly" && !dowsStrict.invalid ? (dowsStrict.days || []) : [],
      repeatDaysOfMonth: repeatEnabledFlag && freqParsed.freq === "monthly" && !domsStrict.invalid ? (domsStrict.days || []) : [],
      repeatEndDate: repeatEnabledFlag
        ? (needEndDate && !endDateStrict.invalidFormat
            ? endDateInclusiveMs
            : freqParsed.freq === "yearly"
            ? yearlyEndMs
            : undefined)
        : undefined,
      yearlyCount: repeatEnabledFlag && freqParsed.freq === "yearly" && !ycStrict.invalid ? ycStrict.count : undefined,
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
      rowErrors.push(
        `Dòng ${excelRowIdx}: ${cellRef(idxStartTime, "Giờ bắt đầu")} - Phải muộn hơn hiện tại ít nhất 1 giờ.`
      );
    }

    // 2) Ràng buộc lặp
    if (parsedRow.repeatEnabled && parsedRow.repeatFrequency) {
      const freq = parsedRow.repeatFrequency;
      if (freq === "weekly" && (!parsedRow.repeatDaysOfWeek || parsedRow.repeatDaysOfWeek.length === 0)) {
        rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxDows, "Ngày trong tuần")} - Lặp theo Tuần phải chọn ít nhất 1 ngày (ví dụ: 2).`);
      }
      if (freq === "monthly" && (!parsedRow.repeatDaysOfMonth || parsedRow.repeatDaysOfMonth.length === 0)) {
        rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxDoms, "Ngày trong tháng")} - Lặp theo Tháng phải chọn ít nhất 1 ngày (ví dụ: 15).`);
      }
      if (freq === "yearly") {
        // Only check when a count is present; strict validation handled earlier
        if (parsedRow.yearlyCount != null && parsedRow.yearlyCount < 2) {
          rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxYearlyCount, "Số lần lặp/năm")} - Lặp theo Năm cần 'Số lần lặp/năm' >= 2.`);
        }
      } else {
        if (!parsedRow.repeatEndDate) {
          rowErrors.push(`Dòng ${excelRowIdx}: ${cellRef(idxRepeatEnd, "Ngày kết thúc lặp")} - Thiếu 'Ngày kết thúc lặp' cho kiểu lặp (${freq}).`);
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
          endDate: parsedRow.repeatFrequency === "yearly" ? yearlyEndMs : parsedRow.repeatEndDate,
        } as any;
        let occs: Array<{ startAt: number; endAt: number }> = [];
        try {
          occs = generateOccurrences(parsedRow.start_at, parsedRow.end_at, recInput);
        } catch {
          occs = [{ startAt: parsedRow.start_at, endAt: parsedRow.end_at }];
        }
        if (occs.length < 2) {
          rowErrors.push(
            `Dòng ${excelRowIdx}: ${cellRef(idxFreq, "Lặp theo")} - Cấu hình lặp chưa hợp lệ (cần tối thiểu 2 lần xuất hiện). Kiểm tra 'Ngày kết thúc lặp' hoặc lựa chọn ngày.`
          );
        }
      }
    }

    // If there are any rowErrors, add them to global errors and do not include this parsed row
    if (rowErrors.length > 0) {
      // Aggregate messages per Excel row and column so output looks like:
      // Dòng N:
      //   Cột A (Tiêu đề) - lỗi1; lỗi2
      //   Cột B (Mức độ) - lỗi
      const perRow: Record<number, Record<string, { name: string; msgs: string[] }>> = {};
      const others: string[] = [];
      const rePrefix = /^Dòng\s+(\d+):\s+Cột\s+([A-Z]+)\s*\(([^)]*)\)\s*-\s*(.*)$/i;
      for (const r of rowErrors) {
        const m = r.match(rePrefix);
        if (m) {
          const rowNum = parseInt(m[1], 10);
          const col = m[2].toUpperCase();
          const name = m[3];
          const msg = m[4].trim();
          if (!perRow[rowNum]) perRow[rowNum] = {};
          if (!perRow[rowNum][col]) perRow[rowNum][col] = { name, msgs: [] };
          perRow[rowNum][col].msgs.push(msg);
        } else {
          others.push(r);
        }
      }

      const colLetterToIndex = (s: string) => {
        let idx = 0;
        for (let i = 0; i < s.length; i++) {
          const c = s.charCodeAt(i) - 64;
          if (c <= 0) continue;
          idx = idx * 26 + c;
        }
        return idx;
      };

      const rowNums = Object.keys(perRow).map((k) => parseInt(k, 10)).sort((a, b) => a - b);
      for (const rn of rowNums) {
        errors.push(`Dòng ${rn}:`);
        const cols = Object.keys(perRow[rn]).sort((a, b) => colLetterToIndex(a) - colLetterToIndex(b));
        for (const c of cols) {
          const entry = perRow[rn][c];
          // Combine multiple messages for the same column into one line
          const combinedMsg = entry.msgs.join('; ');
          errors.push(`  Cột ${c} (${entry.name}) - ${combinedMsg}`);
        }
      }

      for (const o of others) errors.push(o);
    } else {
      rowsOut.push(parsedRow);
    }
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

        const pad2 = (n: number) => String(n).padStart(2, "0");
        const formatDate = (ms: number) => {
          const d = new Date(ms);
          return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
        };
        const formatTime = (ms: number) => {
          const d = new Date(ms);
          return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
        };
        const formatRepeatText = (r: ParsedRow) => {
          if (!r.repeatEnabled || !r.repeatFrequency) return "(Không lặp)";
          const f = r.repeatFrequency;
          const dowToVi = (dow: string) => {
            if (!dow) return dow;
            const map: Record<string, string> = { Mon: 'Thứ 2', Tue: 'Thứ 3', Wed: 'Thứ 4', Thu: 'Thứ 5', Fri: 'Thứ 6', Sat: 'Thứ 7', Sun: 'CN' };
            return map[dow] || dow;
          };
          if (f === "daily") return "(Lặp: Hằng ngày)";
          if (f === "weekly") {
            const days = (r.repeatDaysOfWeek || []).map(dowToVi).join(", ");
            return days ? `(Lặp: Hằng tuần - ${days})` : "(Lặp: Hằng tuần)";
          }
          if (f === "monthly") {
            const days = (r.repeatDaysOfMonth || []).join(", ");
            return days ? `(Lặp: Hằng tháng - ngày ${days})` : "(Lặp: Hằng tháng)";
          }
          if (f === "yearly") return r.yearlyCount ? `(Lặp: Hằng năm - ${r.yearlyCount} lần)` : "(Lặp: Hằng năm)";
          return "";
        };

        const brief = (r: ParsedRow) => {
          const rowNum = r.meta?.originalRow ?? "?";
          const title = r.title ?? "(Không tiêu đề)";
          const date = r.start_at ? formatDate(r.start_at) : "(ngày ?)";
          const start = r.start_at ? formatTime(r.start_at) : "??:??";
          const end = r.end_at ? formatTime(r.end_at) : "??:??";
          const rep = formatRepeatText(r);
          return `Dòng ${rowNum}: '${title}' — ${date} ${start}–${end} ${rep}`;
        };

        errors.push(`Dòng ${rA} & Dòng ${rB}: Trùng khoảng thời gian giữa ${brief(a)} và ${brief(b)}.`);
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
        createCell("Tùy chọn. Chọn 1/2/3 tương ứng: 1=Thấp, 2=Trung bình, 3=Cao. Nếu để trống mặc định là 2 (Trung bình)."),
        createCell("Tùy chọn. Nhắc trước. Chỉ chấp nhận: x phút (1..10080), x giờ (1..168), x ngày (1..7). Không phân biệt hoa/thường. Ví dụ: '15 phút'."),
        createCell("Tùy chọn. Phương thức nhắc: 1=Thông báo, 2=Chuông báo. Chỉ áp dụng khi 'Nhắc trước' hợp lệ. Nếu để trống và 'Nhắc trước' hợp lệ thì mặc định là 1 (Thông báo)."),
        createCell("Tùy chọn. Tự động hoàn thành: 1=Không, 2=Có. Nếu để trống mặc định 1 (Không)."),
        createCell("Tùy chọn. Lặp theo: 1=Ngày, 2=Tuần, 3=Tháng, 4=Năm. Nếu để trống thì không lặp."),
        createCell("Tùy chọn. Cho lặp theo Tuần. Ngày trong tuần: chọn các số 2,3,4,5,6,7,8 (tương ứng Thứ 2..Chủ nhật), phân cách bởi dấu phẩy. Ví dụ: 2,4,6."),
        createCell("Tùy chọn. Cho lặp theo Tháng. Ngày trong tháng: chỉ các số 1..31, phân cách bởi dấu phẩy. Ví dụ: 1,15,28."),
        createCell("Tùy chọn. Ngày kết thúc lặp (chỉ áp dụng khi Lặp theo = 1/2/3). Định dạng: dd/MM/yyyy và phải lớn hơn ngày hiện tại."),
        createCell("Tùy chọn. Cho lặp theo Năm. Số lần lặp/năm: số nguyên 2..100."),
        createCell("Tùy chọn. Gộp nhiều ngày: 1=Không, 2=Có. Chỉ áp dụng khi 'Lặp theo' hợp lệ (1..4). Nếu để trống và 'Lặp theo' hợp lệ thì mặc định 1 (Không)."),
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
  createCell("1"),
  createCell("1"),
  createCell("2"),
      createCell("2,4"),
      createCell("") ,
      createCell("31/12/2025"),
      createCell(""),
      createCell("1"),
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