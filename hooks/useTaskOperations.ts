import { useState, useEffect } from "react";
import { refreshNotifications } from '../utils/notificationScheduler';
import { Alert } from "react-native";
import { useLanguage } from "../context/LanguageContext";
import { useTasks } from "./useTasks";
import { useReminders } from "./useReminders";
import { useRecurrences } from "./useRecurrences";
import {
  validateTaskTime,
  checkTimeConflicts,
  shouldUpdateToInProgress,
  checkRecurringConflicts,
  generateOccurrences,
} from "../utils/taskValidation";
import type { Recurrence } from "../types/Recurrence";
import type { Task } from "../types/Task";
import { setHabitMeta, getHabitCompletions, fmtYMD, autoCompletePastIfEnabled, computeHabitProgress, plannedHabitOccurrences } from "../utils/habits";
import { getRecurrenceById } from "../database/recurrence";
type ScheduleLike = { startAt: Date; endAt: Date; subject?: string };

interface NewTaskData {
  title: string;
  description?: string;
  start_at?: number;
  end_at?: number;
  priority: string;
  status: string;
}

interface ConflictLine {
  raw: string;
  kind: 'header' | 'bullet' | 'time' | 'other';
  title?: string;
  timeText?: string;
}
interface ConflictBlock { header?: string; lines: ConflictLine[] }
interface UseTaskOpsOptions {
  onConflict?: (info: { raw: string; blocks: ConflictBlock[]; resolve: (proceed: boolean)=>void }) => void;
  onNotify?: (info: { tone: 'error' | 'warning' | 'success' | 'info'; title: string; message: string; buttons?: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: ()=>void }[] }) => void;
  onConfirm?: (info: { tone?: 'error' | 'warning' | 'info'; title: string; message: string; buttons: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress: ()=>void }[] }) => void;
}

const parseConflictMessage = (msg: string): ConflictBlock[] => {
  if (!msg) return [];
  const blocks: ConflictBlock[] = [];
  const parts = msg.split(/\n\n+/); // blocks separated by blank line
  const headerRegex = /^Lần lặp: /;
  const bulletRegex = /^•\s+/;
  const timeLineRegex = /Thời gian: |Bắt đầu: |Kết thúc:/;
  for (const part of parts) {
    const lines = part.split(/\n/);
    let current: ConflictBlock = { lines: [] };
    for (const line of lines) {
      if (headerRegex.test(line)) {
        current.header = line.trim();
        current.lines.push({ raw: line, kind: 'header' });
        continue;
      }
      if (bulletRegex.test(line)) {
        // attempt extract title before first line break after bullet
        const title = line.replace(/^•\s+/, '').trim();
        current.lines.push({ raw: line, kind: 'bullet', title });
        continue;
      }
      if (timeLineRegex.test(line)) {
        current.lines.push({ raw: line, kind: 'time', timeText: line.trim() });
        continue;
      }
      current.lines.push({ raw: line, kind: 'other' });
    }
    blocks.push(current);
  }
  return blocks;
};

// Allow injecting existing reminders context to avoid duplicate state (fixes issue when adding reminder while editing)
interface RemindersContext {
  reminders: any[];
  addReminder: (...args: any[]) => Promise<any>;
  editReminder: (...args: any[]) => Promise<any>;
  removeReminder: (...args: any[]) => Promise<any>;
  loadReminders: () => Promise<any>;
}

