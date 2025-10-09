import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recurrence } from '../types/Recurrence';
import type { Task } from '../types/Task';
import { generateOccurrences } from './taskValidation';

const habitKey = (recurrenceId: number) => `habit:recurrence:${recurrenceId}`;
const habitMetaKey = (recurrenceId: number) => `habit:recurrence:${recurrenceId}:meta`;
const habitTimesKey = (recurrenceId: number) => `habit:recurrence:${recurrenceId}:times`;

export type HabitMeta = {
  auto?: boolean;
  merge?: boolean;
};

export async function setHabitMeta(recurrenceId: number, meta: HabitMeta) {
  try { await AsyncStorage.setItem(habitMetaKey(recurrenceId), JSON.stringify(meta)); } catch {}
}
export async function getHabitMeta(recurrenceId: number): Promise<HabitMeta | null> {
  try { const raw = await AsyncStorage.getItem(habitMetaKey(recurrenceId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function getHabitCompletions(recurrenceId: number): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(habitKey(recurrenceId));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export async function setHabitCompletions(recurrenceId: number, dates: Set<string>) {
  try {
    await AsyncStorage.setItem(habitKey(recurrenceId), JSON.stringify(Array.from(dates)));
  } catch {}
}

export type HabitTimes = Record<string, number>; // ymd -> completion timestamp (ms)
export async function getHabitCompletionTimes(recurrenceId: number): Promise<HabitTimes> {
  try {
    const raw = await AsyncStorage.getItem(habitTimesKey(recurrenceId));
    return raw ? (JSON.parse(raw) as HabitTimes) : {};
  } catch {
    return {};
  }
}
export async function setHabitCompletionTimes(recurrenceId: number, times: HabitTimes) {
  try {
    await AsyncStorage.setItem(habitTimesKey(recurrenceId), JSON.stringify(times));
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
  const set = await getHabitCompletions(recurrenceId);
  set.add(key);
  await setHabitCompletions(recurrenceId, set);
  const times = await getHabitCompletionTimes(recurrenceId);
  // Always store the actual completion moment
  times[key] = Date.now();
  await setHabitCompletionTimes(recurrenceId, times);
}

export async function unmarkHabitToday(recurrenceId: number, date?: Date) {
  const d = date || new Date();
  const key = fmtYMD(d);
  const set = await getHabitCompletions(recurrenceId);
  if (set.has(key)) {
    set.delete(key);
    await setHabitCompletions(recurrenceId, set);
  }
  const times = await getHabitCompletionTimes(recurrenceId);
  if (times[key] != null) {
    delete times[key];
    await setHabitCompletionTimes(recurrenceId, times);
  }
}

export async function isHabitDoneOnDate(recurrenceId: number, date?: Date): Promise<boolean> {
  const d = date || new Date();
  const key = fmtYMD(d);
  const set = await getHabitCompletions(recurrenceId);
  return set.has(key);
}

export async function markHabitRange(
  recurrenceId: number,
  from: Date,
  to: Date,
  task?: Task,
  rec?: Recurrence
) {
  const set = await getHabitCompletions(recurrenceId);
  const times = await getHabitCompletionTimes(recurrenceId);
  const cur = new Date(from);
  cur.setHours(0,0,0,0);
  const end = new Date(to);
  end.setHours(0,0,0,0);
  // Build a map of ymd -> occEndAt when context is available
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
    set.add(ymd);
    // Assign a sensible completion timestamp for each day
    if (occEndMap && occEndMap[ymd] != null) {
      const occEnd = occEndMap[ymd]!;
      times[ymd] = occEnd <= now ? occEnd : now; // on-time for past/completed days, 'now' for future (early)
    } else {
      // Fallback: record 'now' to indicate manual completion
      times[ymd] = now;
    }
    cur.setDate(cur.getDate() + 1);
  }
  await setHabitCompletions(recurrenceId, set);
  await setHabitCompletionTimes(recurrenceId, times);
}

// Remove completion marks for all days in [from, to]
export async function unmarkHabitRange(
  recurrenceId: number,
  from: Date,
  to: Date
) {
  const set = await getHabitCompletions(recurrenceId);
  const times = await getHabitCompletionTimes(recurrenceId);
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur.getTime() <= end.getTime()) {
    const ymd = fmtYMD(cur);
    if (set.has(ymd)) set.delete(ymd);
    if (times[ymd] != null) delete times[ymd];
    cur.setDate(cur.getDate() + 1);
  }
  await setHabitCompletions(recurrenceId, set);
  await setHabitCompletionTimes(recurrenceId, times);
}

export function plannedHabitDays(task: Task, rec: Recurrence): number[] {
  if (!task.start_at) return [];
  const baseStart = new Date(task.start_at).getTime();
  const baseEnd = task.end_at ? new Date(task.end_at).getTime() : (baseStart + 60*60*1000);
  const daysOfWeek = rec.days_of_week ? JSON.parse(rec.days_of_week) as string[] : undefined;
  const daysOfMonth = rec.day_of_month ? JSON.parse(rec.day_of_month) as string[] : undefined;
  const endDate = rec.end_date ? (() => { const d = new Date(rec.end_date); d.setHours(23,59,59,999); return d.getTime(); })() : undefined;
  const recInput = {
    enabled: true,
    frequency: rec.type || 'daily',
    interval: rec.interval || 1,
    daysOfWeek,
    daysOfMonth,
    endDate,
  } as any;
  const occs = generateOccurrences(baseStart, baseEnd, recInput);
  // return ms start days truncated
  return occs.map(o => {
    const d = new Date(o.startAt);
    d.setHours(0,0,0,0);
    return d.getTime();
  });
}

export function plannedHabitOccurrences(task: Task, rec: Recurrence): Array<{ startAt: number; endAt: number }> {
  if (!task.start_at) return [];
  const baseStart = new Date(task.start_at).getTime();
  const baseEnd = task.end_at ? new Date(task.end_at).getTime() : (baseStart + 60*60*1000);
  const daysOfWeek = rec.days_of_week ? JSON.parse(rec.days_of_week) as string[] : undefined;
  const daysOfMonth = rec.day_of_month ? JSON.parse(rec.day_of_month) as string[] : undefined;
  const endDate = rec.end_date ? (() => { const d = new Date(rec.end_date); d.setHours(23,59,59,999); return d.getTime(); })() : undefined;
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
  const planned = plannedHabitDays(task, rec);
  const totalDays = planned.length;
  const set = await getHabitCompletions(rec.id!);
  let completedDays = 0;
  let todayDone = false;
  for (const ms of planned) {
    const d = new Date(ms);
    const ymd = fmtYMD(d);
    if (set.has(ymd)) completedDays++;
    const today = fmtYMD(new Date());
    if (ymd === today && set.has(ymd)) todayDone = true;
  }
  const percentDays = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

  // If merge_streak enabled: show as cycles (0/1 or 1/1), while percent reflects day progress
  if (rec.merge_streak === 1) {
    const totalCycles = totalDays > 0 ? 1 : 0;
    const completedCycles = totalDays > 0 && completedDays === totalDays ? 1 : 0;
    // In merge mode, progress should be binary 0% or 100% matching 0/1 or 1/1
    const percent = completedCycles === 1 ? 100 : 0;
    return { completed: completedCycles, total: totalCycles, percent, todayDone };
  }

  // Default: day-based progress
  return { completed: completedDays, total: totalDays, percent: percentDays, todayDone };
}

export async function autoCompletePastIfEnabled(task: Task, rec: Recurrence) {
  if (!rec.id) return;
  const now = Date.now();
  const occs = plannedHabitOccurrences(task, rec);
  if (occs.length === 0) return;

  // If merge on: only auto-complete when the final occurrence has ended
  if (rec.merge_streak === 1) {
    const last = occs[occs.length - 1];
    if (last.endAt <= now) {
      // mark entire cycle as done (all days in range)
      const from = new Date(occs[0].startAt);
      const to = new Date(last.endAt);
      await markHabitRange(rec.id, from, to, task, rec);
    }
    return;
  }

  // Merge off: auto-complete each occurrence whose end has passed
  const set = await getHabitCompletions(rec.id);
  const times = await getHabitCompletionTimes(rec.id);
  let changed = false;
  for (const occ of occs) {
    if (occ.endAt <= now) {
      const d = new Date(occ.startAt);
      d.setHours(0,0,0,0);
      const ymd = fmtYMD(d);
      if (!set.has(ymd)) { set.add(ymd); changed = true; }
      // Record completion time as the end of the occurrence, so delta computes to ~on time
      if (!times[ymd]) { times[ymd] = occ.endAt; changed = true; }
    }
  }
  if (changed) {
    await setHabitCompletions(rec.id, set);
    await setHabitCompletionTimes(rec.id, times);
  }
}

// Compute today's completion delta relative to today's scheduled occurrence end time
export async function getTodayCompletionDelta(
  task: Task,
  rec: Recurrence,
  forDate?: Date
): Promise<{ status: 'early' | 'late' | 'on_time' | null; diffMinutes: number | null }> {
  if (!rec.id) return { status: null, diffMinutes: null };
  const occs = plannedHabitOccurrences(task, rec);
  if (!occs.length) return { status: null, diffMinutes: null };
  const base = forDate ? new Date(forDate) : new Date();
  const startDay = new Date(base); startDay.setHours(0,0,0,0);
  const endDay = new Date(startDay); endDay.setDate(endDay.getDate() + 1);
  const todaysOcc = occs.find(o => o.startAt >= startDay.getTime() && o.startAt < endDay.getTime());
  if (!todaysOcc) return { status: null, diffMinutes: null };
  const ymd = fmtYMD(base);
  const times = await getHabitCompletionTimes(rec.id);
  const t = times[ymd];
  if (!t) return { status: null, diffMinutes: null };
  const diffMinutes = Math.round((t - todaysOcc.endAt) / 60000);
  let status: 'early' | 'late' | 'on_time';
  if (diffMinutes < -1) status = 'early';
  else if (diffMinutes > 1) status = 'late';
  else status = 'on_time';
  return { status, diffMinutes };
}
