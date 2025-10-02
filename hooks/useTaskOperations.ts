import { useState, useEffect } from "react";
import { refreshNotifications } from '../utils/notificationScheduler';
import { Alert } from "react-native";
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
  const { addTask, editTask: updateTask, removeTask } = useTasks();

  // If parent supplies reminders context, reuse it; else create internal (backward compatible)
  const internalReminders = useReminders();
  const remindersCtx = injectedReminders || internalReminders;
  const { reminders, addReminder, editReminder, removeReminder, loadReminders } = remindersCtx as RemindersContext & { reminders: any[] };

  const { addRecurrence, editRecurrence, removeRecurrence, recurrences, loadRecurrences } = useRecurrences();

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

  const buildExistingRecurringOccurrences = (excludeTaskId?: number) => {
    const result: Array<{ taskTitle: string; start: number; end: number }> = [];
    if (!recurrences || recurrences.length === 0) return result;
    const recMap: Record<number, Recurrence> = {};
    recurrences.forEach(r => { if (r.id != null) recMap[r.id] = r; });
    for (const t of tasks) {
      if (!t.recurrence_id) continue;
      if (excludeTaskId && t.id === excludeTaskId) continue;
      const rec = recMap[t.recurrence_id];
      if (!rec) continue;
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
        endDate: rec.end_date,
      } as any;
      let occs: Array<{ startAt: number; endAt: number }> = [];
      try {
        occs = generateOccurrences(baseStart, baseEnd, recInput);
      } catch {
        occs = [{ startAt: baseStart, endAt: baseEnd }];
      }
      for (const occ of occs) {
        result.push({ taskTitle: t.title || '(Không tiêu đề)', start: occ.startAt, end: occ.endAt });
      }
    }
    return result;
  };

  const checkConflictsWithExistingRecurring = (candidate: Array<{ start: number; end: number }>, excludeTaskId?: number) => {
    const existing = buildExistingRecurringOccurrences(excludeTaskId);
    const baseRecurringStarts = new Set<number>();
    for (const t of tasks) {
      if (t.id && t.recurrence_id && (!excludeTaskId || t.id !== excludeTaskId) && t.start_at) {
        try { baseRecurringStarts.add(new Date(t.start_at).getTime()); } catch {}
      }
    }
    const conflicts: string[] = [];
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
    for (const ex of existing) {
      if (baseRecurringStarts.has(ex.start)) continue;
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
  const buildRecurringConflictMessage = (
    startAt: number,
    endAt: number,
    recurrenceConfig: { enabled: boolean; frequency: string; interval: number; daysOfWeek?: string[]; daysOfMonth?: string[]; endDate?: number },
    excludeTaskId?: number
  ): { hasConflict: boolean; conflictMessage: string } => {
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

    const existingRecurring = buildExistingRecurringOccurrences(excludeTaskId);
    const baseRecurringStarts = new Set<number>();
    for (const t of tasks) {
      if (t.id && t.recurrence_id && (!excludeTaskId || t.id !== excludeTaskId) && t.start_at) {
        try { baseRecurringStarts.add(new Date(t.start_at).getTime()); } catch {}
      }
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (ms: number) => {
      const d = new Date(ms);
      return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    };

    const blocks: string[] = [];
    for (const occ of occs) {
      const timeConf = checkTimeConflicts(occ.startAt, occ.endAt, tasks, (schedules as unknown as any), excludeTaskId);
      const recurringLines: string[] = [];
      for (const ex of existingRecurring) {
        if (baseRecurringStarts.has(ex.start)) continue; // bỏ occurrence gốc đã có trong timeConf
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
    if (!newTask.title.trim()) {
      if (options?.onNotify) options.onNotify({ tone:'error', title:'Lỗi', message:'Vui lòng nhập tiêu đề!' }); else Alert.alert("Lỗi", "Vui lòng nhập tiêu đề!");
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
        if (options?.onNotify) options.onNotify({ tone:'error', title:'Lỗi', message: timeError }); else Alert.alert("Lỗi", timeError);
        return false;
      }

      // Recurrence must have end date (yêu cầu: bắt buộc người dùng chọn ngày kết thúc)
      if (recurrenceConfig?.enabled && !recurrenceConfig.endDate) {
        if (options?.onNotify) options.onNotify({ tone:'warning', title:'Thiếu thông tin', message:'Vui lòng chọn ngày kết thúc cho lặp lại' }); else Alert.alert("Lỗi", "Vui lòng chọn ngày kết thúc cho lặp lại");
        return false;
      }

      // Check conflicts (single / recurring) với cách trình bày gom block. Với task KHÔNG lặp cũng phải kiểm tra giao với các task lặp khác.
      if (startAt && endAt) {
        let conflictRes: { hasConflict: boolean; conflictMessage: string };
        if (recurrenceConfig?.enabled) {
          conflictRes = buildRecurringConflictMessage(startAt, endAt, recurrenceConfig);
        } else {
          conflictRes = checkTimeConflicts(startAt, endAt, tasks, (schedules as unknown as any));
          // Bổ sung kiểm tra giao với các lần lặp của task khác (recurring) – trước đây chỉ làm khi chính task là recurring
          const recurringConflicts = checkConflictsWithExistingRecurring([{ start: startAt, end: endAt }]);
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
                'Trùng thời gian ⛔',
                `${formatted}\nBạn có muốn tiếp tục lưu không?`,
                [
                  { text: 'Hủy', style: 'cancel', onPress: () => resolve(false) },
                  { text: 'Tiếp tục', style: 'destructive', onPress: () => resolve(true) },
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
        });
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
  if (options?.onNotify) options.onNotify({ tone:'success', title:'Thành công', message:'Đã thêm công việc!' }); else Alert.alert("Thành công", "Đã thêm công việc!");
      return true;
    } catch (error) {
      if (options?.onNotify) options.onNotify({ tone:'error', title:'Lỗi', message:'Không thể thêm công việc' }); else Alert.alert("Lỗi", "Không thể thêm công việc");
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
      if (options?.onNotify) options.onNotify({ tone:'error', title:'Lỗi', message:'Vui lòng nhập tiêu đề!' }); else Alert.alert("Lỗi", "Vui lòng nhập tiêu đề!");
      return false;
    }

    setProcessing(true);
    try {
      const existing = tasks.find((t) => t.id === taskId);
      if (!existing) {
        if (options?.onNotify) options.onNotify({ tone:'error', title:'Lỗi', message:'Không tìm thấy công việc để sửa' }); else Alert.alert("Lỗi", "Không tìm thấy công việc để sửa");
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
        if (options?.onNotify) options.onNotify({ tone:'error', title:'Lỗi', message: timeError }); else Alert.alert("Lỗi", timeError);
        return false;
      }

      // Recurrence must have end date when enabled
      if (recurrenceConfig?.enabled && !recurrenceConfig.endDate) {
        if (options?.onNotify) options.onNotify({ tone:'warning', title:'Thiếu thông tin', message:'Vui lòng chọn ngày kết thúc cho lặp lại' }); else Alert.alert("Lỗi", "Vui lòng chọn ngày kết thúc cho lặp lại");
        return false;
      }

      // Conflicts (exclude itself) — dùng builder gom block như lúc thêm. Với task không lặp vẫn phải xét các occurrence của task lặp khác.
      if (startAt && endAt) {
        let conflictRes: { hasConflict: boolean; conflictMessage: string };
        if (recurrenceConfig?.enabled) {
          conflictRes = buildRecurringConflictMessage(startAt, endAt, recurrenceConfig, taskId);
        } else {
          conflictRes = checkTimeConflicts(startAt, endAt, tasks, (schedules as unknown as any), taskId);
          const recurringConflicts = checkConflictsWithExistingRecurring([{ start: startAt, end: endAt }], taskId);
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
                  'Trùng thời gian ⛔',
                  `${formatted}\nBạn có muốn tiếp tục lưu không?`,
                  [
                    { text: 'Hủy', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Tiếp tục', style: 'destructive', onPress: () => resolve(true) },
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
        };

        if (recurrence_id) {
          await editRecurrence(recurrence_id, payload);
        } else {
          recurrence_id = await addRecurrence(payload);
        }
      } else if (recurrence_id) {
        await removeRecurrence(recurrence_id);
        recurrence_id = undefined;
      }

      // Update task
      await updateTask(taskId, {
        ...updatedTask,
        status,
        start_at: startAt ? new Date(startAt).toISOString() : undefined,
        end_at: endAt ? new Date(endAt).toISOString() : undefined,
        recurrence_id,
      } as any);

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
  if (options?.onNotify) options.onNotify({ tone:'success', title:'Thành công', message:'Đã cập nhật công việc!' }); else Alert.alert("Thành công", "Đã cập nhật công việc!");
      return true;
    } catch (error) {
      if (options?.onNotify) options.onNotify({ tone:'error', title:'Lỗi', message:'Không thể cập nhật công việc' }); else Alert.alert("Lỗi", "Không thể cập nhật công việc");
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
          if (options?.onNotify) options.onNotify({ tone:'success', title:'Thành công', message:'Đã xóa công việc!' }); else Alert.alert("Thành công", "Đã xóa công việc!");
          resolve(true);
        } catch (error) {
          if (options?.onNotify) options.onNotify({ tone:'error', title:'Lỗi', message:'Không thể xóa công việc' }); else Alert.alert("Lỗi", "Không thể xóa công việc");
          resolve(false);
        }
      };
      if (options?.onConfirm) {
        options.onConfirm({
          tone: 'warning',
          title: 'Xác nhận',
          message: 'Bạn có chắc muốn xóa công việc này?',
          buttons: [
            { text: 'Hủy', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Xóa', style: 'destructive', onPress: () => performDelete() },
          ],
        });
      } else {
        Alert.alert('Xác nhận', 'Bạn có chắc muốn xóa công việc này?', [
          { text: 'Hủy', onPress: () => resolve(false) },
          { text: 'Xóa', style: 'destructive', onPress: () => performDelete() },
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