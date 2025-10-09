import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Modal, ScrollView } from "react-native";
import type { Task } from "../../types/Task";
import type { Recurrence } from "../../types/Recurrence";
import { REPEAT_OPTIONS } from "../../constants/taskConstants";
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
} from "../../utils/habits";
import { useTasks } from "../../hooks/useTasks";

interface TaskDetailModalProps {
  visible: boolean;
  task: Task | null;
  reminders: any[];
  recurrences: any[];
  onClose: () => void;
  onStatusChange: (taskId: number, status: Task["status"]) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
}

export default function TaskDetailModal({
  visible,
  task,
  reminders,
  recurrences,
  onClose,
  onStatusChange,
  onEdit,
  onDelete,
}: TaskDetailModalProps) {
  // --- Start of Hooks ---
  
  const { editTask } = useTasks();

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
    return () => { cancelled = true; };
  }, [task?.id, task?.start_at, task?.end_at, recDeps, mergeStreak, autoExpired, rec, task]);

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
    if (dueMs) {
      diffMinutes = Math.round((now - dueMs) / 60000);
      if (diffMinutes < -1) completionStatus = 'early';
      else if (diffMinutes > 1) completionStatus = 'late';
      else completionStatus = 'on_time';
    }
    autoCompletingRef.current = true;
    (async () => {
      try {
        await editTask(task.id!, {
          status: 'completed',
          completed_at: new Date(now).toISOString(),
          completion_diff_minutes: diffMinutes,
          completion_status: completionStatus,
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
        if (already) await unmarkHabitToday(rec.id!, dateCtx);
        else await markHabitToday(rec.id!, dateCtx);
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
          diffMinutes = Math.round((now - dueMs) / 60000);
          if (diffMinutes < -1) completionStatus = 'early';
          else if (diffMinutes > 1) completionStatus = 'late';
          else completionStatus = 'on_time';
        }
        await editTask(task.id!, {
          status: 'completed',
          completed_at: new Date(now).toISOString(),
          completion_diff_minutes: diffMinutes,
          completion_status: completionStatus,
        });
        onStatusChange(task.id!, 'completed');
      } else if (task.status === 'completed') {
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
        diffMinutes = Math.round((now - dueMs) / 60000);
        if (diffMinutes < -1) completionStatus = 'early';
        else if (diffMinutes > 1) completionStatus = 'late';
        else completionStatus = 'on_time';
      }
      await editTask(task.id!, {
        status: nextStatus,
        completed_at: new Date(now).toISOString(),
        completion_diff_minutes: diffMinutes,
        completion_status: completionStatus,
      });
    } else {
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
      <View className="flex-1 bg-black/40 justify-center items-center">
        <View className="bg-white w-11/12 p-4 rounded-lg max-h-[80%]">
          <View className="absolute right-2 top-2 z-10">
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text className="text-xl">✖️</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView>
            {/* Align visual layout with TaskItem */}
            <View className="flex-row mb-1 bg-gray-50 rounded-xl">
              {/* Left priority strip */}
              <View
                className={`w-1 rounded-l-xl ${priorityStripClass}`}
                style={{ height: "100%" }}
              />

              {/* Content */}
              <View className="flex-1 p-3">
                <Text className="font-bold text-lg mb-1">{task.title}</Text>
                {!!task.description && (
                  <Text className="text-gray-600 text-base mb-1">
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
                        <Text className="text-gray-600 text-base mr-1">⏰</Text>
                        <Text className="text-base text-blue-600 font-medium">{timeContent}</Text>
                      </View>

                      <View className="flex-row flex-wrap items-center gap-1">
                        {task.status === "pending" && (
                          <Text className="bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 text-base border border-gray-600">
                            Chờ thực hiện
                          </Text>
                        )}
                        {task.status === "in-progress" && (
                          <Text className="bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 text-base border border-blue-600">
                            Đang thực hiện
                          </Text>
                        )}
                        {task.status === 'completed' && (()=>{
                          let label = 'Hoàn thành';
                          const st = task.completion_status as any;
                          if (st) {
                            const abs = Math.abs(task.completion_diff_minutes ?? 0);
                            if (st === 'on_time') label = 'Hoàn thành đúng hạn';
                            else {
                              const d = Math.floor(abs / 1440);
                              const h = Math.floor((abs % 1440) / 60);
                              const m = abs % 60;
                              let short = '';
                              if (d) short += `${d}n`;
                              if (h) short += `${h}g`;
                              if (m || (!d && !h && m===0)) short += `${m}p`;
                              if (st === 'early') label = `Hoàn thành sớm ${short}`;
                              else if (st === 'late') label = `Hoàn thành trễ ${short}`;
                            }
                          }
                          return <Text className="bg-green-100 text-green-600 rounded-full px-2 py-0.5 text-base border border-green-600">{label}</Text>;
                        })()}

                        {!!reminder && (
                          <View className="flex-row items-center bg-blue-100 rounded-full px-2 py-0.5 border border-blue-600">
                            <Text className="text-blue-600 text-base">🔔</Text>
                          </View>
                        )}

                        {!!task.recurrence_id && !!rec && (
                          <View className="flex-row items-center bg-purple-100 rounded-full px-2 py-0.5 border border-purple-700">
                            <Text className="text-purple-700 text-base">🔁</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })()}

                {!!rec && habitProgress && (
                  <View className="mt-1 mb-2">
                    {!mergeStreak && todayDelta?.status && todayDelta.diffMinutes !== null && (
                      <Text className="text-green-600 mb-1">
                        Đã hoàn thành {todayDelta.status === 'early' ? 'sớm' : todayDelta.status === 'late' ? 'trễ' : 'đúng hạn'} {(() => {
                          const abs = Math.abs(todayDelta.diffMinutes!);
                          const d = Math.floor(abs / 1440);
                          const h = Math.floor((abs % 1440) / 60);
                          const m = abs % 60;
                          const parts: string[] = [];
                          if (d) parts.push(`${d}n`);
                          if (h) parts.push(`${h}g`);
                          if (m || (!d && !h)) parts.push(`${m}p`);
                          return parts.join('');
                        })()}
                      </Text>
                    )}
                    <View className="flex-row items-center justify-between mb-1">
                      <Text className="text-gray-700">Tiến độ</Text>
                      <Text className="text-gray-800 font-medium">
                        {habitProgress.completed}/{habitProgress.total} ({habitProgress.percent}%) {mergeStreak ? 'đã gộp' : ''}
                      </Text>
                    </View>
                    <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <View style={{ width: `${habitProgress.percent}%` }} className="h-2 bg-green-500" />
                    </View>
                  </View>
                )}
              </View>

              {/* Right action icons column */}
              <View className="flex-col items-center justify-center gap-2 ml-2 min-w-[36px] mr-2 my-2">
                <TouchableOpacity onPress={handleStatusToggle}>
                  {task.status === "completed" ? (
                    <Text className="text-green-500 text-xl">✅</Text>
                  ) : task.status === "in-progress" ? (
                    <Text className="text-yellow-400 text-xl">🟡</Text>
                  ) : (
                    <Text className="text-red-500 text-xl">⭕</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onEdit(task);
                  }}
                >
                  <Text className="text-lg">✏️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    onDelete(task.id!);
                    onClose();
                  }}
                >
                  <Text className="text-lg">🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}