export const useTaskOperations = (
  tasks: Task[],
  schedules: ScheduleLike[],
  options?: UseTaskOpsOptions,
  injectedReminders?: RemindersContext
) => {
  const { t, language } = useLanguage();
  const { addTask, editTask: updateTask, removeTask } = useTasks();

  // If parent supplies reminders context, reuse it; else create internal (backward compatible)
  const internalReminders = useReminders();
  const remindersCtx = injectedReminders || internalReminders;
  const { reminders, addReminder, editReminder, removeReminder, loadReminders } = remindersCtx as RemindersContext & { reminders: any[] };

  const { addRecurrence, editRecurrence, removeRecurrence, recurrences, loadRecurrences } = useRecurrences();

  // In-memory timers used to schedule auto-complete for non-recurring tasks.
  // Stored on global to survive multiple hook instances.
  (global as any).__autoCompleteTimers = (global as any).__autoCompleteTimers || {};

  // Background scanner: periodically run auto-complete for recurrences that have auto flag enabled.
  useEffect(() => {
    let stopped = false;
    const runScan = async () => {
      try {
        if (!recurrences || recurrences.length === 0) return;
        const now = Date.now();
        for (const rec of recurrences) {
          try {
            if ((rec as any).auto_complete_expired !== 1) continue;
            // find base task(s) for this recurrence
            const baseTasks = tasks.filter(t => t.recurrence_id === rec.id);
            for (const task of baseTasks) {
              try {
                // attempt to auto-complete past occurrences for this recurrence
                await autoCompletePastIfEnabled(task as any, rec as any);
                // After marking completions, if all occurrences are done and task is not completed, mark it completed
                const p = await computeHabitProgress(task as any, rec as any);
                if (p.total > 0 && p.completed >= p.total && task.status !== 'completed') {
                  // determine due time (last occurrence end)
                  let dueMs: number | undefined;
                  try {
                    const occs = plannedHabitOccurrences(task as any, rec as any);
                    if (occs && occs.length) dueMs = occs[occs.length - 1].endAt;
                  } catch {}
                  if (!dueMs && (rec as any).end_date) dueMs = new Date((rec as any).end_date).getTime();
                  if (!dueMs && task.end_at) dueMs = (typeof task.end_at === 'string' ? Date.parse(task.end_at) : task.end_at) as number;
                  let diffMinutes: number | undefined;
                  let completionStatus: 'early' | 'on_time' | 'late' | undefined;
                  if (dueMs) {
                    diffMinutes = Math.round((Date.now() - dueMs) / 60000);
                    if (diffMinutes < -1) completionStatus = 'early';
                    else if (diffMinutes > 1) completionStatus = 'late';
                    else completionStatus = 'on_time';
                  }
                  await updateTask(task.id!, {
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    completion_diff_minutes: diffMinutes,
                    completion_status: completionStatus,
                  } as any);
                  try { (global as any).__reloadTasks?.(); } catch {}
                }
              } catch {}
            }
          } catch {}
        }
      } catch {}
    };
    // run immediately then every 30s
    runScan();
    const id = setInterval(() => { if (!stopped) runScan(); }, 30000);
    return () => { stopped = true; clearInterval(id); };
  // depend on recurrences and tasks so it picks up new entries
  }, [recurrences, tasks]);

  // Load recurrences (and reminders if using internal) once
  useEffect(() => {
    if (loadRecurrences) loadRecurrences();
    if (!injectedReminders && loadReminders) {
      // Only auto-load reminders if we're using the internal context
      loadReminders();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseJsonArray = (val?: string): string[] => {
    if (!val) return [];
    try {
      const arr = JSON.parse(val);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  const buildExistingRecurringOccurrences = async (excludeTaskId?: number) => {
    const result: Array<{ taskTitle: string; start: number; end: number }> = [];
    if (!recurrences || recurrences.length === 0) return result;
    const recMap: Record<number, Recurrence> = {};
    recurrences.forEach(r => { if (r.id != null) recMap[r.id] = r; });
    for (const t of tasks) {
      if (!t.recurrence_id) continue;
      // If the base task is already completed, ignore its recurring occurrences
      // when building existing occurrences for conflict checks. This prevents
      // completed recurring tasks from triggering conflicts when adding new tasks.
      if ((t as any).status === 'completed') continue;
      if (excludeTaskId && t.id === excludeTaskId) continue;
      const rec = recMap[t.recurrence_id];
      if (!rec) continue;
      // Skip recurrences that are single-day auto-only (persisted so auto flag survives restarts)
      // Treat these as non-recurring for conflict checks and occurrence generation.
      if ((rec as any).auto_complete_expired === 1 && rec.start_date && rec.end_date && rec.start_date === rec.end_date) continue;
      const baseStart = t.start_at ? new Date(t.start_at).getTime() : undefined;
      if (!baseStart) continue;
      let baseEnd = t.end_at ? new Date(t.end_at).getTime() : undefined;
      if (!baseEnd) {
        const tmp = new Date(baseStart);
        tmp.setHours(23, 59, 59, 999);
        baseEnd = tmp.getTime();
      }
      if (!baseEnd || !rec.end_date) continue;
      const recInput = {
        enabled: true,
        frequency: rec.type || 'daily',
        interval: rec.interval || 1,
        daysOfWeek: parseJsonArray(rec.days_of_week),
        daysOfMonth: parseJsonArray(rec.day_of_month),
        endDate: rec.end_date ? (() => { const d = new Date(rec.end_date); d.setHours(23,59,59,999); return d.getTime(); })() : undefined,
      } as any;
      let occs: Array<{ startAt: number; endAt: number }> = [];
      try {
        occs = generateOccurrences(baseStart, baseEnd, recInput);
      } catch {
        occs = [{ startAt: baseStart, endAt: baseEnd }];
      }

      // Get completed dates for this recurrence and skip occurrences that are done
      let completions: Set<string> = new Set();
      try {
        if (rec.id != null) completions = await getHabitCompletions(rec.id);
      } catch {}

      for (const occ of occs) {
        try {
          const d = new Date(occ.startAt);
          d.setHours(0,0,0,0);
          const ymd = fmtYMD(d);
          if (completions.has(ymd)) continue; // skip already-completed occurrence
        } catch {}
        result.push({ taskTitle: t.title || '(Không tiêu đề)', start: occ.startAt, end: occ.endAt });
      }
    }
    return result;
  };

  const checkConflictsWithExistingRecurring = async (candidate: Array<{ start: number; end: number }>, excludeTaskId?: number) => {
    const existing = await buildExistingRecurringOccurrences(excludeTaskId);
    const conflicts: string[] = [];
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
    for (const ex of existing) {
      for (const c of candidate) {
        if (c.start < ex.end && c.end > ex.start) {
          const s = new Date(ex.start); const e = new Date(ex.end);
          const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
          if (sameDay) {
            conflicts.push(`• ${ex.taskTitle} (lặp)\n  Thời gian: ${pad(s.getHours())}:${pad(s.getMinutes())} - ${pad(e.getHours())}:${pad(e.getMinutes())} ${pad(s.getDate())}/${pad(s.getMonth() + 1)}/${s.getFullYear()}`);
          } else {
            conflicts.push(`• ${ex.taskTitle} (lặp)\n  Bắt đầu: ${fmt(ex.start)}\n  Kết thúc: ${fmt(ex.end)}`);
          }
          break;
        }
      }
    }
    return conflicts;
  };

  // Gom xung đột của toàn bộ các lần lặp vào cùng định dạng; tránh trường hợp
  // block đầu (lần lặp đầu tiên) bị tách riêng rồi các lần sau mới liệt kê task lặp.
  const buildRecurringConflictMessage = async (
    startAt: number,
    endAt: number,
    recurrenceConfig: { enabled: boolean; frequency: string; interval: number; daysOfWeek?: string[]; daysOfMonth?: string[]; endDate?: number },
    excludeTaskId?: number
  ): Promise<{ hasConflict: boolean; conflictMessage: string }> => {
    if (!recurrenceConfig?.enabled) return { hasConflict: false, conflictMessage: '' };
    let occs: Array<{ startAt: number; endAt: number }> = [];
    try {
      occs = generateOccurrences(startAt, endAt, {
        enabled: true,
        frequency: recurrenceConfig.frequency,
        interval: recurrenceConfig.interval,
        daysOfWeek: recurrenceConfig.daysOfWeek,
        daysOfMonth: recurrenceConfig.daysOfMonth,
        endDate: recurrenceConfig.endDate,
      });
    } catch {
      occs = [{ startAt, endAt }];
    }

    const existingRecurring = await buildExistingRecurringOccurrences(excludeTaskId);

    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (ms: number) => {
      const d = new Date(ms);
      return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    };

    const blocks: string[] = [];
    for (const occ of occs) {
      // For per-occurrence conflict display, exclude base recurring tasks from the
      // general time conflict check and rely on occurrence-level checks below.
      const nonRecurringTasks = tasks.filter(t => !t.recurrence_id);
      const timeConf = checkTimeConflicts(occ.startAt, occ.endAt, nonRecurringTasks as any, (schedules as unknown as any), excludeTaskId);
      const recurringLines: string[] = [];
      for (const ex of existingRecurring) {
        if (occ.startAt < ex.end && occ.endAt > ex.start) {
          const s = new Date(ex.start); const e = new Date(ex.end);
          const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
          if (sameDay) {
            recurringLines.push(`• ${ex.taskTitle} (lặp)\n  Thời gian: ${pad(s.getHours())}:${pad(s.getMinutes())} - ${pad(e.getHours())}:${pad(e.getMinutes())} ${pad(s.getDate())}/${pad(s.getMonth() + 1)}/${s.getFullYear()}`);
          } else {
            recurringLines.push(`• ${ex.taskTitle} (lặp)\n  Bắt đầu: ${fmt(ex.start)}\n  Kết thúc: ${fmt(ex.end)}`);
          }
        }
      }
      if (timeConf.hasConflict || recurringLines.length) {
        // If start & end occur on same day, show HH:MM - HH:MM DD/MM/YYYY
        const s = new Date(occ.startAt);
        const e = new Date(occ.endAt);
        const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
        const head = sameDay
          ? `Lần lặp: ${pad(s.getHours())}:${pad(s.getMinutes())} - ${pad(e.getHours())}:${pad(e.getMinutes())} ${pad(s.getDate())}/${pad(s.getMonth() + 1)}/${s.getFullYear()}`
          : `Lần lặp: ${fmt(occ.startAt)} - ${fmt(occ.endAt)}`;
        const parts: string[] = [];
        if (timeConf.conflictMessage) parts.push(timeConf.conflictMessage.trim());
        if (recurringLines.length) parts.push(recurringLines.join('\n'));
        blocks.push(`${head}\n${parts.join('\n\n')}`);
      }
    }

    return blocks.length
      ? { hasConflict: true, conflictMessage: blocks.join('\n\n') }
      : { hasConflict: false, conflictMessage: '' };
  };

  // (Optional) unified conflict builder code removed for clarity; can be re-added if needed.

  const [processing, setProcessing] = useState(false);

  // Helper: chỉ áp dụng DUY NHẤT giới hạn tối đa 7 ngày (10080 phút), không kiểm tra gì khác.
  // Không quan tâm startAt đã qua hay chưa, không so diff hiện tại.
  const ensureValidReminderLead = async (_startAt: number, reminderMinutes: number) => {
    const MAX_LEAD = 7 * 24 * 60; // 10080 phút
    if (reminderMinutes > MAX_LEAD) return MAX_LEAD;
    return reminderMinutes;
  };

  // Nén các cặp dòng "Bắt đầu:" / "Kết thúc:" cùng ngày thành một dòng "Thời gian: HH:MM - HH:MM DD/MM/YYYY"
  const compressSameDayRanges = (msg: string): string => {
    if (!msg) return msg;
    // Regex bắt 2 dòng liên tiếp có cùng indentation
    const pattern = /(^[ \t]*)Bắt đầu:\s*(\d{2}:\d{2}) (\d{1,2}\/\d{1,2}\/\d{4})\s*\n\1Kết thúc:\s*(\d{2}:\d{2}) (\d{1,2}\/\d{1,2}\/\d{4})/gm;
    return msg.replace(pattern, (full, indent, h1, date1, h2, date2) => {
      if (date1 === date2) {
        return `${indent}Thời gian: ${h1} - ${h2} ${date1}`;
      }
      return full; // khác ngày giữ nguyên
    });
  };

  const handleAddTask = async (
    newTask: NewTaskData,
    reminderConfig?: { enabled: boolean; time: number; method: string },
    recurrenceConfig?: { 
      enabled: boolean; 
      frequency: string; 
      interval: number; 
      daysOfWeek?: string[]; 
      daysOfMonth?: string[]; 
      endDate?: number;
    }
  ) => {
    const suppress = !!(global as any).__skipTaskPrompts;

    if (!newTask.title.trim()) {
      if (!suppress) {
        const title = language === 'en' ? 'Error' : 'Lỗi';
        const msg = language === 'en' ? 'Please enter a title!' : 'Vui lòng nhập tiêu đề!';
        if (options?.onNotify) options.onNotify({ tone:'error', title: title, message: msg }); else Alert.alert(title, msg);
      }
      return false;
    }

    setProcessing(true);

    try {
      const now = Date.now();
      let { start_at: startAt, end_at: endAt } = newTask;

      // Default start_at to now at save time if user hasn't chosen any time
      if (!startAt) {
        startAt = now;
      }

      // If user didn't provide end time, default to end of that start day
      if (!endAt && startAt) {
        const tmp = new Date(startAt);
        tmp.setHours(23, 59, 59, 999);
        endAt = tmp.getTime();
      }

      // Validate time
      const timeError = validateTaskTime(startAt, endAt);
      if (timeError) {
        if (!suppress) {
          const title = language === 'en' ? (t.tasks?.modal.invalidTimeTitle || 'Invalid time') : (t.tasks?.modal.invalidTimeTitle || 'Lỗi');
          const msg = timeError;
          if (options?.onNotify) options.onNotify({ tone:'error', title: title, message: msg }); else Alert.alert(title, msg);
        }
        return false;
      }

      // Recurrence end date requirement: always require user input
      if (recurrenceConfig?.enabled && !recurrenceConfig.endDate) {
        if (!suppress) {
          const title = language === 'en' ? (t.tasks?.modal.missingRepeatEndTitle || 'Missing information') : (t.tasks?.modal.missingRepeatEndTitle || 'Thiếu thông tin');
          const msg = language === 'en' ? (t.tasks?.modal.missingRepeatEndMessage || 'Please choose a repeat end date') : (t.tasks?.modal.missingRepeatEndMessage || 'Vui lòng chọn ngày kết thúc cho lặp lại');
          if (options?.onNotify) options.onNotify({ tone:'warning', title: title, message: msg }); else Alert.alert(title, msg);
        }
        return false;
      }

      // Check conflicts (single / recurring) với cách trình bày gom block. Với task KHÔNG lặp cũng phải kiểm tra giao với các task lặp khác.
      if (startAt && endAt) {
        let conflictRes: { hasConflict: boolean; conflictMessage: string };
        if (recurrenceConfig?.enabled) {
          conflictRes = await buildRecurringConflictMessage(startAt, endAt, recurrenceConfig);
        } else {
          // Exclude recurring base tasks from generic time conflicts; overlaps with
          // recurring tasks are handled via occurrence-level check below.
          const nonRecurringTasks = tasks.filter(t => !t.recurrence_id);
          conflictRes = checkTimeConflicts(startAt, endAt, nonRecurringTasks as any, (schedules as unknown as any));
          // Bổ sung kiểm tra giao với các lần lặp của task khác (recurring) – trước đây chỉ làm khi chính task là recurring
          const recurringConflicts = await checkConflictsWithExistingRecurring([{ start: startAt, end: endAt }]);
          if (recurringConflicts.length) {
            const extraMsg = recurringConflicts.join('\n');
            conflictRes = conflictRes.hasConflict
              ? { hasConflict: true, conflictMessage: `${conflictRes.conflictMessage}\n\n${extraMsg}` }
              : { hasConflict: true, conflictMessage: extraMsg };
          }
        }
        if (conflictRes.hasConflict) {
          if (suppress) return false;
          const formatted = compressSameDayRanges(conflictRes.conflictMessage);
          const proceed = await new Promise<boolean>((resolve)=>{
            if (options?.onConflict) {
              options.onConflict({ raw: formatted, blocks: parseConflictMessage(formatted), resolve });
            } else {
              Alert.alert(
                language === 'en' ? 'Time conflict ⛔' : 'Trùng thời gian ⛔',
                language === 'en' ? `${formatted}\nDo you want to proceed with saving?` : `${formatted}\nBạn có muốn tiếp tục lưu không?`,
                [
                  { text: t.tasks?.cancel || (language === 'en' ? 'Cancel' : 'Hủy'), style: 'cancel', onPress: () => resolve(false) },
                  { text: language === 'en' ? 'Proceed' : 'Tiếp tục', style: 'destructive', onPress: () => resolve(true) },
                ]
              );
            }
          });
          if (!proceed) return false;
        }
      }

      // Auto-update status only if user didn't choose another status (pending/default)
      let status = newTask.status;
      if ((!
        status || status === "pending"
      ) && startAt && shouldUpdateToInProgress(startAt)) {
        status = "in-progress";
      }

      // Handle recurrence
      let recurrence_id: number | undefined = undefined;
      if (recurrenceConfig?.enabled) {
        recurrence_id = await addRecurrence({
          type: recurrenceConfig.frequency,
          interval: recurrenceConfig.interval,
          days_of_week: recurrenceConfig.daysOfWeek?.length 
            ? JSON.stringify(recurrenceConfig.daysOfWeek) 
            : undefined,
          day_of_month: recurrenceConfig.daysOfMonth?.length 
            ? JSON.stringify(recurrenceConfig.daysOfMonth) 
            : undefined,
          start_date: startAt,
          end_date: recurrenceConfig.endDate,
          auto_complete_expired: (global as any).__habitFlags?.auto ? 1 : 0,
          merge_streak: (global as any).__habitFlags?.merge ? 1 : 0,
        });
        // Sau khi tạo recurrence mới, nạp lại recurrences để UI phản ánh cờ auto/merge ngay
        try { if (loadRecurrences) await loadRecurrences(); } catch {}
        // Persist habit meta to record when auto-complete was enabled for
        // newly created recurrence. If auto flag is true, set enabledAt to now.
        try {
          if (recurrence_id && (global as any).__habitFlags?.auto) {
            await setHabitMeta(recurrence_id, { auto: true, merge: !!(global as any).__habitFlags?.merge, enabledAt: Date.now() } as any);
          } else if (recurrence_id) {
            await setHabitMeta(recurrence_id, { auto: !!(global as any).__habitFlags?.auto, merge: !!(global as any).__habitFlags?.merge } as any);
          }
        } catch {}
      }

      // If user did NOT enable recurrence but enabled auto-complete, persist a single-day recurrence
      // so the auto flag is stored in SQLite while UI can keep 'repeat' toggled off.
      if (!recurrenceConfig?.enabled && (global as any).__habitFlags?.auto) {
        try {
          const singlePayload: Partial<Recurrence> = {
            type: 'daily',
            interval: 1,
            start_date: startAt,
            end_date: startAt,
            auto_complete_expired: 1,
            merge_streak: (global as any).__habitFlags?.merge ? 1 : 0,
          };
          recurrence_id = await addRecurrence(singlePayload as any);
          try { if (loadRecurrences) await loadRecurrences(); } catch {}
          // persist habit meta (enabledAt)
          try {
            if (recurrence_id) await setHabitMeta(recurrence_id, { auto: true, merge: !!(global as any).__habitFlags?.merge, enabledAt: Date.now() } as any);
          } catch {}
        } catch {}
      }

      // Add task
      const taskId = await addTask({
        ...newTask,
        status,
        start_at: startAt ? new Date(startAt).toISOString() : undefined,
        end_at: endAt ? new Date(endAt).toISOString() : undefined,
        is_deleted: 0,
        user_id: 1,
        recurrence_id,
      } as any);

      // Trigger immediate auto-complete run for recurring tasks when auto is enabled
      try {
        if (taskId && recurrence_id && (global as any).__habitFlags?.auto) {
          const rec = await getRecurrenceById(recurrence_id);
          if (rec) {
            const taskLike = {
              id: taskId,
              title: newTask.title,
              start_at: startAt ? new Date(startAt).toISOString() : undefined,
              end_at: endAt ? new Date(endAt).toISOString() : undefined,
              recurrence_id,
              status,
            } as unknown as Task;
            await autoCompletePastIfEnabled(taskLike, rec as any);
            // If fully completed after backfill, mark task completed now (no need to wait 30s scanner)
            const p = await computeHabitProgress(taskLike, rec as any);
            if (p.total > 0 && p.completed >= p.total && status !== 'completed') {
              let dueMs: number | undefined;
              try {
                const occs = plannedHabitOccurrences(taskLike as any, rec as any);
                if (occs && occs.length) dueMs = occs[occs.length - 1].endAt;
              } catch {}
              if (!dueMs && (rec as any).end_date) dueMs = new Date((rec as any).end_date).getTime();
              if (!dueMs && endAt) dueMs = endAt;
              let diffMinutes: number | undefined;
              let completionStatus: 'early' | 'on_time' | 'late' | undefined;
              if (dueMs) {
                diffMinutes = Math.round((Date.now() - dueMs) / 60000);
                if (diffMinutes < -1) completionStatus = 'early';
                else if (diffMinutes > 1) completionStatus = 'late';
                else completionStatus = 'on_time';
              }
              await updateTask(taskId, {
                status: 'completed',
                completed_at: new Date().toISOString(),
                completion_diff_minutes: diffMinutes,
                completion_status: completionStatus,
              } as any);
              try { (global as any).__reloadTasks?.(); } catch {}
            }
          }
        }
      } catch {}

      // If non-recurring and auto flag is enabled, schedule an in-memory timer to mark completed at endAt
      try {
        if (!recurrence_id && taskId && (global as any).__habitFlags?.auto) {
          const nowMs = Date.now();
          const endMs = endAt ?? nowMs;
          const delay = Math.max(0, endMs - nowMs);
          const timers = (global as any).__autoCompleteTimers as Record<number, any>;
          if (timers[taskId]) clearTimeout(timers[taskId]);
          if (delay === 0) {
            // mark immediately
            await updateTask(taskId, {
              status: 'completed',
              completed_at: new Date().toISOString(),
              completion_diff_minutes: endMs ? Math.round((Date.now() - endMs) / 60000) : undefined,
            } as any);
            try { (global as any).__reloadTasks?.(); } catch {}
          } else {
            timers[taskId] = setTimeout(async () => {
              try {
                await updateTask(taskId, {
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                  completion_diff_minutes: endMs ? Math.round((Date.now() - endMs) / 60000) : undefined,
                } as any);
                try { (global as any).__reloadTasks?.(); } catch {}
              } catch {}
            }, delay);
          }
        }
      } catch {}

      // Add reminder with lead-time validation
      if (reminderConfig?.enabled && taskId) {
        const validated = await ensureValidReminderLead(startAt!, reminderConfig.time);
        if (validated > 0) {
          await addReminder({
            task_id: taskId,
            remind_before: validated,
            method: reminderConfig.method,
            repeat_count: 1,
            is_active: 1,
          });
          await loadReminders();
        }
      }

  // Lập lịch lại thông báo sau khi thêm
  try { await refreshNotifications(); } catch {}
  if (!suppress) {
    const title = language === 'en' ? 'Success' : 'Thành công';
    const msg = language === 'en' ? 'Task added!' : 'Đã thêm công việc!';
    if (options?.onNotify) options.onNotify({ tone:'success', title: title, message: msg }); else Alert.alert(title, msg);
  }
      return true;
    } catch (error) {
      if (!suppress) {
        const title = language === 'en' ? 'Error' : 'Lỗi';
        const msg = language === 'en' ? 'Cannot add task' : 'Không thể thêm công việc';
        if (options?.onNotify) options.onNotify({ tone:'error', title: title, message: msg }); else Alert.alert(title, msg);
      }
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const handleEditTask = async (
    taskId: number,
    updatedTask: NewTaskData,
    reminderConfig?: { enabled: boolean; time: number; method: string },
    recurrenceConfig?: {
      enabled: boolean;
      frequency: string;
      interval: number;
      daysOfWeek?: string[];
      daysOfMonth?: string[];
      endDate?: number;
    }
  ) => {
    if (!updatedTask.title?.trim()) {
      const title = language === 'en' ? 'Error' : 'Lỗi';
      const msg = language === 'en' ? 'Please enter a title!' : 'Vui lòng nhập tiêu đề!';
      if (options?.onNotify) options.onNotify({ tone:'error', title: title, message: msg }); else Alert.alert(title, msg);
      return false;
    }

    setProcessing(true);
    try {
      const existing = tasks.find((t) => t.id === taskId);
      if (!existing) {
        const title = language === 'en' ? 'Error' : 'Lỗi';
        const msg = language === 'en' ? 'Task not found to edit' : 'Không tìm thấy công việc để sửa';
        if (options?.onNotify) options.onNotify({ tone:'error', title: title, message: msg }); else Alert.alert(title, msg);
        return false;
      }

      // Resolve times: if not provided, keep old
      let startAt =
        updatedTask.start_at !== undefined
          ? updatedTask.start_at
          : existing.start_at
          ? new Date(existing.start_at).getTime()
          : undefined;
      let endAt =
        updatedTask.end_at !== undefined
          ? updatedTask.end_at
          : existing.end_at
          ? new Date(existing.end_at).getTime()
          : undefined;

      // If user changed start time (or it moved forward) and did NOT explicitly set a new end time,
      // we should not reuse the old DB end time because it may now be before the new start.
      const originalStartAt = existing.start_at
        ? new Date(existing.start_at).getTime()
        : undefined;
      const startChanged =
        updatedTask.start_at !== undefined &&
        originalStartAt !== undefined &&
        updatedTask.start_at !== originalStartAt;

      // Case 1: start changed & user did not provide end_at -> set end to end-of-day of new start
      if (startChanged && updatedTask.end_at === undefined && startAt) {
        const tmp = new Date(startAt);
        tmp.setHours(23, 59, 59, 999);
        endAt = tmp.getTime();
      }

      // Case 2: existing (reused) endAt is now invalid (<= startAt) -> adjust to end-of-day
      if (startAt && endAt && endAt <= startAt) {
        const tmp = new Date(startAt);
        tmp.setHours(23, 59, 59, 999);
        endAt = tmp.getTime();
      }

      // Default missing start
      if (!startAt) startAt = Date.now();
      // If still no end time, default to end of day of (new) startAt
      if (!endAt && startAt) {
        const tmp = new Date(startAt);
        tmp.setHours(23, 59, 59, 999);
        endAt = tmp.getTime();
      }

      // originalStartAt already computed above

  // Validate time (edit mode relaxes unchanged start time)
      const timeError = validateTaskTime(startAt, endAt, true, originalStartAt);
      if (timeError) {
        const title = language === 'en' ? (t.tasks?.modal.invalidTimeTitle || 'Invalid time') : (t.tasks?.modal.invalidTimeTitle || 'Lỗi');
        const msg = timeError;
        if (options?.onNotify) options.onNotify({ tone:'error', title: title, message: msg }); else Alert.alert(title, msg);
        return false;
      }

      // Recurrence end date requirement (edit): require explicit endDate from user
      // Do NOT default to end-of-day; instead warn and abort so user must pick a date.
      if (recurrenceConfig?.enabled && !recurrenceConfig.endDate) {
        const title = language === 'en' ? (t.tasks?.modal.missingRepeatEndTitle || 'Missing information') : (t.tasks?.modal.missingRepeatEndTitle || 'Thiếu thông tin');
        const msg = language === 'en' ? (t.tasks?.modal.missingRepeatEndMessage || 'Please choose a repeat end date') : (t.tasks?.modal.missingRepeatEndMessage || 'Vui lòng chọn ngày kết thúc cho lặp lại');
        if (options?.onNotify) options.onNotify({ tone:'warning', title: title, message: msg }); else Alert.alert(title, msg);
        return false;
      }

      // Conflicts (exclude itself) — dùng builder gom block như lúc thêm. Với task không lặp vẫn phải xét các occurrence của task lặp khác.
      if (startAt && endAt) {
        let conflictRes: { hasConflict: boolean; conflictMessage: string };
        if (recurrenceConfig?.enabled) {
          conflictRes = await buildRecurringConflictMessage(startAt, endAt, recurrenceConfig, taskId);
        } else {
          // Exclude recurring base tasks from generic time conflicts; overlaps with
          // recurring tasks are handled via occurrence-level check below.
          const nonRecurringTasks = tasks.filter(t => !t.recurrence_id);
          conflictRes = checkTimeConflicts(startAt, endAt, nonRecurringTasks as any, (schedules as unknown as any), taskId);
          const recurringConflicts = await checkConflictsWithExistingRecurring([{ start: startAt, end: endAt }], taskId);
          if (recurringConflicts.length) {
            const extraMsg = recurringConflicts.join('\n');
            conflictRes = conflictRes.hasConflict
              ? { hasConflict: true, conflictMessage: `${conflictRes.conflictMessage}\n\n${extraMsg}` }
              : { hasConflict: true, conflictMessage: extraMsg };
          }
        }
        if (conflictRes.hasConflict) {
          const formatted = compressSameDayRanges(conflictRes.conflictMessage);
          const proceed = await new Promise<boolean>((resolve)=>{
            if (options?.onConflict) {
              options.onConflict({ raw: formatted, blocks: parseConflictMessage(formatted), resolve });
            } else {
              Alert.alert(
                language === 'en' ? 'Time conflict ⛔' : 'Trùng thời gian ⛔',
                language === 'en' ? `${formatted}\nDo you want to proceed with saving?` : `${formatted}\nBạn có muốn tiếp tục lưu không?`,
                [
                  { text: t.tasks?.cancel || (language === 'en' ? 'Cancel' : 'Hủy'), style: 'cancel', onPress: () => resolve(false) },
                  { text: language === 'en' ? 'Proceed' : 'Tiếp tục', style: 'destructive', onPress: () => resolve(true) },
                ]
              );
            }
          });
          if (!proceed) return false;
        }
      }

      // Status: keep existing if not changed; auto in-progress when start time arrives if still pending
      let status = updatedTask.status ?? existing.status ?? "pending";
      const userDidNotChangeStatus = !updatedTask.status || updatedTask.status === existing.status;
      if (userDidNotChangeStatus && (status === "pending" || !status) && shouldUpdateToInProgress(startAt)) {
        status = "in-progress";
      }

      // Recurrence
      let recurrence_id = existing.recurrence_id;
      if (recurrenceConfig?.enabled) {
        const payload = {
          type: recurrenceConfig.frequency,
          interval: recurrenceConfig.interval,
          days_of_week: recurrenceConfig.daysOfWeek?.length
            ? JSON.stringify(recurrenceConfig.daysOfWeek)
            : undefined,
          day_of_month: recurrenceConfig.daysOfMonth?.length
            ? JSON.stringify(recurrenceConfig.daysOfMonth)
            : undefined,
          start_date: startAt,
          end_date: recurrenceConfig.endDate,
          auto_complete_expired: (global as any).__habitFlags?.auto ? 1 : 0,
          merge_streak: (global as any).__habitFlags?.merge ? 1 : 0,
        };

        if (recurrence_id) {
          try {
            await editRecurrence(recurrence_id, payload);
            // Verify that the recurrence still exists (update may be a no-op if row was deleted)
            try {
              const exists = await getRecurrenceById(recurrence_id);
              if (!exists) {
                recurrence_id = await addRecurrence(payload);
              }
            } catch {
              // On any fetch error, fallback to creating a new recurrence
              recurrence_id = await addRecurrence(payload);
            }
          } catch {
            // If the old recurrence was removed or stale, create a new one and re-link
            recurrence_id = await addRecurrence(payload);
          }
        } else {
          recurrence_id = await addRecurrence(payload);
        }
        try { if (loadRecurrences) await loadRecurrences(); } catch {}
        // Persist habit meta to record when auto-complete was enabled. This
        // prevents retroactive marking of past occurrences when the user turns
        // on auto-complete during an edit. Only set enabledAt when auto flag is true.
        try {
          if (recurrence_id && (global as any).__habitFlags?.auto) {
            // store epoch ms of now as enabledAt
            await setHabitMeta(recurrence_id, { auto: true, merge: !!(global as any).__habitFlags?.merge, enabledAt: Date.now() } as any);
          } else if (recurrence_id) {
            // ensure meta reflects current flags (clear enabledAt when auto disabled)
            await setHabitMeta(recurrence_id, { auto: !!(global as any).__habitFlags?.auto, merge: !!(global as any).__habitFlags?.merge } as any);
          }
        } catch {}
      } else {
        // User disabled recurrence in the UI. If they left auto-complete on, persist/update a single-day recurrence
        // so the auto flag remains stored; otherwise remove existing recurrence as before.
        if ((global as any).__habitFlags?.auto) {
          const singlePayload: Partial<Recurrence> = {
            type: 'daily',
            interval: 1,
            start_date: startAt,
            end_date: startAt,
            auto_complete_expired: 1,
            merge_streak: (global as any).__habitFlags?.merge ? 1 : 0,
          };
          try {
            if (recurrence_id) {
              try { await editRecurrence(recurrence_id, singlePayload as any); } catch { /* fall through to create */ }
              try {
                const exists = await getRecurrenceById(recurrence_id);
                if (!exists) {
                  recurrence_id = await addRecurrence(singlePayload as any);
                }
              } catch {
                recurrence_id = await addRecurrence(singlePayload as any);
              }
            } else {
              recurrence_id = await addRecurrence(singlePayload as any);
            }
            try { if (loadRecurrences) await loadRecurrences(); } catch {}
            try { if (recurrence_id) await setHabitMeta(recurrence_id, { auto: true, merge: !!(global as any).__habitFlags?.merge, enabledAt: Date.now() } as any); } catch {}
          } catch {}
        } else if (recurrence_id) {
          await removeRecurrence(recurrence_id);
          recurrence_id = undefined;
          try { if (loadRecurrences) await loadRecurrences(); } catch {}
        }
      }

      // Update task
      await updateTask(taskId, {
        ...updatedTask,
        status,
        start_at: startAt ? new Date(startAt).toISOString() : undefined,
        end_at: endAt ? new Date(endAt).toISOString() : undefined,
        recurrence_id,
      } as any);

      // Trigger immediate auto-complete when auto is enabled on an edited recurring task
      try {
        if (recurrence_id && (global as any).__habitFlags?.auto) {
          const rec = await getRecurrenceById(recurrence_id);
          if (rec) {
            const taskLike = {
              id: taskId,
              title: updatedTask.title ?? existing.title,
              start_at: startAt ? new Date(startAt).toISOString() : undefined,
              end_at: endAt ? new Date(endAt).toISOString() : undefined,
              recurrence_id,
              status,
            } as unknown as Task;
            await autoCompletePastIfEnabled(taskLike, rec as any);
            const p = await computeHabitProgress(taskLike, rec as any);
            if (p.total > 0 && p.completed >= p.total && status !== 'completed') {
              let dueMs: number | undefined;
              try {
                const occs = plannedHabitOccurrences(taskLike as any, rec as any);
                if (occs && occs.length) dueMs = occs[occs.length - 1].endAt;
              } catch {}
              if (!dueMs && (rec as any).end_date) dueMs = new Date((rec as any).end_date).getTime();
              if (!dueMs && endAt) dueMs = endAt;
              let diffMinutes: number | undefined;
              let completionStatus: 'early' | 'on_time' | 'late' | undefined;
              if (dueMs) {
                diffMinutes = Math.round((Date.now() - dueMs) / 60000);
                if (diffMinutes < -1) completionStatus = 'early';
                else if (diffMinutes > 1) completionStatus = 'late';
                else completionStatus = 'on_time';
              }
              await updateTask(taskId, {
                status: 'completed',
                completed_at: new Date().toISOString(),
                completion_diff_minutes: diffMinutes,
                completion_status: completionStatus,
              } as any);
              try { (global as any).__reloadTasks?.(); } catch {}
            }
          }
        }
      } catch {}

      // After editing: schedule/clear timer for non-recurring auto-complete based on current flags
      try {
        const timers = (global as any).__autoCompleteTimers as Record<number, any>;
        if (!recurrence_id && (global as any).__habitFlags?.auto) {
          const nowMs = Date.now();
          const endMs = endAt ?? nowMs;
          const delay = Math.max(0, endMs - nowMs);
          if (timers[taskId]) clearTimeout(timers[taskId]);
          if (delay === 0) {
            await updateTask(taskId, {
              status: 'completed',
              completed_at: new Date().toISOString(),
              completion_diff_minutes: endMs ? Math.round((Date.now() - endMs) / 60000) : undefined,
            } as any);
            try { (global as any).__reloadTasks?.(); } catch {}
          } else {
            timers[taskId] = setTimeout(async () => {
              try {
                await updateTask(taskId, {
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                  completion_diff_minutes: endMs ? Math.round((Date.now() - endMs) / 60000) : undefined,
                } as any);
                try { (global as any).__reloadTasks?.(); } catch {}
              } catch {}
            }, delay);
          }
        } else {
          // if recurrence now exists or auto disabled, clear any timer
          if (timers && timers[taskId]) {
            clearTimeout(timers[taskId]);
            delete timers[taskId];
          }
        }
      } catch {}

      // Reminder (edit) with lead-time validation
      const taskReminder = reminders?.find((r) => r.task_id === taskId);
      if (reminderConfig?.enabled) {
        const validated = await ensureValidReminderLead(startAt!, reminderConfig.time);
        if (validated > 0) {
          if (taskReminder?.id) {
            await editReminder(taskReminder.id, {
              remind_before: validated,
              method: reminderConfig.method,
              repeat_count: 1,
              is_active: 1,
            });
          } else {
            await addReminder({
              task_id: taskId,
              remind_before: validated,
              method: reminderConfig.method,
              repeat_count: 1,
              is_active: 1,
            });
          }
          await loadReminders();
        } else if (taskReminder?.id) {
          // validated = 0 means skip reminder; remove existing if any
          await removeReminder(taskReminder.id);
          await loadReminders();
        }
      } else if (taskReminder?.id) {
        await removeReminder(taskReminder.id);
        await loadReminders();
      }

  // Lập lịch lại thông báo sau khi sửa
  try { await refreshNotifications(); } catch {}
  if (options?.onNotify) options.onNotify({ tone:'success', title: language === 'en' ? 'Success' : 'Thành công', message: language === 'en' ? 'Task updated!' : 'Đã cập nhật công việc!' }); else Alert.alert(language === 'en' ? 'Success' : 'Thành công', language === 'en' ? 'Task updated!' : 'Đã cập nhật công việc!');
      return true;
    } catch (error) {
      if (options?.onNotify) options.onNotify({ tone:'error', title: language === 'en' ? 'Error' : 'Lỗi', message: language === 'en' ? 'Cannot update task' : 'Không thể cập nhật công việc' }); else Alert.alert(language === 'en' ? 'Error' : 'Lỗi', language === 'en' ? 'Cannot update task' : 'Không thể cập nhật công việc');
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    return new Promise<boolean>((resolve) => {
      const performDelete = async () => {
        try {
          const task = tasks.find((t) => t.id === taskId);
          if (task?.recurrence_id) {
            await removeRecurrence(task.recurrence_id);
          }
          const taskReminders = reminders?.filter((r) => r.task_id === taskId) || [];
            for (const r of taskReminders) {
              if (r.id) await removeReminder(r.id);
            }
          await loadReminders();
          await removeTask(taskId);
          try { await refreshNotifications(); } catch {}
          {
            const title = language === 'en' ? 'Success' : 'Thành công';
            const msg = language === 'en' ? 'Task deleted!' : 'Đã xóa công việc!';
            if (options?.onNotify) options.onNotify({ tone:'success', title: title, message: msg }); else Alert.alert(title, msg);
          }
          resolve(true);
        } catch (error) {
          {
            const title = language === 'en' ? 'Error' : 'Lỗi';
            const msg = language === 'en' ? 'Cannot delete task' : 'Không thể xóa công việc';
            if (options?.onNotify) options.onNotify({ tone:'error', title: title, message: msg }); else Alert.alert(title, msg);
          }
          resolve(false);
        }
      };
      if (options?.onConfirm) {
        options.onConfirm({
          tone: 'warning',
          title: language === 'en' ? 'Confirm' : 'Xác nhận',
          message: language === 'en' ? 'Are you sure you want to delete this task?' : 'Bạn có chắc muốn xóa công việc này?',
          buttons: [
            { text: t.tasks?.cancel || (language === 'en' ? 'Cancel' : 'Hủy'), style: 'cancel', onPress: () => resolve(false) },
            { text: language === 'en' ? 'Delete' : 'Xóa', style: 'destructive', onPress: () => performDelete() },
          ],
        });
      } else {
        Alert.alert(language === 'en' ? 'Confirm' : 'Xác nhận', language === 'en' ? 'Are you sure you want to delete this task?' : 'Bạn có chắc muốn xóa công việc này?', [
          { text: t.tasks?.cancel || (language === 'en' ? 'Cancel' : 'Hủy'), onPress: () => resolve(false) },
          { text: language === 'en' ? 'Delete' : 'Xóa', style: 'destructive', onPress: () => performDelete() },
        ]);
      }
    });
  };

  return {
    handleAddTask,
    handleEditTask,
    handleDeleteTask,
    processing,
  };
};