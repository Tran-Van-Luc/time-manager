import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Modal, Alert } from "react-native";
import type { Task } from "../../types/Task";
import type { Recurrence } from "../../types/Recurrence";
import { computeHabitProgress, markHabitRange, markHabitToday, getTodayCompletionDelta, plannedHabitOccurrences, unmarkHabitToday, isHabitDoneOnDate, unmarkHabitRange, subscribeHabitProgress, unsubscribeHabitProgress } from "../../utils/habits";
import { useLanguage } from "../../context/LanguageContext";

type RepeatOption = { label: string; value: string };

interface Props {
  item: Task;
  allTasks: Task[];
  reminders: { task_id?: number | null; remind_before?: number | null }[];
  recurrences: Recurrence[];
  REPEAT_OPTIONS: RepeatOption[];
  editTask: (id: number, data: any) => Promise<void> | void;
  openEditModal: (task: Task) => void;
  handleDeleteTask: (id: number) => void;
  onInlineAlert?: (info: { tone: 'error'|'warning'|'success'|'info'; title: string; message: string }) => void;
  hideDate?: boolean; // when true, show only time (used for Today mode)
  selectedDate?: Date; // date context for calculating early/late
  allMode?: boolean; // true when TaskListView is showing "Toàn bộ"
}

export default function TaskItem({
  item,
  allTasks,
  reminders,
  recurrences,
  REPEAT_OPTIONS,
  editTask,
  openEditModal,
  handleDeleteTask,
  onInlineAlert,
  hideDate = false,
  selectedDate,
  allMode = false,
}: Props) {
  const { t } = useLanguage();
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
  const [todayDisplayLabel, setTodayDisplayLabel] = useState<string | null>(null);
  const mergeStreak = !!rec && (rec as any).merge_streak === 1;
  const autoCompletingRef = useRef(false);

  // End-of-day cutoff key and helpers (same key used in Completed screen)
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

  const buildShortFromMinutes = (abs: number) => {
    const d = Math.floor(abs / 1440);
    const h = Math.floor((abs % 1440) / 60);
    const m = abs % 60;
    let short = '';
    const sd = t.tasks?.item?.shortDay ?? 'n';
    const sh = t.tasks?.item?.shortHour ?? 'g';
    const sm = t.tasks?.item?.shortMinute ?? 'p';
    if (d) short += `${d}${sd}`;
    if (h) short += `${h}${sh}`;
    if (m || (!d && !h)) short += `${m}${sm}`;
    return short;
  };

  const findOccurrenceForDate = (item: Task, rec?: Recurrence, date?: Date) => {
    if (!rec || !date) return null as any;
    try {
      const occs = plannedHabitOccurrences(item, rec) || [];
      const target = date.getTime();
      const found = occs.find((o: any) => isSameLocalDate(o.endAt, target) || isSameLocalDate(o.startAt, target));
      return found || null;
    } catch {
      return null;
    }
  };

  // Build a per-date occurrence window for ANY task (recurring or not)
  const getRecurrenceFor = (t: Task) =>
    t.recurrence_id ? recurrences.find((r) => r.id === t.recurrence_id) : undefined;

  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
  const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x.getTime(); };

  const getOccurrenceForDate = (t: Task, date: Date): { start: number; end: number } | null => {
    const baseStart = t.start_at ? new Date(t.start_at) : null;
    const baseStartMs = baseStart ? baseStart.getTime() : undefined;
    const baseEndMs = t.end_at ? new Date(t.end_at).getTime() : undefined;
    const selStart = startOfDay(date);
    const selEnd = endOfDay(date);
    if (!t.recurrence_id) {
      const s = baseStartMs != null ? baseStartMs : (baseEndMs != null ? baseEndMs : undefined);
      const e = baseEndMs != null ? baseEndMs : (baseStartMs != null ? baseStartMs : undefined);
      if (s == null || e == null) return null;
      const overlaps = s <= selEnd && e >= selStart;
      if (!overlaps) return null;
      const occStart = Math.max(s, selStart);
      const occEnd = Math.min(e, selEnd);
      return { start: occStart, end: occEnd };
    }
    const r = getRecurrenceFor(t);
    if (!r) {
      const s = baseStartMs != null ? baseStartMs : (baseEndMs != null ? baseEndMs : undefined);
      const e = baseEndMs != null ? baseEndMs : (baseStartMs != null ? baseStartMs : undefined);
      if (s == null || e == null) return null;
      const overlaps = s <= selEnd && e >= selStart;
      if (!overlaps) return null;
      const occStart = Math.max(s, selStart);
      const occEnd = Math.min(e, selEnd);
      return { start: occStart, end: occEnd };
    }
    if (baseStartMs == null || !baseStart) return null;
    const duration = (baseEndMs != null && baseEndMs > baseStartMs) ? (baseEndMs - baseStartMs) : 0;
    const timeH = baseStart.getHours();
    const timeM = baseStart.getMinutes();
    const timeS = baseStart.getSeconds();
    const timeMs = baseStart.getMilliseconds();
    const candStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), timeH, timeM, timeS, timeMs).getTime();
    const candEnd = candStart + duration;
    const recEndMs = r.end_date ? endOfDay(new Date(r.end_date)) : undefined;
    const recStartMs = r.start_date ? new Date(r.start_date).getTime() : undefined;
    const boundaryStart = Math.max(baseStartMs, recStartMs ?? baseStartMs);
    const boundaryEnd = recEndMs ?? Infinity;
    if (candStart < boundaryStart || candStart > boundaryEnd) return null;
    const freq = (r.type || 'daily').toLowerCase();
    if (freq === 'daily') return { start: candStart, end: candEnd };
    if (freq === 'weekly') {
      const map: Record<string, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:0 };
      let days: number[] = [];
      if (r.days_of_week) {
        try { days = (JSON.parse(r.days_of_week) as string[]).map(d=>map[d as keyof typeof map]).filter((n): n is number => n!=null); } catch {}
      }
      if (days.length === 0) days = [baseStart.getDay()];
      return days.includes(date.getDay()) ? { start: candStart, end: candEnd } : null;
    }
    if (freq === 'monthly') {
      let dom: number[] = [];
      if (r.day_of_month) { try { dom = (JSON.parse(r.day_of_month) as string[]).map(s=>parseInt(s,10)).filter(n=>!isNaN(n)); } catch {}
      }
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
      if (t.id === item.id) continue;
      if ((t as any).status === 'completed') continue; // skip fully completed tasks
      const occ = getOccurrenceForDate(t, dateCtx);
      if (!occ) continue; // no occurrence that day
      // If this is a recurring task and that day's occurrence is already completed, skip it
      if (t.recurrence_id) {
        try {
          const done = await isHabitDoneOnDate(t.recurrence_id, dateCtx);
          if (done) continue;
        } catch {}
      }
      if (range.start < occ.end && range.end > occ.start) {
        conflicts.push(t);
      }
    }
    if (conflicts.length > 0) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const fmt = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
      const list = conflicts.slice(0,5).map(c => {
        const occ = getOccurrenceForDate(c, dateCtx)!;
        return `• ${c.title} (${fmt(occ.start)} - ${fmt(occ.end)})`;
      }).join('\n');
      if (onInlineAlert) {
        onInlineAlert({
          tone: 'warning',
          title: t.tasks?.item?.uncompleteBlockedTitle ?? 'Không thể bỏ hoàn thành ⛔',
          message: (t.tasks?.item?.uncompleteBlockedMsgSelectedDay ?? ((lst: string) => `Công việc này bị trùng thời gian với công việc khác đang hoạt động trong ngày đã chọn:\n\n${lst}\n\nVui lòng giải quyết xung đột trước.`))(list),
        });
      } else {
        Alert.alert(
          t.tasks?.item?.uncompleteBlockedTitle ?? 'Không thể bỏ hoàn thành ⛔',
          (t.tasks?.item?.uncompleteBlockedMsgSelectedDay ?? ((lst: string) => `Công việc này bị trùng thời gian với công việc khác đang hoạt động trong ngày đã chọn:\n\n${lst}\n\nVui lòng giải quyết xung đột trước.`))(list),
        );
      }
      return true;
    }
    return false;
  };

  const computeAndSetTodayDisplayLabel = async (dateCtx: Date) => {
    try {
      // try to find a planned occurrence for this date to obtain a sensible dueMs
      const occ: any = findOccurrenceForDate(item, rec, dateCtx);
      let dueMs: number | undefined = undefined;
      if (occ) dueMs = occ.endAt ?? occ.startAt;
      if (!dueMs && item.end_at) dueMs = new Date(item.end_at).getTime();
      const now = Date.now();
      if (!dueMs) {
        // fallback to todayDelta if available
        if (todayDelta && todayDelta.status) {
          const abs = Math.abs(todayDelta.diffMinutes ?? 0);
          const short = buildShortFromMinutes(abs);
          const label = todayDelta.status === 'on_time'
            ? (t.tasks?.item?.todayOnTime ?? 'đúng hạn')
            : `${todayDelta.status === 'early' ? (t.tasks?.item?.todayEarly ?? 'sớm') : (t.tasks?.item?.todayLate ?? 'trễ')} ${short}`;
          setTodayDisplayLabel(label);
        }
        return;
      }

      // Fixed rule: cutoff is 23:59 of the task day
      const d = new Date(dueMs);
      const cutoffMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0).getTime();
      let label: string;
      if (isSameLocalDate(dueMs, now) && cutoffMs > dueMs) {
        if (now <= dueMs) {
          const mins = Math.abs(Math.round((now - dueMs) / 60000));
          label = `${t.tasks?.item?.todayEarly ?? 'sớm'} ${buildShortFromMinutes(mins)}`;
        } else if (now <= cutoffMs) {
          label = t.tasks?.item?.todayOnTime ?? 'đúng hạn';
        } else {
          const mins = Math.round((now - cutoffMs) / 60000);
          label = `${t.tasks?.item?.todayLate ?? 'trễ'} ${buildShortFromMinutes(mins)}`;
        }
      } else {
        const diff = Math.round((now - dueMs) / 60000);
        if (diff < -1) label = `${t.tasks?.item?.todayEarly ?? 'sớm'} ${buildShortFromMinutes(Math.abs(diff))}`;
        else if (diff > 1) label = `${t.tasks?.item?.todayLate ?? 'trễ'} ${buildShortFromMinutes(diff)}`;
        else label = t.tasks?.item?.todayOnTime ?? 'đúng hạn';
      }
      setTodayDisplayLabel(label);
    } catch {
      if (todayDelta && todayDelta.status) {
        const abs = Math.abs(todayDelta.diffMinutes ?? 0);
        const short = buildShortFromMinutes(abs);
        const label = todayDelta.status === 'on_time'
          ? (t.tasks?.item?.todayOnTime ?? 'đúng hạn')
          : `${todayDelta.status === 'early' ? (t.tasks?.item?.todayEarly ?? 'sớm') : (t.tasks?.item?.todayLate ?? 'trễ')} ${short}`;
        setTodayDisplayLabel(label);
      }
    }
  };

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
    ];
    return JSON.stringify(parts);
  }, [rec]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (rec?.id) {
        try {
          const p = await computeHabitProgress(item, rec);
          if (!cancelled) setHabitProgress(p);
          if (!cancelled) {
            const d = await getTodayCompletionDelta(item, rec, selectedDate);
            setTodayDelta(d);
            // If today is not completed, ensure any manual label is cleared
            if (!mergeStreak && (!d || !d.status)) {
              setTodayDisplayLabel(null);
            }
          }
        } catch {}
      } else {
        if (!cancelled) setHabitProgress(null);
        if (!cancelled) setTodayDelta(null);
        if (!cancelled) setTodayDisplayLabel(null);
      }
    };
    load();
    return () => { cancelled = true; };
    }, [item.id, item.start_at, item.end_at, recDeps, mergeStreak, selectedDate?.getTime()]);

  useEffect(() => {
    const listener = async (recId: number) => {
      if (!rec?.id || recId !== rec.id) return;
      try {
        const p = await computeHabitProgress(item, rec);
        setHabitProgress(p);
        const d = await getTodayCompletionDelta(item, rec, selectedDate);
        setTodayDelta(d);
        // Clear or refresh the green label depending on current completion state
        if (!mergeStreak) {
          if (!d || !d.status) {
            setTodayDisplayLabel(null);
          } else if (selectedDate) {
            await computeAndSetTodayDisplayLabel(selectedDate);
          }
        }
      } catch {}
    };
    if (rec?.id) subscribeHabitProgress(listener);
    return () => { if (rec?.id) unsubscribeHabitProgress(listener); };
  }, [rec?.id, item.id, selectedDate?.getTime(), mergeStreak]);

  

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
    // We'll compute diffMinutes/completionStatus inside the async block because computing
    // the effective deadline requires reading AsyncStorage (async).
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
              _diff = Math.round((now - dueMs) / 60000); // negative
            } else if (now <= cutoffMs) {
              _status = 'on_time';
              _diff = 0; // within due->cutoff window
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
        await editTask(item.id!, {
          status: 'completed',
          completed_at: new Date(now).toISOString(),
          completion_diff_minutes: _diff,
          completion_status: _status,
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
                    {t.tasks?.item?.statusPending ?? 'Chờ thực hiện'}
                  </Text>
                )}
                {item.status === "in-progress" && (
                  <Text className="bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 text-base border border-blue-600">
                    {t.tasks?.item?.statusInProgress ?? 'Đang thực hiện'}
                  </Text>
                )}
                {item.status === 'completed' && (
                  <Text className="bg-green-100 text-green-600 rounded-full px-2 py-0.5 text-base border border-green-600">{t.tasks?.item?.statusCompleted ?? 'Hoàn thành'}</Text>
                )}

                {!!reminder && (
                  <View className="flex-row items-center bg-blue-100 rounded-full px-2 py-0.5 border border-blue-600">
                    <Text className="text-blue-600 text-base">🔔</Text>
                  </View>
                )}

                {!!rec && (mergeStreak || (habitProgress && habitProgress.total > 1)) && (
                  <View className="flex-row items-center bg-purple-100 rounded-full px-2 py-0.5 border border-purple-700">
                    <Text className="text-purple-700 text-base">🔄</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })()}

  {!!rec && habitProgress && (mergeStreak || (habitProgress.total > 1)) && (
    <View className="mt-1 mb-2">
            {/* Không hiển thị chữ 'Hoàn thành' cho công việc lặp gộp; chỉ hiện với không gộp khi có hoàn thành trong ngày */}
            {!mergeStreak && habitProgress.total > 1 && todayDelta?.status ? (
              <Text className="text-green-600 mb-1">{t.tasks?.item?.completedWord ?? 'Hoàn thành'}</Text>
            ) : null}
            {/* Chỉ hiển thị thanh tiến độ khi gộp chuỗi hoặc có nhiều hơn 1 lần trong ngày */}
            {(mergeStreak || habitProgress.total > 1) && (
              <>
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-gray-700">{t.tasks?.item?.progressLabel ?? 'Tiến độ'}</Text>
                  <Text className="text-gray-800 font-medium">
                    {habitProgress.completed}/{habitProgress.total} ({habitProgress.percent}%) {mergeStreak ? (t.tasks?.item?.mergedSuffix ?? 'đã gộp') : ''}
                  </Text>
                </View>
                <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <View style={{ width: `${habitProgress.percent}%` }} className="h-2 bg-green-500" />
                </View>
              </>
            )}
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
                  // Before making this occurrence active again, block if it overlaps with other active tasks
                  const occRange = getOccurrenceForDate(item, dateCtx);
                  if (await hasConflictIfUncomplete(occRange, dateCtx)) {
                    return; // keep completed; do not unmark
                  }
                  await unmarkHabitToday(rec.id, dateCtx);
                  setTodayDisplayLabel(null);
                } else {
                  await markHabitToday(rec.id, dateCtx);
                  // compute a cutoff-aware display label once at mark-time
                  try {
                    await computeAndSetTodayDisplayLabel(dateCtx);
                  } catch {}
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
                await editTask(item.id!, {
                  status: 'completed',
                  completed_at: new Date(now).toISOString(),
                  completion_diff_minutes: diffMinutes,
                  completion_status: completionStatus,
                });
              } else if (item.status === 'completed') {
                // Before dropping overall completion, prevent if time conflict occurs for this occurrence/day
                const dateCtx2 = selectedDate ? new Date(selectedDate) : new Date();
                const occ = getOccurrenceForDate(item, dateCtx2);
                if (await hasConflictIfUncomplete(occ, dateCtx2)) {
                  return; // block un-complete
                }
                // drop overall completion if progress < 100%
                await editTask(item.id!, {
                  status: 'in-progress',
                  completed_at: undefined,
                  completion_diff_minutes: undefined,
                  completion_status: undefined,
                });
                setTodayDisplayLabel(null);
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
              await editTask(item.id!, {
                status: nextStatus,
                completed_at: new Date(now).toISOString(),
                completion_diff_minutes: diffMinutes,
                completion_status: completionStatus,
              });
            } else {
              // Un-completing non-recurring: block if conflict with active tasks
              if (item.status === 'completed') {
                const dateCtx = selectedDate ? new Date(selectedDate) : (item.start_at ? new Date(item.start_at) : new Date());
                const baseStart = item.start_at ? new Date(item.start_at).getTime() : undefined;
                const baseEnd = item.end_at ? new Date(item.end_at).getTime() : undefined;
                const range = (baseStart != null && baseEnd != null) ? { start: baseStart, end: baseEnd } : null;
                if (await hasConflictIfUncomplete(range, dateCtx)) {
                  return; // don't change status
                }
              }
              await editTask(item.id!, { status: nextStatus, completed_at: undefined, completion_diff_minutes: undefined, completion_status: undefined });
              setTodayDisplayLabel(null);
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
