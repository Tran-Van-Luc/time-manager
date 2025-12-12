import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert } from "react-native";
import type { Task } from "../../types/Task";
import type { Recurrence } from "../../types/Recurrence";
import { REPEAT_OPTIONS } from "../../constants/taskConstants";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import {
  autoCompletePastIfEnabled,
  computeHabitProgress,
  getTodayCompletionDelta,
  isHabitDoneOnDate,
  markHabitRange,
  markHabitToday,
  plannedHabitOccurrences,
  unmarkHabitRange,
  unmarkHabitToday,
  subscribeHabitProgress,
  unsubscribeHabitProgress,
} from "../../utils/habits";
import { useTasks } from "../../hooks/useTasks";

interface TaskDetailModalProps {
  visible: boolean;
  task: Task | null;
  allTasks: Task[];
  reminders: any[];
  recurrences: any[];
  onClose: () => void;
  onStatusChange: (taskId: number, status: Task["status"]) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  onInlineAlert?: (info: { tone: 'error'|'warning'|'success'|'info'; title: string; message: string }) => void;
}

export default function TaskDetailModal({
  visible,
  task,
  allTasks,
  reminders,
  recurrences,
  onClose,
  onStatusChange,
  onEdit,
  onDelete,
  onInlineAlert,
}: TaskDetailModalProps) {
  // --- Start of Hooks ---
  const { t } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const colors = {
    backdrop: 'rgba(0,0,0,0.4)',
    surface: isDark ? '#0b1220' : '#FFFFFF',
    text: isDark ? '#E6EEF8' : '#111827',
    muted: isDark ? '#C6D4E1' : '#374151',
    border: isDark ? '#223049' : '#E5E7EB',
    chipGrayBg: isDark ? '#1f2937' : '#e5e7eb',
    chipGrayText: isDark ? '#C6D4E1' : '#6b7280',
    chipBlueBg: isDark ? '#1e3a8a' : '#dbeafe',
    chipBlueText: isDark ? '#93c5fd' : '#2563eb',
    chipGreenBg: isDark ? '#064e3b' : '#dcfce7',
    chipGreenText: isDark ? '#86efac' : '#16a34a',
    chipPurpleBg: isDark ? '#4c1d95' : '#ede9fe',
    chipPurpleText: isDark ? '#c4b5fd' : '#6d28d9',
  };
  
  const { editTask } = useTasks();

  // End-of-day cutoff key and helpers (keep in sync with Completed screen)
  const CUT_OFF_KEY = 'endOfDayCutoff';
  const CUT_OFF_ENABLED_KEY = 'endOfDayCutoffEnabled';
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;

  const isSameLocalDate = (ms1?: number | null, ms2?: number | null) => {
    if (!ms1 || !ms2) return false;
    const a = new Date(ms1);
    const b = new Date(ms2);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };

  const cutoffForDateFromString = (dateMs: number, cutoffString?: string | null) => {
    try {
      const s = cutoffString || '23:00';
      const parts = s.split(':');
      const h = parseInt(parts[0] || '23', 10);
      const m = parseInt(parts[1] || '0', 10);
      if (Number.isNaN(h) || Number.isNaN(m)) return null as number | null;
      const d = new Date(dateMs);
      d.setHours(h, m, 0, 0);
      return d.getTime();
    } catch {
      return null;
    }
  };

  const [habitProgress, setHabitProgress] = useState<{ completed: number; total: number; percent: number; todayDone: boolean } | null>(null);
  const [todayDelta, setTodayDelta] = useState<{ status: 'early' | 'late' | 'on_time' | null; diffMinutes: number | null } | null>(null);
  const autoCompletingRef = useRef(false);

  // Dependency signature for recurrence affecting occurrences
  const recDeps = useMemo(() => {
    if (!task || !task.recurrence_id) return 'none'; // Added conditional check
    const recItem = recurrences.find((r: Recurrence) => r.id === task.recurrence_id);
    if (!recItem) return 'none';

    const rec = recItem as Recurrence;
    const parts = [
      rec.id,
      rec.type,
      rec.interval,
      rec.days_of_week || '',
      rec.day_of_month || '',
      rec.start_date ? new Date(rec.start_date).getTime() : 0,
      rec.end_date ? new Date(rec.end_date).getTime() : 0,
      (rec as any).merge_streak,
      (rec as any).auto_complete_expired,
    ];
    return JSON.stringify(parts);
  }, [task?.recurrence_id, recurrences]);

  const rec: Recurrence | undefined = task?.recurrence_id
    ? recurrences.find((r: Recurrence) => r.id === task.recurrence_id)
    : undefined;

  const mergeStreak = !!rec && (rec as any).merge_streak === 1;
  const autoExpired = !!rec && (rec as any).auto_complete_expired === 1;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (rec?.id && task) {
        try {
          if (autoExpired) await autoCompletePastIfEnabled(task, rec);
          const p = await computeHabitProgress(task, rec);
          if (!cancelled) setHabitProgress(p);
          if (!cancelled) {
            // If opened from week view, prefer that occurrence date
            const sel = (task as any)._occurrenceStart ? new Date((task as any)._occurrenceStart) : undefined;
            const d = await getTodayCompletionDelta(task, rec, sel);
            setTodayDelta(d);
          }
        } catch {}
      } else {
        if (!cancelled) setHabitProgress(null);
        if (!cancelled) setTodayDelta(null);
      }
    };
    load();
    // subscribe for external habit progress changes
    const listener = async (recId: number) => {
      if (!rec?.id || recId !== rec.id || !task) return;
      try {
        const p = await computeHabitProgress(task, rec);
        setHabitProgress(p);
        const sel = (task as any)._occurrenceStart ? new Date((task as any)._occurrenceStart) : undefined;
        const d = await getTodayCompletionDelta(task, rec, sel);
        setTodayDelta(d);
      } catch {}
    };
    if (rec?.id) subscribeHabitProgress(listener);
    return () => { cancelled = true; };
  }, [task?.id, task?.start_at, task?.end_at, recDeps, mergeStreak, autoExpired, rec, task]);

  // cleanup subscription separately to ensure proper unmount
  useEffect(() => {
    const listener = async (recId: number) => {
      if (!rec?.id || recId !== rec.id || !task) return;
      try {
        const p = await computeHabitProgress(task, rec);
        setHabitProgress(p);
        const sel = (task as any)._occurrenceStart ? new Date((task as any)._occurrenceStart) : undefined;
        const d = await getTodayCompletionDelta(task, rec, sel);
        setTodayDelta(d);
      } catch {}
    };
    if (rec?.id) subscribeHabitProgress(listener);
    return () => { if (rec?.id) unsubscribeHabitProgress(listener); };
  }, [rec?.id, task?.id, recDeps]);

  useEffect(() => {
    if (!rec?.id || !autoExpired || !task) return;
    let stopped = false;
    const tick = async () => {
      try {
        await autoCompletePastIfEnabled(task, rec);
        const p = await computeHabitProgress(task, rec);
        if (!stopped) setHabitProgress(p);
        if (!stopped) {
          const sel = (task as any)._occurrenceStart ? new Date((task as any)._occurrenceStart) : undefined;
          const d = await getTodayCompletionDelta(task, rec, sel);
          setTodayDelta(d);
        }
      } catch {}
    };
    const id = setInterval(tick, 30000);
    tick();
    return () => { stopped = true; clearInterval(id); };
  }, [autoExpired, recDeps, mergeStreak, task?.id, task?.start_at, task?.end_at, rec, task]);

  // Auto-mark completed when all occurrences done (for recurring)
  useEffect(() => {
    if (!rec || !habitProgress || !task) return;
    if (task.status === 'completed') return;
    if (autoCompletingRef.current) return;
    const allDone = habitProgress.total > 0 && habitProgress.completed >= habitProgress.total;
    if (!allDone) return;
    const now = Date.now();
    let dueMs: number | undefined;
    try {
      const occs = plannedHabitOccurrences(task, rec);
      if (occs && occs.length) dueMs = occs[occs.length - 1].endAt;
    } catch {}
    if (dueMs == null && rec.end_date) dueMs = new Date(rec.end_date).getTime();
    if (dueMs == null && task.end_at) dueMs = new Date(task.end_at).getTime();
    let diffMinutes: number | undefined;
    let completionStatus: 'early' | 'on_time' | 'late' | undefined;
    // compute metadata in async block (AsyncStorage read required for cutoff)
    autoCompletingRef.current = true;
    (async () => {
      try {
        let _diff: number | undefined;
        let _status: 'early' | 'on_time' | 'late' | undefined;
        if (dueMs) {
          const d = new Date(dueMs);
          const cutoffMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0).getTime();
          if (isSameLocalDate(dueMs, now) && cutoffMs > dueMs) {
            if (now <= dueMs) {
              _status = 'early';
              _diff = Math.round((now - dueMs) / 60000);
            } else if (now <= cutoffMs) {
              _status = 'on_time';
              _diff = 0;
            } else {
              _status = 'late';
              _diff = Math.round((now - cutoffMs) / 60000);
            }
          } else {
            _diff = Math.round((now - dueMs) / 60000);
            if (_diff < -1) _status = 'early';
            else if (_diff > 1) _status = 'late';
            else _status = 'on_time';
          }
        }
        await editTask(task.id!, {
          status: 'completed',
          completed_at: new Date(now).toISOString(),
          completion_diff_minutes: _diff,
          completion_status: _status,
        });
        onStatusChange(task.id!, 'completed');
      } finally {
        autoCompletingRef.current = false;
      }
    })();
  }, [habitProgress?.completed, habitProgress?.total, recDeps, task?.status, rec, task, editTask, onStatusChange]);

  // --- End of Hooks ---

  // Safety check, moved after all hooks
  if (!visible || !task) return null;

  // Other non-hook logic

  // Find related reminder/recurrence like TaskItem
  const reminder = reminders.find((r) => r.task_id === task.id);
  
  const repeatLabel = rec
    ? REPEAT_OPTIONS.find((o) => o.value === (rec as any).type)?.label ||
      (rec as any).type
    : "";

  const handleStatusToggle = async () => {
    if (!task?.id) return;
    // Helper: occurrence window per date for any task
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
    const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x.getTime(); };
    const getRecurrenceFor = (t: Task) => t.recurrence_id ? recurrences.find((r: Recurrence) => r.id === t.recurrence_id) : undefined;
    const getOccurrenceForDate = (t: Task, date: Date): { start: number; end: number } | null => {
      const baseStart = t.start_at ? new Date(t.start_at) : null;
      const baseStartMs = baseStart ? baseStart.getTime() : undefined;
      const baseEndMs = t.end_at ? new Date(t.end_at).getTime() : undefined;
      const selStart = startOfDay(date), selEnd = endOfDay(date);
      if (!t.recurrence_id) {
        const s = baseStartMs != null ? baseStartMs : (baseEndMs != null ? baseEndMs : undefined);
        const e = baseEndMs != null ? baseEndMs : (baseStartMs != null ? baseStartMs : undefined);
        if (s == null || e == null) return null;
        if (!(s <= selEnd && e >= selStart)) return null;
        return { start: Math.max(s, selStart), end: Math.min(e, selEnd) };
      }
      const r = getRecurrenceFor(t);
      if (!r) {
        const s = baseStartMs != null ? baseStartMs : (baseEndMs != null ? baseEndMs : undefined);
        const e = baseEndMs != null ? baseEndMs : (baseStartMs != null ? baseStartMs : undefined);
        if (s == null || e == null) return null;
        if (!(s <= selEnd && e >= selStart)) return null;
        return { start: Math.max(s, selStart), end: Math.min(e, selEnd) };
      }
      if (baseStartMs == null || !baseStart) return null;
      const duration = (baseEndMs != null && baseEndMs > baseStartMs) ? (baseEndMs - baseStartMs) : 0;
      const candStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), baseStart.getHours(), baseStart.getMinutes(), baseStart.getSeconds(), baseStart.getMilliseconds()).getTime();
      const candEnd = candStart + duration;
      const boundaryStart = Math.max(baseStartMs, r.start_date ? new Date(r.start_date).getTime() : baseStartMs);
      const boundaryEnd = r.end_date ? endOfDay(new Date(r.end_date)) : Infinity;
      if (candStart < boundaryStart || candStart > boundaryEnd) return null;
      const freq = (r.type || 'daily').toLowerCase();
      if (freq === 'daily') return { start: candStart, end: candEnd };
      if (freq === 'weekly') {
        const map: Record<string, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:0 };
        let days: number[] = [];
        if (r.days_of_week) { try { days = (JSON.parse(r.days_of_week) as string[]).map(d=>map[d as keyof typeof map]).filter((n): n is number => n!=null); } catch {} }
        if (days.length === 0) days = [baseStart.getDay()];
        return days.includes(date.getDay()) ? { start: candStart, end: candEnd } : null;
      }
      if (freq === 'monthly') {
        let dom: number[] = [];
        if (r.day_of_month) { try { dom = (JSON.parse(r.day_of_month) as string[]).map(s=>parseInt(s,10)).filter(n=>!isNaN(n)); } catch {} }
        if (dom.length === 0) dom = [baseStart.getDate()];
        return dom.includes(date.getDate()) ? { start: candStart, end: candEnd } : null;
      }
      if (freq === 'yearly') {
        return (date.getDate() === baseStart.getDate() && date.getMonth() === baseStart.getMonth()) ? { start: candStart, end: candEnd } : null;
      }
      return null;
    };
    const hasConflictIfUncomplete = async (range: { start: number; end: number } | null, dateCtx: Date): Promise<boolean> => {
      if (!range) return false;
      const conflicts: Task[] = [];
      for (const t of allTasks) {
        if (!t) continue;
        if (t.id === task.id) continue;
        if ((t as any).status === 'completed') continue; // skip fully completed tasks
        const occ = getOccurrenceForDate(t, dateCtx);
        if (!occ) continue;
        // If the other task is recurring and that day's occurrence is already completed, ignore it
        if (t.recurrence_id) {
          try { if (await isHabitDoneOnDate(t.recurrence_id, dateCtx)) continue; } catch {}
        }
        if (range.start < occ.end && range.end > occ.start) {
          conflicts.push(t);
        }
      }
      if (conflicts.length) {
        const pad = (n: number) => String(n).padStart(2, '0');
        const fmt = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
        const list = conflicts.slice(0,5).map(c => { const occ = getOccurrenceForDate(c, dateCtx)!; return `• ${c.title} (${fmt(occ.start)} - ${fmt(occ.end)})`; }).join('\n');
        if (onInlineAlert) {
          onInlineAlert({
            tone: 'warning',
            title: t.tasks?.item?.uncompleteBlockedTitle ?? 'Không thể bỏ hoàn thành ⛔',
            message: (t.tasks?.item?.uncompleteBlockedMsgGeneric ?? ((lst: string) => `Công việc này bị trùng thời gian với công việc khác đang hoạt động:\n\n${lst}\n\nVui lòng giải quyết xung đột trước.`))(list),
          });
        } else {
          Alert.alert(t.tasks?.item?.uncompleteBlockedTitle ?? 'Không thể bỏ hoàn thành ⛔', (t.tasks?.item?.uncompleteBlockedMsgGeneric ?? ((lst: string) => `Công việc này bị trùng thời gian với công việc khác đang hoạt động:\n\n${lst}\n\nVui lòng giải quyết xung đột trước.`))(list));
        }
        return true;
      }
      return false;
    };
    // First step: pending -> in-progress
    if (task.status === 'pending') {
      await editTask(task.id, { status: 'in-progress' });
      onStatusChange(task.id, 'in-progress');
      return;
    }
    if (rec?.id) {
      // Determine date context: use occurrence start if provided (from calendar), else today.
      // Normalize to YMD to avoid time-of-day side-effects so only the intended occurrence is toggled.
      const rawDate = (task as any)._occurrenceStart ? new Date((task as any)._occurrenceStart) : new Date();
      const dateCtx = new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate());
      if (mergeStreak) {
        const occs = plannedHabitOccurrences(task, rec);
        if (occs.length > 0) {
          const from = new Date(occs[0].startAt);
          const to = new Date(occs[occs.length - 1].endAt);
          const p0 = await computeHabitProgress(task, rec);
          const cycleDone = p0.total > 0 && p0.completed >= p0.total;
          if (cycleDone) {
            await unmarkHabitRange(rec.id!, from, to);
          } else {
            await markHabitRange(rec.id!, from, to, task, rec);
          }
        }
      } else {
        const already = await isHabitDoneOnDate(rec.id!, dateCtx);
        if (already) {
          // Before un-completing this occurrence, block if it would overlap active tasks
          const occ = getOccurrenceForDate(task, dateCtx);
          if (await hasConflictIfUncomplete(occ, dateCtx)) {
            return; // do not unmark
          }
          await unmarkHabitToday(rec.id!, dateCtx);
        } else {
          await markHabitToday(rec.id!, dateCtx);
        }
      }
      const p = await computeHabitProgress(task, rec);
      setHabitProgress(p);
      try {
        const d = await getTodayCompletionDelta(task, rec, dateCtx);
        setTodayDelta(d);
      } catch {}
      const full = p.total > 0 && p.completed >= p.total;
      if (full) {
        const now = Date.now();
        let dueMs: number | undefined;
        try {
          const occs = plannedHabitOccurrences(task, rec);
          if (occs && occs.length) dueMs = occs[occs.length - 1].endAt;
        } catch {}
        if (dueMs == null && rec.end_date) dueMs = new Date(rec.end_date).getTime();
        if (dueMs == null && task.end_at) dueMs = new Date(task.end_at).getTime();
        let diffMinutes: number | undefined;
        let completionStatus: 'early' | 'on_time' | 'late' | undefined;
        if (dueMs) {
          const d = new Date(dueMs);
          const cutoffMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0).getTime();
          if (isSameLocalDate(dueMs, now) && cutoffMs > dueMs) {
            if (now <= dueMs) {
              completionStatus = 'early';
              diffMinutes = Math.round((now - dueMs) / 60000);
            } else if (now <= cutoffMs) {
              completionStatus = 'on_time';
              diffMinutes = 0;
            } else {
              completionStatus = 'late';
              diffMinutes = Math.round((now - cutoffMs) / 60000);
            }
          } else {
            diffMinutes = Math.round((now - dueMs) / 60000);
            if (diffMinutes < -1) completionStatus = 'early';
            else if (diffMinutes > 1) completionStatus = 'late';
            else completionStatus = 'on_time';
          }
        }
        await editTask(task.id!, {
          status: 'completed',
          completed_at: new Date(now).toISOString(),
          completion_diff_minutes: diffMinutes,
          completion_status: completionStatus,
        });
        onStatusChange(task.id!, 'completed');
      } else if (task.status === 'completed') {
        // Prevent un-complete if it would cause an overlap on the current occurrence/day
        const rawDate = (task as any)._occurrenceStart ? new Date((task as any)._occurrenceStart) : new Date();
        const dateCtx2 = new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate());
        const occ = getOccurrenceForDate(task, dateCtx2);
        if (await hasConflictIfUncomplete(occ, dateCtx2)) {
          return;
        }
        await editTask(task.id!, {
          status: 'in-progress',
          completed_at: undefined,
          completion_diff_minutes: undefined,
          completion_status: undefined,
        });
        onStatusChange(task.id!, 'in-progress');
      }
      return;
    }
  // Non-recurring: cycle and add completion meta
  // Behavior change: once a non-recurring task leaves 'pending' it should not return to 'pending'.
  // Cycle will be: pending -> in-progress -> completed -> in-progress -> completed ...
  let nextStatus: Task["status"] = "in-progress";
  if (task.status === "pending") nextStatus = "in-progress";
  else if (task.status === "in-progress") nextStatus = "completed";
  else if (task.status === "completed") nextStatus = "in-progress";
    if (nextStatus === 'completed') {
      const now = Date.now();
      let dueMs: number | undefined;
      if (task.end_at) dueMs = new Date(task.end_at).getTime();
      let diffMinutes: number | undefined;
      let completionStatus: 'early' | 'on_time' | 'late' | undefined;
      if (dueMs) {
        const d = new Date(dueMs);
        const cutoffMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0).getTime();
        if (isSameLocalDate(dueMs, now) && cutoffMs > dueMs) {
          if (now <= dueMs) {
            completionStatus = 'early';
            diffMinutes = Math.round((now - dueMs) / 60000);
          } else if (now <= cutoffMs) {
            completionStatus = 'on_time';
            diffMinutes = 0;
          } else {
            completionStatus = 'late';
            diffMinutes = Math.round((now - cutoffMs) / 60000);
          }
        } else {
          diffMinutes = Math.round((now - dueMs) / 60000);
          if (diffMinutes < -1) completionStatus = 'early';
          else if (diffMinutes > 1) completionStatus = 'late';
          else completionStatus = 'on_time';
        }
      }
      await editTask(task.id!, {
        status: nextStatus,
        completed_at: new Date(now).toISOString(),
        completion_diff_minutes: diffMinutes,
        completion_status: completionStatus,
      });
    } else {
      // Non-recurring: block un-complete if conflict
      if (task.status === 'completed') {
        const dateCtx = task.start_at ? new Date(task.start_at) : new Date();
        const baseStart = task.start_at ? new Date(task.start_at).getTime() : undefined;
        const baseEnd = task.end_at ? new Date(task.end_at).getTime() : undefined;
        const range = (baseStart != null && baseEnd != null) ? { start: baseStart, end: baseEnd } : null;
        if (await hasConflictIfUncomplete(range, dateCtx)) {
          return;
        }
      }
      await editTask(task.id!, { status: nextStatus, completed_at: undefined, completion_diff_minutes: undefined, completion_status: undefined });
    }
    onStatusChange(task.id!, nextStatus);
  };

  const formatReminder = (mins?: number | null) => {
    if (!mins || mins <= 0) return '';
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    const parts: string[] = [];
    if (d) parts.push(`${d} ngày`);
    if (h) parts.push(`${h} giờ`);
    if (m) parts.push(`${m} phút`);
    return parts.join(' ');
  };

  const priorityStripClass =
    task.priority === "high"
      ? "bg-red-600"
      : task.priority === "medium"
      ? "bg-yellow-400"
      : "bg-green-500";

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 justify-center items-center" style={{ backgroundColor: colors.backdrop }}>
        <View className="w-11/12 p-4 rounded-lg max-h-[80%]" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }}>
          <View className="absolute right-2 top-2 z-10">
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text className="text-xl" style={{ color: colors.text }}>✖️</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView>
            {/* Align visual layout with TaskItem */}
            <View className="flex-row mb-1 rounded-xl" style={{ backgroundColor: isDark ? '#0b1220' : '#F8FAFF', borderColor: colors.border, borderWidth: 1 }}>
              {/* Left priority strip */}
              <View
                className={`w-1 rounded-l-xl ${priorityStripClass}`}
                style={{ height: "100%" }}
              />

              {/* Content */}
              <View className="flex-1 p-3">
                <Text className="font-bold text-lg mb-1" style={{ color: colors.text }}>{task.title}</Text>
                {!!task.description && (
                  <Text className="text-base mb-1" style={{ color: colors.muted }}>
                    {task.description}
                  </Text>
                )}

                {/* Thời gian và badges cùng hàng, badge sẽ wrap nếu không đủ chỗ */}
                {(() => {
                  const toDate = (v: any) => (v ? new Date(v) : null);
                  const s = toDate(task.start_at);
                  const e = toDate(task.end_at);
                  if (!s && !e) return null;
                  const pad = (n: number) => String(n).padStart(2, "0");
                  const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  const timeContent = s && e ? `${fmtTime(s)} - ${fmtTime(e)}` : fmtTime((s || e) as Date);
                  return (
                    <View className="flex-row items-center mb-1 flex-wrap justify-between">
                      <View className="flex-row items-center mr-2">
                        <Text className="text-base mr-1" style={{ color: colors.muted }}>⏰</Text>
                        <Text className="text-base font-medium" style={{ color: isDark ? '#93c5fd' : '#2563eb' }}>{timeContent}</Text>
                      </View>

                      <View className="flex-row flex-wrap items-center gap-1">
                        {task.status === "pending" && (
                          <Text style={{ backgroundColor: colors.chipGrayBg, color: colors.chipGrayText, borderColor: isDark ? '#475569' : '#6b7280', borderWidth: 1 }} className="rounded-full px-2 py-0.5 text-base">
                            {t.tasks?.item?.statusPending ?? 'Chờ thực hiện'}
                          </Text>
                        )}
                        {task.status === "in-progress" && (
                          <Text style={{ backgroundColor: colors.chipBlueBg, color: colors.chipBlueText, borderColor: isDark ? '#1d4ed8' : '#2563eb', borderWidth: 1 }} className="rounded-full px-2 py-0.5 text-base">
                            {t.tasks?.item?.statusInProgress ?? 'Đang thực hiện'}
                          </Text>
                        )}
                        {task.status === 'completed' && (
                          <Text style={{ backgroundColor: colors.chipGreenBg, color: colors.chipGreenText, borderColor: isDark ? '#16a34a' : '#16a34a', borderWidth: 1 }} className="rounded-full px-2 py-0.5 text-base">{t.tasks?.item?.statusCompleted ?? 'Hoàn thành'}</Text>
                        )}

                        {!!reminder && (
                          <View className="flex-row items-center rounded-full px-2 py-0.5" style={{ backgroundColor: colors.chipBlueBg, borderColor: isDark ? '#1d4ed8' : '#2563eb', borderWidth: 1 }}>
                            <Text className="text-base" style={{ color: colors.chipBlueText }}>🔔</Text>
                          </View>
                        )}

                        {!!rec && (mergeStreak || (habitProgress && habitProgress.total > 1)) && (
                          <View className="flex-row items-center rounded-full px-2 py-0.5" style={{ backgroundColor: colors.chipPurpleBg, borderColor: isDark ? '#7c3aed' : '#6d28d9', borderWidth: 1 }}>
                            <Text className="text-base" style={{ color: colors.chipPurpleText }}>🔁</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })()}

                {!!rec && habitProgress && (mergeStreak || (habitProgress.total && habitProgress.total > 1)) && (
                  <View className="mt-1 mb-2">
                    {/* Không hiển thị chữ 'Hoàn thành' cho công việc lặp gộp; vẫn hiện với không gộp khi có hoàn thành trong ngày */}
                    {!mergeStreak && todayDelta?.status ? (
                      <Text className="mb-1" style={{ color: isDark ? '#86efac' : '#16a34a' }}>{t.tasks?.item?.completedWord ?? 'Hoàn thành'}</Text>
                    ) : null}
                    <View className="flex-row items-center justify-between mb-1">
                      <Text style={{ color: colors.muted }}>{t.tasks?.item?.progressLabel ?? 'Tiến độ'}</Text>
                      <Text className="font-medium" style={{ color: colors.text }}>
                        {habitProgress.completed}/{habitProgress.total} ({habitProgress.percent}%) {mergeStreak ? (t.tasks?.item?.mergedSuffix ?? 'đã gộp') : ''}
                      </Text>
                    </View>
                    <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? '#1f2937' : '#e5e7eb' }}>
                      <View style={{ width: `${habitProgress.percent}%`, backgroundColor: isDark ? '#22c55e' : '#22c55e' }} className="h-2" />
                    </View>
                  </View>
                )}
              </View>

              {/* Right action icons column */}
              <View className="flex-col items-center justify-center gap-2 ml-2 min-w-[36px] mr-2 my-2">
                <TouchableOpacity onPress={handleStatusToggle}>
                  {task.status === "completed" ? (
                    <Text className="text-xl" style={{ color: isDark ? '#86efac' : '#16a34a' }}>✅</Text>
                  ) : task.status === "in-progress" ? (
                    <Text className="text-xl" style={{ color: isDark ? '#fde68a' : '#f59e0b' }}>🟡</Text>
                  ) : (
                    <Text className="text-xl" style={{ color: isDark ? '#fca5a5' : '#ef4444' }}>⭕</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onEdit(task);
                  }}
                >
                  <Text className="text-lg" style={{ color: colors.text }}>✏️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    onDelete(task.id!);
                    onClose();
                  }}
                >
                  <Text className="text-lg" style={{ color: colors.text }}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}