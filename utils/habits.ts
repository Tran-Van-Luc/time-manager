// utils/habits.ts
import type { Recurrence } from '../types/Recurrence';
import type { Task } from '../types/Task';
import { generateOccurrences } from './taskValidation';

// Import các hàm DB mới
import { getHabitData, setHabitData } from '../database/habit';
import { getRecurrenceById, updateRecurrence } from '../database/recurrence';

export type HabitMeta = {
  auto?: boolean;
  merge?: boolean;
  enabledAt?: number; // epoch ms when auto-complete was enabled; used to avoid retroactive marking
};

// Hàm setHabitMeta thay thế AsyncStorage.setItem
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

// Hàm getHabitMeta thay thế AsyncStorage.getItem
export async function getHabitMeta(recurrenceId: number): Promise<HabitMeta | null> {
  try {
    const rec = await getRecurrenceById(recurrenceId);
    if (!rec) return null;
    const raw = rec.auto_complete_enabled_at;
    let enabledAt: number | undefined;
    if (raw != null) {
      if (raw instanceof Date) {
        enabledAt = raw.getTime();
      } else {
        const n = Number(raw);
        enabledAt = Number.isNaN(n) ? undefined : n;
      }
    }
    return {
      auto: rec.auto_complete_expired === 1,
      merge: rec.merge_streak === 1,
      enabledAt,
    };
  } catch {
    return null;
  }
}

// Các hàm get/set completions và times bây giờ sẽ gọi chung vào getHabitData
export async function getHabitCompletions(recurrenceId: number): Promise<Set<string>> {
  try {
    const { completions } = await getHabitData(recurrenceId);
    return completions;
  } catch {
    return new Set();
  }
}

export async function setHabitCompletions(recurrenceId: number, dates: Set<string>) {
  try {
    // Phải lấy times hiện tại để không làm mất dữ liệu khi set
    const { times } = await getHabitData(recurrenceId);
    await setHabitData(recurrenceId, dates, times);
  } catch {}
}

export type HabitTimes = Record<string, number>; // ymd -> completion timestamp (ms)

export async function getHabitCompletionTimes(recurrenceId: number): Promise<HabitTimes> {
  try {
    const { times } = await getHabitData(recurrenceId);
    return times;
  } catch {
    return {};
  }
}

export async function setHabitCompletionTimes(recurrenceId: number, times: HabitTimes) {
  try {
    // Phải lấy completions hiện tại để không làm mất dữ liệu khi set
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

// Các hàm logic bên dưới gần như không thay đổi, chỉ thay cách chúng đọc/ghi dữ liệu
export async function markHabitToday(recurrenceId: number, date?: Date) {
  const d = date || new Date();
  const key = fmtYMD(d);
  const { completions, times } = await getHabitData(recurrenceId); // Đọc từ DB
  completions.add(key);
  times[key] = Date.now();
  await setHabitData(recurrenceId, completions, times); // Ghi lại vào DB
}

export async function unmarkHabitToday(recurrenceId: number, date?: Date) {
  const d = date || new Date();
  const key = fmtYMD(d);
  const { completions, times } = await getHabitData(recurrenceId); // Đọc từ DB
  if (completions.has(key)) {
    completions.delete(key);
  }
  if (times[key] != null) {
    delete times[key];
  }
  await setHabitData(recurrenceId, completions, times); // Ghi lại vào DB
}

export async function isHabitDoneOnDate(recurrenceId: number, date?: Date): Promise<boolean> {
  const d = date || new Date();
  const key = fmtYMD(d);
  const { completions } = await getHabitData(recurrenceId); // Đọc từ DB
  return completions.has(key);
}

export async function markHabitRange(
  recurrenceId: number,
  from: Date,
  to: Date,
  task?: Task,
  rec?: Recurrence
) {
  const { completions, times } = await getHabitData(recurrenceId); // Đọc từ DB
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

  await setHabitData(recurrenceId, completions, times); // Ghi lại vào DB
}

export async function unmarkHabitRange(
  recurrenceId: number,
  from: Date,
  to: Date
) {
  const { completions, times } = await getHabitData(recurrenceId); // Đọc từ DB
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

  await setHabitData(recurrenceId, completions, times); // Ghi lại vào DB
}


// ... các hàm plannedHabitDays, plannedHabitOccurrences, computeHabitProgress không thay đổi ...
// ...
// ...

// Chỉ sửa hàm autoCompletePastIfEnabled và getTodayCompletionDelta để chúng lấy dữ liệu đúng cách
export async function autoCompletePastIfEnabled(task: Task, rec: Recurrence) {
  if (!rec.id) return;

  const meta = await getHabitMeta(rec.id);
  const enabledAt = meta?.enabledAt;

  // FIX 1: Nếu tính năng chưa bao giờ được bật, không làm gì cả.
  if (!enabledAt) {
    return;
  }

  const now = Date.now();
  const occs = plannedHabitOccurrences(task, rec);
  if (occs.length === 0) return;

  if (rec.merge_streak === 1) {
    const last = occs[occs.length - 1];
    // Chỉ áp dụng nếu toàn bộ chuỗi streak kết thúc sau khi bật tính năng
    if (last.endAt <= now && last.endAt >= enabledAt) {
      const from = new Date(occs[0].startAt);
      const to = new Date(last.endAt);
      await markHabitRange(rec.id, from, to, task, rec);
    }
    return;
  }

  const { completions, times } = await getHabitData(rec.id);
  let changed = false;
  for (const occ of occs) {
    if (occ.endAt <= now && occ.endAt >= enabledAt) {
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
  const startDay = new Date(base); startDay.setHours(0,0,0,0);
  const endDay = new Date(startDay); endDay.setDate(endDay.getDate() + 1);
  const todaysOcc = occs.find(o => o.startAt >= startDay.getTime() && o.startAt < endDay.getTime());
  
  if (!todaysOcc) return { status: null, diffMinutes: null };
  
  const ymd = fmtYMD(base);
  const { times } = await getHabitData(rec.id); // Đọc từ DB
  const t = times[ymd];
  
  if (!t) return { status: null, diffMinutes: null };
  
  const diffMinutes = Math.round((t - todaysOcc.endAt) / 60000);
  let status: 'early' | 'late' | 'on_time';
  if (diffMinutes < -1) status = 'early';
  else if (diffMinutes > 1) status = 'late';
  else status = 'on_time';
  return { status, diffMinutes };
}

// Các hàm còn lại giữ nguyên
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
  const { completions } = await getHabitData(rec.id!); // Đọc từ DB
  let completedDays = 0;
  let todayDone = false;
  for (const ms of planned) {
    const d = new Date(ms);
    const ymd = fmtYMD(d);
    if (completions.has(ymd)) completedDays++;
    const today = fmtYMD(new Date());
    if (ymd === today && completions.has(ymd)) todayDone = true;
  }
  const percentDays = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

  if (rec.merge_streak === 1) {
    const totalCycles = totalDays > 0 ? 1 : 0;
    const completedCycles = totalDays > 0 && completedDays === totalDays ? 1 : 0;
    const percent = completedCycles === 1 ? 100 : 0;
    return { completed: completedCycles, total: totalCycles, percent, todayDone };
  }

  return { completed: completedDays, total: totalDays, percent: percentDays, todayDone };
}