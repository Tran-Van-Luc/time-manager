// utils/habits.ts

import type { Recurrence } from '../types/Recurrence';
import type { Task } from '../types/Task';
import { generateOccurrences } from './taskValidation';
import { getHabitData, setHabitData } from '../database/habit';
import { getRecurrenceById, updateRecurrence } from '../database/recurrence';

// ---------------------------------------------------------------------------
// Lightweight global event bus for habit progress changes so UI can update
// immediately without needing to reload tasks or rely on polling.
// ---------------------------------------------------------------------------
type HabitListener = (recurrenceId: number) => void;
declare global { // augment global for TypeScript
  // eslint-disable-next-line no-var
  var __habitProgressListeners: Set<HabitListener> | undefined;
}

function getListenerSet(): Set<HabitListener> {
  if (!global.__habitProgressListeners) {
    global.__habitProgressListeners = new Set();
  }
  return global.__habitProgressListeners;
}

export function subscribeHabitProgress(listener: HabitListener) {
  getListenerSet().add(listener);
}
export function unsubscribeHabitProgress(listener: HabitListener) {
  getListenerSet().delete(listener);
}
function emitHabitProgress(recurrenceId: number) {
  // Fire inside next microtask to avoid interfering with current state updates
  Promise.resolve().then(() => {
    for (const fn of getListenerSet()) {
      try { fn(recurrenceId); } catch { /* ignore */ }
    }
  });
}

// --- PATCH START: Thêm hàm chuẩn hóa timestamp ---
/**
 * Chuẩn hóa các giá trị thời gian có thể không nhất quán (ms, seconds, ISO string) thành milliseconds.
 * @param ts Giá trị thời gian cần chuẩn hóa.
 * @returns Timestamp dưới dạng milliseconds, hoặc null nếu không hợp lệ.
 */
function normalizeTimestampToMs(ts: any): number | null {
  if (ts === null || ts === undefined) return null;

  // Nếu là chuỗi ISO date
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? null : parsed;
  }

  // Nếu là số
  if (typeof ts === 'number') {
    // Nếu là số nhỏ (<= 10^11), giả định là seconds -> nhân 1000
    if (Math.abs(ts) < 1e12) {
      return ts * 1000;
    }
    // Nếu là số lớn, giả định đã là milliseconds
    return ts;
  }

  // Nếu là đối tượng Date
  if (ts instanceof Date) {
    return ts.getTime();
  }

  return null;
}
// --- PATCH END ---

export type HabitMeta = {
  auto?: boolean;
  merge?: boolean;
  enabledAt?: number;
};

export async function setHabitMeta(recurrenceId: number, meta: HabitMeta) {
  try {
    const updates: any = {
      auto_complete_expired: meta.auto ? 1 : 0,
      merge_streak: meta.merge ? 1 : 0,
    };
    if (meta.enabledAt !== undefined) updates.auto_complete_enabled_at = meta.enabledAt;
    await updateRecurrence(recurrenceId, updates);
  } catch {}
}

