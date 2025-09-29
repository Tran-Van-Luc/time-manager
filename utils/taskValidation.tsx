import { Task } from "../types/Task";
import { Schedule } from "../types/Schedule";

export const validateTaskTime = (
  startAt?: number,
  endAt?: number,
  isEdit = false,
  originalStartAt?: number
): string | null => {
  // Removed 5-minute constraint; only validate logical order
  if (!startAt && !endAt) return null;
  
  if (endAt && startAt && endAt <= startAt) {
    return "Ngày giờ kết thúc phải sau ngày giờ bắt đầu!";
  }
  
  return null;
};

export const checkTimeConflicts = (
  startAt: number,
  endAt: number,
  tasks: Task[],
  schedules: Schedule[],
  excludeTaskId?: number
): { hasConflict: boolean; conflictMessage: string } => {
  const now = Date.now();
  
  const formatDateTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  // Kiểm tra trùng với tasks
  const overlappingTasks = tasks.filter((t) => {
    if (excludeTaskId && t.id === excludeTaskId) return false;
    
    const tStart = t.start_at ? new Date(t.start_at).getTime() : null;
    const tEnd = t.end_at ? new Date(t.end_at).getTime() : null;
    
    if (tEnd && tEnd < now) return false;
    if (!tStart || !tEnd) return false;
    
    return startAt < tEnd && endAt > tStart;
  });

  // Kiểm tra trùng với schedules
  const overlappingSchedules = schedules.filter((s) => {
    const sStart = s.startAt.getTime();
    const sEnd = s.endAt.getTime();
    return startAt < sEnd && endAt > sStart;
  });

  if (overlappingTasks.length === 0 && overlappingSchedules.length === 0) {
    return { hasConflict: false, conflictMessage: "" };
  }

  const tasksMsg = overlappingTasks
    .map((o) => {
      const oTitle = o.title || "(Không tiêu đề)";
      const oStart = o.start_at ? new Date(o.start_at) : null;
      const oEnd = o.end_at ? new Date(o.end_at) : null;
      return `• ${oTitle}\n${oStart ? `  Bắt đầu: ${formatDateTime(oStart)}\n` : ""}${oEnd ? `  Kết thúc: ${formatDateTime(oEnd)}\n` : ""}`;
    })
    .join("\n");

  const schedMsg = overlappingSchedules
    .map(
      (s) =>
        `• [Lịch học] ${s.subject || "(Không tên)"}\n  Bắt đầu: ${formatDateTime(s.startAt)}\n  Kết thúc: ${formatDateTime(s.endAt)}`
    )
    .join("\n");

  const conflictMessage = [tasksMsg, schedMsg].filter(Boolean).join("\n\n");

  return { hasConflict: true, conflictMessage };
};

export const shouldUpdateToInProgress = (startAt?: number): boolean => {
  if (!startAt) return false;
  const now = Date.now();
  // No ±5 minutes window anymore: switch to in-progress once start time arrives
  return startAt <= now;
};

// ---- Recurrence helpers for conflict checking across all occurrences ----

type RecurrenceInput = {
  enabled?: boolean;
  frequency?: string; // daily | weekly | monthly | yearly
  interval?: number; // default 1
  daysOfWeek?: string[]; // e.g., ["Mon","Wed"]
  daysOfMonth?: string[]; // e.g., ["1","15","31"]
  endDate?: number; // timestamp ms
};

const dayNameToIndex = (name: string): number | null => {
  const key = name.trim().toLowerCase();
  const map: Record<string, number> = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
  };
  return key in map ? map[key] : null;
};

