import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import type { Task } from "../../types/Task";
import type { Recurrence } from "../../types/Recurrence";
import { autoCompletePastIfEnabled, computeHabitProgress, markHabitRange, markHabitToday, getTodayCompletionDelta, plannedHabitOccurrences, unmarkHabitToday, isHabitDoneOnDate, unmarkHabitRange } from "../../utils/habits";

type RepeatOption = { label: string; value: string };

interface Props {
  item: Task;
  reminders: { task_id?: number | null; remind_before?: number | null }[];
  recurrences: Recurrence[];
  REPEAT_OPTIONS: RepeatOption[];
  editTask: (id: number, data: any) => Promise<void> | void;
  openEditModal: (task: Task) => void;
  handleDeleteTask: (id: number) => void;
  hideDate?: boolean; // when true, show only time (used for Today mode)
  selectedDate?: Date; // date context for calculating early/late
  allMode?: boolean; // true when TaskListView is showing "Toàn bộ"
}

export default function TaskItem({
  item,
  reminders,
  recurrences,
  REPEAT_OPTIONS,
  editTask,
  openEditModal,
  handleDeleteTask,
  hideDate = false,
  selectedDate,
  allMode = false,
}: Props) {
  const reminder = reminders.find((r) => r.task_id === item.id);
  const rec = item.recurrence_id
    ? recurrences.find((r) => r.id === item.recurrence_id)
    : undefined;
  const repeatLabel = rec
    ? REPEAT_OPTIONS.find((o) => o.value === (rec as any).type)?.label ||
      (rec as any).type
    : "";

  const [habitProgress, setHabitProgress] = useState<{ completed: number; total: number; percent: number; todayDone: boolean } | null>(null);
  const [showHabitPopup, setShowHabitPopup] = useState(false);
  const [todayDelta, setTodayDelta] = useState<{ status: 'early' | 'late' | 'on_time' | null; diffMinutes: number | null } | null>(null);
  const mergeStreak = !!rec && (rec as any).merge_streak === 1;
  const autoExpired = !!rec && (rec as any).auto_complete_expired === 1;
  const autoCompletingRef = useRef(false);

  // Build a lightweight dependency signature from recurrence fields that affect occurrences
  const recDeps = useMemo(() => {
    if (!rec) return 'none';
    const parts = [
      rec.id,
      rec.type,
      rec.interval,
      rec.days_of_week || '',
      rec.day_of_month || '',
      rec.start_date ? new Date(rec.start_date).getTime() : 0,
      rec.end_date ? new Date(rec.end_date).getTime() : 0,
      rec.merge_streak,
      rec.auto_complete_expired,
    ];
    return JSON.stringify(parts);
  }, [rec]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (rec?.id) {
        try {
          if (autoExpired) await autoCompletePastIfEnabled(item, rec);
          const p = await computeHabitProgress(item, rec);
          if (!cancelled) setHabitProgress(p);
          if (!cancelled) {
            const d = await getTodayCompletionDelta(item, rec, selectedDate);
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
  }, [item.id, item.start_at, item.end_at, recDeps, mergeStreak, autoExpired, selectedDate?.getTime()]);

  // Periodically refresh auto-completion and progress while auto is enabled
  useEffect(() => {
    if (!rec?.id || !autoExpired) return;
    let stopped = false;
    const tick = async () => {
      try {
        await autoCompletePastIfEnabled(item, rec);
        const p = await computeHabitProgress(item, rec);
        if (!stopped) setHabitProgress(p);
        if (!stopped) {
          const d = await getTodayCompletionDelta(item, rec, selectedDate);
          setTodayDelta(d);
        }
      } catch {}
    };
    const id = setInterval(tick, 30000); // 30s cadence
    // run once immediately to catch boundary
    tick();
    return () => { stopped = true; clearInterval(id); };
  }, [autoExpired, recDeps, mergeStreak, item.id, item.start_at, item.end_at, selectedDate?.getTime()]);

  // If all habit progress is completed, auto-mark task as completed (only for recurring tasks)
  useEffect(() => {
    if (!rec || !habitProgress) return;
    if (item.status === 'completed') return;
    if (autoCompletingRef.current) return;
    const allDone = habitProgress.total > 0 && habitProgress.completed >= habitProgress.total;
    if (!allDone) return;
    const now = Date.now();
    // For recurring tasks, use the end time of the last planned occurrence as due time
    let dueMs: number | undefined;
    try {
      const occs = plannedHabitOccurrences(item, rec);
      if (occs && occs.length) {
        dueMs = occs[occs.length - 1].endAt;
      }
    } catch {}
    // Fallbacks
    if (dueMs == null && rec.end_date) dueMs = new Date(rec.end_date).getTime();
    if (dueMs == null && item.end_at) dueMs = new Date(item.end_at).getTime();
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
        await editTask(item.id!, {
          status: 'completed',
          completed_at: new Date(now).toISOString(),
          completion_diff_minutes: diffMinutes,
          completion_status: completionStatus,
        });
      } finally {
        autoCompletingRef.current = false;
      }
    })();
  }, [habitProgress?.completed, habitProgress?.total, recDeps, item.status]);

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

  return (
    <View className="flex-row mb-3 bg-gray-50 rounded-xl">
      {/* Border-left màu theo priority */}
      <View
        className={`w-1 rounded-l-xl ${
          item.priority === "high"
            ? "bg-red-600"
            : item.priority === "medium"
            ? "bg-yellow-400"
            : "bg-green-500"
        }`}
        style={{ height: "100%" }}
      />

      {/* Nội dung task */}
      <View className="flex-1 p-3">
        <Text className="font-bold text-lg mb-1">{item.title}</Text>
        {!!item.description && (
          <Text className="text-gray-600 text-base mb-1">
            {item.description}
          </Text>
        )}

        {/* Thời gian và badges chung một hàng (wrap nếu không đủ chỗ) */}
        {(() => {
          const toDate = (v: any) => (v ? new Date(v) : null);
          const s = toDate(item.start_at);
          const e = toDate(item.end_at);
          const pad = (n: number) => String(n).padStart(2, "0");
          const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
          const fmtDate = (d: Date) => `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
          const segments: Array<{ type: string; text: string }> = [];
          if (s && e) {
            const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
            if (hideDate) {
              // Only times
              segments.push({ type: 'time', text: fmtTime(s) });
              segments.push({ type: 'sep', text: ' - ' });
              segments.push({ type: 'time', text: fmtTime(e) });
            } else if (sameDay) {
              // HH:MM - HH:MM  then date
              segments.push({ type: 'time', text: fmtTime(s) });
              segments.push({ type: 'sep', text: ' - ' });
              segments.push({ type: 'time', text: fmtTime(e) });
              segments.push({ type: 'space', text: ' ' });
              segments.push({ type: 'date', text: fmtDate(s) });
            } else {
              // Start full and end full with dates
              segments.push({ type: 'time', text: fmtTime(s) });
              segments.push({ type: 'space', text: ' ' });
              segments.push({ type: 'date', text: fmtDate(s) });
              segments.push({ type: 'sep', text: ' — ' });
              segments.push({ type: 'time', text: fmtTime(e) });
              segments.push({ type: 'space', text: ' ' });
              segments.push({ type: 'date', text: fmtDate(e) });
            }
          } else if (s) {
            if (hideDate) {
              segments.push({ type: 'time', text: fmtTime(s) });
            } else {
              segments.push({ type: 'time', text: fmtTime(s) });
              segments.push({ type: 'space', text: ' ' });
              segments.push({ type: 'date', text: fmtDate(s) });
            }
          }
          // Recurrence end date (skip showing date in Today compact mode)
          if (!hideDate && rec?.end_date) {
            const endRecDate = new Date(rec.end_date);
            if (segments.length) segments.push({ type: 'rec-sep', text: ' — ' });
            segments.push({ type: 'recurrenceEnd', text: fmtDate(endRecDate) });
          }

          if (!segments.length) return null;

          const renderSeg = (seg: { type: string; text: string }, idx: number) => {
            let cls = 'text-base';
            switch (seg.type) {
              case 'time':
                cls += ' text-blue-600 font-medium';
                break;
              case 'date':
                cls += ' text-gray-700';
                break;
              case 'sep':
              case 'space':
              case 'rec-sep':
                cls += ' text-gray-500';
                break;
              case 'recurrenceEnd':
                cls += ' text-purple-700 font-medium';
                break;
              default:
                cls += ' text-gray-600';
            }
            return <Text key={idx} className={cls}>{seg.text}</Text>;
          };

          return (
            <View className="flex-row items-center mb-1 flex-wrap justify-between">
              <View className="flex-row items-center mr-2 flex-wrap">
                <Text className="text-gray-600 text-base mr-1">⏰</Text>
                <View className="flex-row flex-wrap">{segments.map(renderSeg)}</View>
              </View>

              <View className="flex-row flex-wrap items-center gap-1">
                {item.status === "pending" && (
                  <Text className="bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 text-base border border-gray-600">
                    Chờ thực hiện
                  </Text>
                )}
                {item.status === "in-progress" && (
                  <Text className="bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 text-base border border-blue-600">
                    Đang thực hiện
                  </Text>
                )}
                {item.status === 'completed' && (()=>{
                  let label = 'Hoàn thành';
                  const st = item.completion_status;
                  if (st) {
                    const abs = Math.abs(item.completion_diff_minutes ?? 0);
                    if (st === 'on_time') {
                      label = 'Hoàn thành đúng hạn';
                    } else {
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

                {!!item.recurrence_id && !!rec && (
                  <View className="flex-row items-center bg-purple-100 rounded-full px-2 py-0.5 border border-purple-700">
                    <Text className="text-purple-700 text-base">🔄</Text>
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

      {/* Cột icon thao tác */}
      <View className="flex-col items-center justify-center gap-2 ml-2 min-w-[36px]">
        <TouchableOpacity
          // Disable toggling completion in 'all' mode for recurring tasks that are NOT using merge_streak
          onPress={async () => { 
            // First press: if task is pending, switch to in-progress and stop
            if (item.status === 'pending') {
              await editTask(item.id!, { status: 'in-progress' });
              return;
            }
            // If recurring: toggle completion for the selected day
            if (rec?.id) {
              if (allMode && !mergeStreak) {
                // In 'Toàn bộ' list view we don't allow per-day completion toggles for recurring tasks
                // when merge_streak is disabled because that view represents all occurrences and
                // toggling a single day's completion could be confusing.
                return;
              }
              const dateCtx = selectedDate ? new Date(selectedDate) : new Date();
              if (mergeStreak) {
                // In merge mode, toggle the whole cycle 0/1 instead of per-day
                const occs = plannedHabitOccurrences(item, rec);
                if (occs.length > 0) {
                  const from = new Date(occs[0].startAt);
                  const to = new Date(occs[occs.length - 1].endAt);
                  const p0 = await computeHabitProgress(item, rec);
                  const cycleDone = p0.total > 0 && p0.completed >= p0.total;
                  if (cycleDone) {
                    await unmarkHabitRange(rec.id, from, to);
                  } else {
                    await markHabitRange(rec.id, from, to, item, rec);
                  }
                }
              } else {
                // Non-merge recurring: toggle just today's occurrence
                const alreadyDone = await isHabitDoneOnDate(rec.id, dateCtx);
                if (alreadyDone) {
                  await unmarkHabitToday(rec.id, dateCtx);
                } else {
                  await markHabitToday(rec.id, dateCtx);
                }
              }
              const p = await computeHabitProgress(item, rec);
              setHabitProgress(p);
              try {
                const d = await getTodayCompletionDelta(item, rec, selectedDate);
                setTodayDelta(d);
              } catch {}
              const full = p.total > 0 && p.completed >= p.total;
              if (full) {
                const now = Date.now();
                let dueMs: number | undefined;
                try {
                  const occs = plannedHabitOccurrences(item, rec);
                  if (occs && occs.length) dueMs = occs[occs.length - 1].endAt;
                } catch {}
                if (dueMs == null && rec.end_date) dueMs = new Date(rec.end_date).getTime();
                if (dueMs == null && item.end_at) dueMs = new Date(item.end_at).getTime();
                let diffMinutes: number | undefined;
                let completionStatus: 'early' | 'on_time' | 'late' | undefined;
                if (dueMs) {
                  diffMinutes = Math.round((now - dueMs) / 60000);
                  if (diffMinutes < -1) completionStatus = 'early';
                  else if (diffMinutes > 1) completionStatus = 'late';
                  else completionStatus = 'on_time';
                }
                await editTask(item.id!, {
                  status: 'completed',
                  completed_at: new Date(now).toISOString(),
                  completion_diff_minutes: diffMinutes,
                  completion_status: completionStatus,
                });
              } else if (item.status === 'completed') {
                // drop overall completion if progress < 100%
                await editTask(item.id!, {
                  status: 'in-progress',
                  completed_at: undefined,
                  completion_diff_minutes: undefined,
                  completion_status: undefined,
                });
              }
              return;
            }
            // Non-recurring: cycle status and set/clear completion
            // Behavior change: once a non-recurring task leaves 'pending' it should not return to 'pending'.
            // Cycle will be: pending -> in-progress -> completed -> in-progress -> completed ...
            let nextStatus: Task["status"] = "in-progress";
            if (item.status === "pending") nextStatus = "in-progress";
            else if (item.status === "in-progress") nextStatus = "completed";
            else if (item.status === "completed") nextStatus = "in-progress";
            if (nextStatus === 'completed') {
              const now = Date.now();
              let dueMs: number | undefined;
              if (item.end_at) dueMs = new Date(item.end_at).getTime();
              let diffMinutes: number | undefined;
              let completionStatus: 'early' | 'on_time' | 'late' | undefined;
              if (dueMs) {
                diffMinutes = Math.round((now - dueMs) / 60000);
                if (diffMinutes < -1) completionStatus = 'early';
                else if (diffMinutes > 1) completionStatus = 'late';
                else completionStatus = 'on_time';
              }
              await editTask(item.id!, {
                status: nextStatus,
                completed_at: new Date(now).toISOString(),
                completion_diff_minutes: diffMinutes,
                completion_status: completionStatus,
              });
            } else {
              await editTask(item.id!, { status: nextStatus, completed_at: undefined, completion_diff_minutes: undefined, completion_status: undefined });
            }
          }}
        >
          {item.status === "completed" ? (
            <Text className="text-green-500 text-xl">✅</Text>
          ) : item.status === "in-progress" ? (
            <Text className="text-yellow-400 text-xl">🟡</Text>
          ) : (
            <Text className="text-red-500 text-xl">⭕</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => openEditModal(item)}>
          <Text className="text-lg">✏️</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => handleDeleteTask(item.id!)}>
          <Text className="text-lg">🗑️</Text>
        </TouchableOpacity>
      </View>

      {/* Popup đã loại bỏ do hành vi quyết định bởi merge_streak và auto flags */}
    </View>
  );
}