export async function getHabitMeta(recurrenceId: number): Promise<HabitMeta | null> {
  try {
    const rec = await getRecurrenceById(recurrenceId);
    if (!rec) return null;
    // Đã chuẩn hóa ở đây để đảm bảo `enabledAt` luôn là ms
    const enabledAt = normalizeTimestampToMs(rec.auto_complete_enabled_at);
    return {
      auto: rec.auto_complete_expired === 1,
      merge: rec.merge_streak === 1,
      enabledAt: enabledAt ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function getHabitCompletions(recurrenceId: number): Promise<Set<string>> {
  try {
    const { completions } = await getHabitData(recurrenceId);
    return completions;
  } catch { return new Set(); }
}

export async function setHabitCompletions(recurrenceId: number, dates: Set<string>) {
  try {
    const { times } = await getHabitData(recurrenceId);
    await setHabitData(recurrenceId, dates, times);
  } catch {}
}

export type HabitTimes = Record<string, number>;

export async function getHabitCompletionTimes(recurrenceId: number): Promise<HabitTimes> {
  try {
    const { times } = await getHabitData(recurrenceId);
    return times;
  } catch { return {}; }
}

export async function setHabitCompletionTimes(recurrenceId: number, times: HabitTimes) {
  try {
    const { completions } = await getHabitData(recurrenceId);
    await setHabitData(recurrenceId, completions, times);
  } catch {}
}

export function fmtYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function markHabitToday(recurrenceId: number, date?: Date) {
  const d = date || new Date();
  const key = fmtYMD(d);
  const { completions, times } = await getHabitData(recurrenceId);
  completions.add(key);
  times[key] = Date.now(); // Luôn là ms
  await setHabitData(recurrenceId, completions, times);
  emitHabitProgress(recurrenceId);
}
export async function unmarkHabitToday(recurrenceId: number, date?: Date) {
  const d = date || new Date();
  const key = fmtYMD(d);
  const { completions, times } = await getHabitData(recurrenceId);
  if (completions.has(key)) completions.delete(key);
  if (times[key] != null) delete times[key];
  await setHabitData(recurrenceId, completions, times);
  emitHabitProgress(recurrenceId);
}

export async function isHabitDoneOnDate(recurrenceId: number, date?: Date): Promise<boolean> {
  const d = date || new Date();
  const key = fmtYMD(d);
  const { completions } = await getHabitData(recurrenceId);
  return completions.has(key);
}

export async function markHabitRange(recurrenceId: number, from: Date, to: Date, task?: Task, rec?: Recurrence) {
  const { completions, times } = await getHabitData(recurrenceId);
  const cur = new Date(from);
  cur.setHours(0,0,0,0);
  const end = new Date(to);
  end.setHours(0,0,0,0);

  let occEndMap: Record<string, number> | null = null;
  if (task && rec) {
    occEndMap = {};
    for (const occ of plannedHabitOccurrences(task, rec)) {
      const d = new Date(occ.startAt);
      d.setHours(0,0,0,0);
      occEndMap[fmtYMD(d)] = occ.endAt;
    }
  }

  const now = Date.now();
  while (cur.getTime() <= end.getTime()) {
    const ymd = fmtYMD(cur);
    completions.add(ymd);
    if (occEndMap && occEndMap[ymd] != null) {
      const occEnd = occEndMap[ymd]!;
      times[ymd] = occEnd <= now ? occEnd : now;
    } else {
      times[ymd] = now;
    }
    cur.setDate(cur.getDate() + 1);
  }
  await setHabitData(recurrenceId, completions, times);
  emitHabitProgress(recurrenceId);
}

export async function unmarkHabitRange(recurrenceId: number, from: Date, to: Date) {
  const { completions, times } = await getHabitData(recurrenceId);
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  while (cur.getTime() <= end.getTime()) {
    const ymd = fmtYMD(cur);
    if (completions.has(ymd)) completions.delete(ymd);
    if (times[ymd] != null) delete times[ymd];
    cur.setDate(cur.getDate() + 1);
  }
  await setHabitData(recurrenceId, completions, times);
  emitHabitProgress(recurrenceId);
}

export async function autoCompletePastIfEnabled(task: Task, rec: Recurrence) {
  if (!rec.id) return;

  const meta = await getHabitMeta(rec.id);
  const enabledAtMs = meta?.enabledAt;

  if (!enabledAtMs) return;

  const nowMs = Date.now();
  const occs = plannedHabitOccurrences(task, rec);
  if (occs.length === 0) return;

  const normalizedOccs = occs.map(o => ({
    startAt: normalizeTimestampToMs(o.startAt)!,
    endAt: normalizeTimestampToMs(o.endAt)!,
  })).filter(o => o.startAt && o.endAt);

  // Chính sách: KHÔNG backfill ngược quá khứ. Chỉ tự động hoàn thành
  // những lần lặp có hạn (endAt) >= thời điểm bật (enabledAtMs) và đã kết thúc (endAt <= now).

  if (rec.merge_streak === 1) {
    const last = normalizedOccs[normalizedOccs.length - 1];
    // Chỉ auto-complete khi chu kỳ đã kết thúc và hạn cuối của chu kỳ >= enabledAt
    if (last.endAt <= nowMs && last.endAt >= enabledAtMs) {
      const idx = normalizedOccs.findIndex(o => o.endAt >= enabledAtMs);
      if (idx !== -1) {
        const from = new Date(normalizedOccs[idx].startAt);
        const to = new Date(last.endAt);
        await markHabitRange(rec.id, from, to, task, rec);
        emitHabitProgress(rec.id);
      }
    }
    return;
  }

  const { completions, times } = await getHabitData(rec.id);
  let changed = false;
  for (const occ of normalizedOccs) {
    // endAt <= now và endAt >= enabledAtMs => chỉ tự động hoàn thành các lần lặp kể từ khi bật
    if (occ.endAt <= nowMs && occ.endAt >= enabledAtMs) {
      const d = new Date(occ.startAt);
      d.setHours(0, 0, 0, 0);
      const ymd = fmtYMD(d);
      if (!completions.has(ymd)) {
        completions.add(ymd);
        changed = true;
      }
      if (!times[ymd]) {
        times[ymd] = occ.endAt;
        changed = true;
      }
    }
  }

  if (changed) {
    await setHabitData(rec.id, completions, times);
    emitHabitProgress(rec.id);
  }
}

export async function getTodayCompletionDelta(
  task: Task,
  rec: Recurrence,
  forDate?: Date
): Promise<{ status: 'early' | 'late' | 'on_time' | null; diffMinutes: number | null }> {
  if (!rec.id) return { status: null, diffMinutes: null };
  
  const occs = plannedHabitOccurrences(task, rec);
  if (!occs.length) return { status: null, diffMinutes: null };
  
  const base = forDate ? new Date(forDate) : new Date();
  base.setHours(12, 0, 0, 0);
  const startDay = new Date(base); startDay.setHours(0,0,0,0);
  const endDay = new Date(base); endDay.setHours(23,59,59,999);

  const todaysOcc = occs.find(o => {
      const startMs = normalizeTimestampToMs(o.startAt);
      return startMs && startMs >= startDay.getTime() && startMs <= endDay.getTime();
  });
  
  if (!todaysOcc) return { status: null, diffMinutes: null };
  
  const ymd = fmtYMD(base);
  const { times } = await getHabitData(rec.id);
  const completionTimestamp = times[ymd];
  
  if (completionTimestamp == null) return { status: null, diffMinutes: null };
  
  const completionMs = normalizeTimestampToMs(completionTimestamp);
  const endAtMs = normalizeTimestampToMs(todaysOcc.endAt);

  if (completionMs === null || endAtMs === null) {
      console.warn("Could not normalize timestamps for delta calculation.", { completionTimestamp, endAt: todaysOcc.endAt });
      return { status: null, diffMinutes: null };
  }
  
  // Apply fixed 23:59 cutoff semantics for the occurrence day
  const dueDate = new Date(endAtMs);
  const cutoffMs = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 23, 59, 0, 0).getTime();
  // Determine if completion and due are on the same calendar day
  const sameDay = (() => {
    const c = new Date(completionMs);
    return c.getFullYear() === dueDate.getFullYear() && c.getMonth() === dueDate.getMonth() && c.getDate() === dueDate.getDate();
  })();

  let status: 'early' | 'late' | 'on_time';
  let diffMinutes: number;

  if (completionMs <= endAtMs) {
    // Early: diff vs due (negative or zero)
    diffMinutes = Math.round((completionMs - endAtMs) / 60000);
    status = 'early';
  } else if (sameDay && completionMs <= cutoffMs) {
    // On-time window: 0 minutes
    diffMinutes = 0;
    status = 'on_time';
  } else {
    // Late: diff vs cutoff
    diffMinutes = Math.round((completionMs - cutoffMs) / 60000);
    if (diffMinutes < 0) diffMinutes = 0; // guard against odd clocks
    status = 'late';
  }

  return { status, diffMinutes };
}

export function plannedHabitDays(task: Task, rec: Recurrence): number[] {
  if (!task.start_at) return [];
  const occs = plannedHabitOccurrences(task, rec);
  return occs.map(o => {
    const d = new Date(o.startAt);
    d.setHours(0,0,0,0);
    return d.getTime();
  });
}

export function plannedHabitOccurrences(task: Task, rec: Recurrence): Array<{ startAt: number; endAt: number }> {
  if (!task.start_at) return [];

  const baseStart = normalizeTimestampToMs(task.start_at)!;
  const baseEnd = normalizeTimestampToMs(task.end_at) || (baseStart + 60*60*1000);
  const endDate = normalizeTimestampToMs(rec.end_date) ? (() => { const d = new Date(normalizeTimestampToMs(rec.end_date)!); d.setHours(23,59,59,999); return d.getTime(); })() : undefined;

  const daysOfWeek = rec.days_of_week ? JSON.parse(rec.days_of_week) as string[] : undefined;
  const daysOfMonth = rec.day_of_month ? JSON.parse(rec.day_of_month) as string[] : undefined;
  
  const recInput = {
    enabled: true,
    frequency: rec.type || 'daily',
    interval: rec.interval || 1,
    daysOfWeek,
    daysOfMonth,
    endDate,
  } as any;
  return generateOccurrences(baseStart, baseEnd, recInput);
}

export async function computeHabitProgress(task: Task, rec: Recurrence): Promise<{ completed: number; total: number; percent: number; todayDone: boolean; }>{
  if (!rec.id) return { completed: 0, total: 0, percent: 0, todayDone: false };
  
  const planned = plannedHabitDays(task, rec);
  const totalDays = planned.length;
  const { completions } = await getHabitData(rec.id!);
  let completedDays = 0;
  let todayDone = false;
  
  const today = fmtYMD(new Date());

  for (const ms of planned) {
    const d = new Date(ms);
    const ymd = fmtYMD(d);
    if (completions.has(ymd)) {
      completedDays++;
      if (ymd === today) {
        todayDone = true;
      }
    }
  }
  
  const percentDays = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

  if (rec.merge_streak === 1) {
    const totalCycles = totalDays > 0 ? 1 : 0;
    const completedCycles = totalDays > 0 && completedDays > 0 ? 1 : 0; // Any completion counts for the cycle
    const percent = completedCycles === 1 ? 100 : 0;
    return { completed: completedCycles, total: totalCycles, percent, todayDone };
  }

  return { completed: completedDays, total: totalDays, percent: percentDays, todayDone };
}