const sameYMD = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function generateOccurrences(
  baseStartAt: number,
  baseEndAt: number,
  rec: RecurrenceInput
): Array<{ startAt: number; endAt: number }> {
  const occurrences: Array<{ startAt: number; endAt: number }> = [];
  const duration = Math.max(0, baseEndAt - baseStartAt);

  // If recurrence is not enabled or no endDate, just return the single occurrence
  if (!rec?.enabled || !rec.endDate || rec.endDate <= baseStartAt) {
    return [{ startAt: baseStartAt, endAt: baseEndAt }];
  }

  const freq = (rec.frequency || "daily").toLowerCase();
  const interval = Math.max(1, rec.interval || 1);
  const endBoundary = rec.endDate;

  const baseStart = new Date(baseStartAt);
  const baseEnd = new Date(baseEndAt);
  const timeH = baseStart.getHours();
  const timeM = baseStart.getMinutes();
  const timeS = baseStart.getSeconds();
  const timeMs = baseStart.getMilliseconds();

  const pushOcc = (d: Date) => {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), timeH, timeM, timeS, timeMs);
    const startMs = start.getTime();
    const endMs = startMs + duration;
    if (startMs <= endBoundary) {
      occurrences.push({ startAt: startMs, endAt: endMs });
    }
  };

  // Always include the first instance
  pushOcc(baseStart);

  // Cap to avoid runaway loops
  const MAX_OCCURRENCES = 500;

  if (freq === "daily") {
    let cursor = sameYMD(baseStart);
    let count = 1;
    while (count < MAX_OCCURRENCES) {
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + interval);
      if (cursor.getTime() > endBoundary) break;
      pushOcc(cursor);
      count++;
    }
  } else if (freq === "weekly") {
    const dowSet = new Set((rec.daysOfWeek || []).map((d) => dayNameToIndex(d)).filter((n): n is number => n !== null));
    // If none provided, default to the base start's DOW
    if (dowSet.size === 0) dowSet.add(baseStart.getDay());

    // Start from the Monday/Sunday of the first week that contains baseStart
    // We'll walk day-by-day to keep logic simple and robust with month/year boundaries
    let cursor = sameYMD(baseStart);
    let count = 1;
    while (count < MAX_OCCURRENCES && cursor.getTime() <= endBoundary) {
      // For current day, if it's in set and not before the base start date
      if (dowSet.has(cursor.getDay())) {
        // Avoid duplicating the very first day we already pushed
        const isSameDayAsBase = sameYMD(cursor).getTime() === sameYMD(baseStart).getTime();
        if (!isSameDayAsBase || occurrences.length === 0) {
          if (cursor.getTime() !== sameYMD(baseStart).getTime()) pushOcc(cursor);
        }
      }
      // advance one day; after finishing a week, skip (interval-1) weeks
      const prevWeek = getWeekNumber(cursor);
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
      const newWeek = getWeekNumber(cursor);
      if (newWeek !== prevWeek) {
        // Jump (interval-1) additional weeks
        cursor.setDate(cursor.getDate() + (interval - 1) * 7);
      }
      count++;
    }
  } else if (freq === "monthly") {
    const domList = (rec.daysOfMonth && rec.daysOfMonth.length
      ? rec.daysOfMonth.map((d) => parseInt(d, 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 31)
      : [baseStart.getDate()]
    ).sort((a, b) => a - b);

    let cursor = new Date(baseStart.getFullYear(), baseStart.getMonth(), 1);
    let count = 0;
    while (count < MAX_OCCURRENCES) {
      for (const dom of domList) {
        const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), dom, timeH, timeM, timeS, timeMs);
        if (candidate.getMonth() !== cursor.getMonth()) continue; // skip invalid day (e.g., 31 in Feb)
        if (candidate.getTime() < baseStartAt) continue; // don't produce before base
        if (candidate.getTime() > endBoundary) {
          count = MAX_OCCURRENCES; // break outer
          break;
        }
        pushOcc(candidate);
        if (occurrences.length >= MAX_OCCURRENCES) break;
      }
      if (occurrences.length >= MAX_OCCURRENCES) break;
      // advance months by interval
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + interval, 1);
      if (cursor.getTime() > endBoundary) break;
      count++;
    }
  } else if (freq === "yearly") {
    let cursor = new Date(baseStart);
    let count = 1;
    while (count < MAX_OCCURRENCES) {
      cursor = new Date(cursor.getFullYear() + interval, cursor.getMonth(), cursor.getDate(), timeH, timeM, timeS, timeMs);
      if (cursor.getTime() > endBoundary) break;
      pushOcc(cursor);
      count++;
    }
  }

  return occurrences;
}

function getWeekNumber(d: Date): number {
  // ISO week number approximation for grouping; used only to detect week boundary jumps
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday in current week decides the year
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date as any) - (yearStart as any)) / 86400000 + 1) / 7);
}

export function checkRecurringConflicts(
  baseStartAt: number,
  baseEndAt: number,
  tasks: Task[],
  schedules: Schedule[],
  rec: RecurrenceInput,
  excludeTaskId?: number
): { hasConflict: boolean; conflictMessage: string } {
  const occs = generateOccurrences(baseStartAt, baseEndAt, rec);
  let combined: string[] = [];
  for (const occ of occs) {
    const { hasConflict, conflictMessage } = checkTimeConflicts(occ.startAt, occ.endAt, tasks, schedules, excludeTaskId);
    if (hasConflict) {
      const d = new Date(occ.startAt);
      const e = new Date(occ.endAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      const head = `Lần lặp: ${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(e.getHours())}:${pad(e.getMinutes())} ${pad(e.getDate())}/${pad(e.getMonth() + 1)}/${e.getFullYear()}`;
      combined.push(`${head}\n${conflictMessage}`);
    }
  }
  return combined.length
    ? { hasConflict: true, conflictMessage: combined.join("\n\n") }
    : { hasConflict: false, conflictMessage: "" };
}