// app/stats.tsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Modal,
  Pressable,
} from "react-native";
import { PieChart, BarChart } from "react-native-chart-kit";
import { useTasks } from "../hooks/useTasks";
import { useSchedules } from "../hooks/useSchedules";
import { useRecurrences } from "../hooks/useRecurrences";
import { generateOccurrences } from "../utils/taskValidation";
import {
  plannedHabitOccurrences,
  getHabitCompletions,
  getHabitCompletionTimes,
  computeHabitProgress,
} from "../utils/habits";
import {
  startOfWeek,
  addDays,
  isSameDay,
  format,
  subWeeks,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  subMonths,
  subYears,
} from "date-fns";
import { useTheme } from "../context/ThemeContext";
import AIChatModal from '../components/AIChatModal';
import { useLanguage } from "../context/LanguageContext";

const screenWidth = Dimensions.get("window").width;
const WEEK_PICKER_COUNT = 52;
const MONTH_PICKER_COUNT = 12;

export default function StatsScreen() {
  const { tasks, loadTasks } = useTasks();
  const { schedules, loadSchedules } = useSchedules();
  const { recurrences, loadRecurrences } = useRecurrences();

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { language } = useLanguage();

  const colors = {
    background: isDark ? "#071226" : "#fff",
    surface: isDark ? "#0b1220" : "#fff",
    muted: isDark ? "#9AA4B2" : "#374151",
    text: isDark ? "#E6EEF8" : "#111827",
    cardBg: isDark ? "#0F1724" : "#f8fafc",
    border: isDark ? "#1f2937" : "#eef2ff",
    accent: "#2563EB",
    positive: "#16a34a",
    warn: "#facc15",
    danger: "#ef4444",
    panel: isDark ? "#071226" : "#fff",
    modalBg: isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.15)",
  };

  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedMonthStart, setSelectedMonthStart] = useState(() =>
    startOfMonth(new Date())
  );
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [selectedKind, setSelectedKind] = useState<"tasks" | "schedules">(
    "tasks"
  );
  const [showPicker, setShowPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showYearModal, setShowYearModal] = useState(false);

  useEffect(() => {
    loadTasks();
    loadSchedules();
    loadRecurrences();
  }, [loadTasks, loadSchedules, loadRecurrences]);

  const weekOptions = useMemo(() => {
    const now = startOfWeek(new Date(), { weekStartsOn: 1 });
    const minWeekStart = startOfWeek(subYears(now, 1), { weekStartsOn: 1 });
    return Array.from({ length: WEEK_PICKER_COUNT })
      .map((_, i) => subWeeks(now, i))
      .filter((d) => d.getTime() >= minWeekStart.getTime());
  }, []);

  // ref to the week picker scroll so we can auto-scroll to the selected week
  const weekScrollRef = useRef<any>(null);
  const WEEK_ITEM_HEIGHT = 48; // approximate item height used for scrolling
  // list scrolling helpers: show a scroll region when list has more than N items
  const LIST_ITEM_HEIGHT = 84; // approximate height per task item
  const LIST_VISIBLE_COUNT = 3;

  // when the picker opens for weeks, scroll to the selected week so it's visible
  useEffect(() => {
    if (!showPicker || viewMode !== "week") return;
    try {
      const idx = weekOptions.findIndex((w) => isSameDay(w, selectedWeekStart));
      if (idx >= 0 && weekScrollRef.current && typeof weekScrollRef.current.scrollTo === 'function') {
        const y = Math.max(0, idx * WEEK_ITEM_HEIGHT - WEEK_ITEM_HEIGHT * 2);
        weekScrollRef.current.scrollTo({ y, animated: true });
      }
    } catch (e) {
      // ignore
    }
  }, [showPicker, viewMode, weekOptions, selectedWeekStart]);

  

  const monthOptions = useMemo(() => {
    const now = startOfMonth(new Date());
    const minMonthStart = startOfMonth(subYears(now, 1));
    return Array.from({ length: MONTH_PICKER_COUNT })
      .map((_, i) => subMonths(now, i))
      .filter((d) => d.getTime() >= minMonthStart.getTime());
  }, []);

  // month picker scroll ref + auto-scroll
  const monthScrollRef = useRef<any>(null);
  const MONTH_ITEM_HEIGHT = 48;
  useEffect(() => {
    if (!showPicker || viewMode !== "month") return;
    try {
      const idx = monthOptions.findIndex((m) => m.getTime() === selectedMonthStart.getTime());
      if (idx >= 0 && monthScrollRef.current && typeof monthScrollRef.current.scrollTo === 'function') {
        const y = Math.max(0, idx * MONTH_ITEM_HEIGHT - MONTH_ITEM_HEIGHT * 2);
        monthScrollRef.current.scrollTo({ y, animated: true });
      }
    } catch (e) {
      // ignore
    }
  }, [showPicker, viewMode, monthOptions, selectedMonthStart]);

  const recurrenceMap = useMemo(() => {
    const m: Record<number, any> = {};
    (recurrences || []).forEach((r: any) => {
      if (r.id != null) m[r.id] = r;
    });
    return m;
  }, [recurrences]);

  const mappedTasks = useMemo(() => {
    return (tasks || []).map((t: any) => {
      const start = t.start_at ? new Date(t.start_at) : null;
      const end = t.end_at ? new Date(t.end_at) : null;
      const rawStatus = (t.status ?? "").toString().trim().toLowerCase();
      const completedFlag =
        rawStatus === "completed" ||
        rawStatus === "done" ||
        rawStatus === "finished" ||
        rawStatus === "complete" ||
        t.completed === 1 ||
        t.completed === true;
      const rec = t.recurrence_id ? recurrenceMap[t.recurrence_id] : undefined;
      return { ...t, start, end, rawStatus, completedFlag, recurrence: rec };
    });
  }, [tasks, recurrenceMap]);

  const weekStart = selectedWeekStart;
  const rawWeekEnd = addDays(selectedWeekStart, 6);
  const weekEnd = new Date(
    rawWeekEnd.getFullYear(),
    rawWeekEnd.getMonth(),
    rawWeekEnd.getDate(),
    23,
    59,
    59,
    999
  );
  const monthStart = selectedMonthStart;
  const monthEnd = endOfMonth(selectedMonthStart);
  const now = new Date();
  const nowMs = now.getTime();
  const startOfCurrentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  const isCurrentWeek = weekStart.getTime() === startOfCurrentWeek.getTime();
  const isCurrentMonth = isSameMonth(monthStart, new Date());

  const weekData = useMemo(() => {
    const occsForBar: {
      taskId: number;
      start: Date;
      end: Date;
      baseTask: any;
    }[] = [];
    const tasksInWeek: any[] = [];
    const weekStartMs = weekStart.getTime();
    const weekEndMs = weekEnd.getTime();
    mappedTasks.forEach((t) => {
      if (t.recurrence && t.start) {
        const baseStartMs = t.start.getTime();
        const baseEndMs = t.end
          ? t.end.getTime()
          : (() => {
              const tmp = new Date(baseStartMs);
              tmp.setHours(23, 59, 59, 999);
              return tmp.getTime();
            })();
        // Normalize recurrence end date to end-of-day so the last day is included
        const recEnd = t.recurrence.end_date
          ? (() => {
              const d = new Date(t.recurrence.end_date);
              return new Date(
                d.getFullYear(),
                d.getMonth(),
                d.getDate(),
                23,
                59,
                59,
                999
              ).getTime();
            })()
          : undefined;
        const recConfig = {
          enabled: true,
          frequency: t.recurrence.type || "daily",
          interval: t.recurrence.interval || 1,
          daysOfWeek: t.recurrence.days_of_week
            ? JSON.parse(t.recurrence.days_of_week)
            : [],
          daysOfMonth: t.recurrence.day_of_month
            ? JSON.parse(t.recurrence.day_of_month)
            : [],
          endDate: recEnd,
        } as any;
        let occs: { startAt: number; endAt: number }[] = [];
        try {
          occs = generateOccurrences(baseStartMs, baseEndMs, recConfig);
        } catch {
          occs = [{ startAt: baseStartMs, endAt: baseEndMs }];
        }
        const occsInWeek = occs.filter(
          (o) => !(o.endAt < weekStartMs || o.startAt > weekEndMs)
        );
        if (occsInWeek.length) {
          tasksInWeek.push(t);
          occsInWeek.forEach((o) =>
            occsForBar.push({
              taskId: t.id,
              start: new Date(o.startAt),
              end: new Date(o.endAt),
              baseTask: t,
            })
          );
        }
      } else {
        const s = t.start ?? t.end;
        const e = t.end ?? t.start ?? s;
        if (
          s &&
          e &&
          !(
            e.getTime() < weekStart.getTime() || s.getTime() > weekEnd.getTime()
          )
        ) {
          tasksInWeek.push(t);
          occsForBar.push({ taskId: t.id, start: s, end: e, baseTask: t });
        }
      }
    });
    return { tasksInWeek, occsForBar };
  }, [mappedTasks, weekStart, weekEnd]);

  const monthData = useMemo(() => {
    const occsForBar: {
      taskId: number;
      start: Date;
      end: Date;
      baseTask: any;
    }[] = [];
    const tasksInMonth: any[] = [];
    const mStartMs = monthStart.getTime();
    const mEndMs = monthEnd.getTime();
    mappedTasks.forEach((t) => {
      if (t.recurrence && t.start) {
        const baseStartMs = t.start.getTime();
        const baseEndMs = t.end
          ? t.end.getTime()
          : (() => {
              const tmp = new Date(baseStartMs);
              tmp.setHours(23, 59, 59, 999);
              return tmp.getTime();
            })();
        // Normalize recurrence end date to end-of-day so the last day is included
        const recEnd = t.recurrence.end_date
          ? (() => {
              const d = new Date(t.recurrence.end_date);
              return new Date(
                d.getFullYear(),
                d.getMonth(),
                d.getDate(),
                23,
                59,
                59,
                999
              ).getTime();
            })()
          : undefined;
        const recConfig = {
          enabled: true,
          frequency: t.recurrence.type || "daily",
          interval: t.recurrence.interval || 1,
          daysOfWeek: t.recurrence.days_of_week
            ? JSON.parse(t.recurrence.days_of_week)
            : [],
          daysOfMonth: t.recurrence.day_of_month
            ? JSON.parse(t.recurrence.day_of_month)
            : [],
          endDate: recEnd,
        } as any;
        let occs: { startAt: number; endAt: number }[] = [];
        try {
          occs = generateOccurrences(baseStartMs, baseEndMs, recConfig);
        } catch {
          occs = [{ startAt: baseStartMs, endAt: baseEndMs }];
        }
        const occsInMonth = occs.filter(
          (o) => !(o.endAt < mStartMs || o.startAt > mEndMs)
        );
        if (occsInMonth.length) {
          tasksInMonth.push(t);
          occsInMonth.forEach((o) =>
            occsForBar.push({
              taskId: t.id,
              start: new Date(o.startAt),
              end: new Date(o.endAt),
              baseTask: t,
            })
          );
        }
      } else {
        const s = t.start ?? t.end;
        const e = t.end ?? t.start ?? s;
        if (
          s &&
          e &&
          !(
            e.getTime() < monthStart.getTime() ||
            s.getTime() > monthEnd.getTime()
          )
        ) {
          tasksInMonth.push(t);
          occsForBar.push({ taskId: t.id, start: s, end: e, baseTask: t });
        }
      }
    });
    return { tasksInMonth, occsForBar };
  }, [mappedTasks, monthStart, monthEnd]);

  const weekTasks = weekData.tasksInWeek;

  // Lists of occurrences/items to render in the UI (computed asynchronously)
  const [doingList, setDoingList] = useState<any[]>([]);
  const [doneList, setDoneList] = useState<any[]>([]);
  const [overdueList, setOverdueList] = useState<any[]>([]);
  const [upcomingList, setUpcomingList] = useState<any[]>([]);
  const [computedCounts, setComputedCounts] = useState<{
    total: number;
    done: number;
    doing: number;
    overdue: number;
    upcoming?: number;
  }>({ total: 0, done: 0, doing: 0, overdue: 0, upcoming: 0 });

  const [aiModalVisible, setAiModalVisible] = useState(false);

  const buildAiPrompt = () => {
    const header =
      language === "en"
        ? `I have ${computedCounts.total} tasks in this range, of which ${computedCounts.done} are completed, ${computedCounts.doing} in progress and ${computedCounts.overdue} overdue. (Upcoming: ${computedCounts.upcoming || 0}).`
        : `Tôi có ${computedCounts.total} công việc trong phạm vi này, trong đó ${computedCounts.done} đã hoàn thành, ${computedCounts.doing} đang thực hiện và ${computedCounts.overdue} trễ hạn. (Chờ thực hiện: ${computedCounts.upcoming || 0}).`;
    const lines: string[] = [
      header,
      language === "en"
        ? "\nDetails for each task (title — scheduled time — status / difference from due):"
        : "\nChi tiết từng công việc (tên — thời gian lên lịch — trạng thái / chênh lệch so với hạn):",
    ];

    const allItems = [
      ...doneList.map((i) => ({ ...i, __status: "done" })),
      ...doingList.map((i) => ({ ...i, __status: "doing" })),
      ...overdueList.map((i) => ({ ...i, __status: "overdue" })),
      ...(upcomingList || []).map((i) => ({ ...i, __status: "upcoming" })),
    ];

    const formatMinutesToVn = (mins: number) => {
      const absMin = Math.abs(Math.round(mins));
      const parts: string[] = [];
      const units: { name: string; value: number }[] = [
        { name: language === "en" ? 'year' : 'năm', value: 525600 }, // 365*24*60
        { name: language === "en" ? 'month' : 'tháng', value: 43200 }, // 30*24*60 (approx)
        { name: language === "en" ? 'week' : 'tuần', value: 10080 }, // 7*24*60
        { name: language === "en" ? 'day' : 'ngày', value: 1440 },
        { name: language === "en" ? 'hour' : 'giờ', value: 60 },
        { name: language === "en" ? 'minute' : 'phút', value: 1 },
      ];
      let remaining = absMin;
      for (const u of units) {
        if (remaining >= u.value) {
          const cnt = Math.floor(remaining / u.value);
          remaining = remaining - cnt * u.value;
          parts.push(`${cnt} ${u.name}`);
        }
      }
      if (parts.length === 0) return language === "en" ? '0 minutes' : '0 phút';
      return parts.join(' ');
    };

    // Helpers for AI prompt diff computations with fixed cutoff
    const parseCutoffMs = (msDate: number) => {
      const d = new Date(msDate);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0).getTime();
    };
    const isSameLocalDate = (aMs: number, bMs: number) => {
      const a = new Date(aMs);
      const b = new Date(bMs);
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    };

    allItems.forEach((it, idx) => {
  const title = it.title || (language === "en" ? "(no title)" : "(không tên)");
      const scheduled = (() => {
        try {
          if (it.start && it.end) {
            const dateRange = `${format(it.start, "dd/MM")} - ${format(it.end, "dd/MM")}`;
            const timeRange = `${format(it.start, "HH:mm")} - ${format(it.end, "HH:mm")}`;
            return `${dateRange}, ${timeRange}`;
          }
          if (it.start) return `${format(it.start, "dd/MM")}, ${format(it.start, "HH:mm")}`;
          if (it.end) return `${format(it.end, "dd/MM")}, ${format(it.end, "HH:mm")}`;
        } catch (e) {}
        return language === "en" ? "(no time)" : "(không có thời gian)";
      })();
      // best-effort: if completion diff is available on the item, use it;
      // otherwise if completed_at exists compute relative to due; otherwise
      // compute a live diff (now vs due) so overdue/upcoming items also show a minutes delta
      let diff: number | null = null;
      if ((it as any).completion_diff_minutes != null) {
        diff = (it as any).completion_diff_minutes;
      } else if (it.completed_at) {
        // Completed but without stored diff: compute using fixed cutoff semantics
        try {
          const compMs = new Date(it.completed_at).getTime();
          const dueMs = it.end ? it.end.getTime() : it.start ? it.start.getTime() : null;
          if (dueMs != null) {
            const cutoffForDue = parseCutoffMs(dueMs);
            if (compMs <= dueMs) {
              diff = Math.round((compMs - dueMs) / 60000);
            } else if (isSameLocalDate(compMs, dueMs) && compMs <= cutoffForDue) {
              diff = 0;
            } else {
              diff = Math.round((compMs - cutoffForDue) / 60000);
            }
          }
        } catch {
          diff = null;
        }
      } else {
        // Not completed: live diff vs effective deadline (extend to 23:59 when same day)
        try {
          const dueMs = it.end ? it.end.getTime() : it.start ? it.start.getTime() : null;
          if (dueMs != null) {
            const nowMs = Date.now();
            const cutoffForDue = parseCutoffMs(dueMs);
            const effective = isSameLocalDate(dueMs, nowMs) ? Math.max(dueMs, cutoffForDue) : dueMs;
            diff = Math.round((nowMs - effective) / 60000);
          }
        } catch {
          diff = null;
        }
      }
      let statusLabel = "";
      if (it.__status === "done") {
        statusLabel = language === "en" ? "Completed" : "Đã hoàn thành";
      } else if (it.__status === "doing") {
        statusLabel = language === "en" ? "Doing" : "Đang thực hiện";
      } else if (it.__status === "overdue") {
        statusLabel = language === "en" ? "Overdue" : "Trễ hạn";
      } else {
        statusLabel = language === "en" ? "Upcoming" : "Chờ thực hiện";
      }

      let diffPart = "";
      if (diff != null) {
        const human = formatMinutesToVn(diff);
        // For completed items, prefer 'sớm/trễ/đúng hạn'; for others use 'còn' or 'trễ'
        if (it.__status === 'done') {
          if (language === 'en') {
            const when = diff > 0 ? 'late' : diff < 0 ? 'early' : 'on time';
            diffPart = ` — diff: ${when} ${human}`;
          } else {
            const when = diff > 0 ? 'trễ' : diff < 0 ? 'sớm' : 'đúng hạn';
            diffPart = ` — chênh lệch: ${when} ${human}`;
          }
        } else {
          if (language === 'en') {
            const when = diff > 0 ? 'late' : 'remaining';
            diffPart = ` — diff: ${when} ${human}`;
          } else {
            const when = diff > 0 ? 'trễ' : 'còn';
            diffPart = ` — chênh lệch: ${when} ${human}`;
          }
        }
      }
      lines.push(`${idx + 1}. ${title} — ${scheduled} — ${statusLabel}${diffPart}`);
    });
    lines.push(
      language === "en"
        ? "\nBased on the list above, please: \n1) Evaluate whether my schedule is reasonable or not and provide details.\n2) Assess completion, overdue and on-time rates.\n3) Draw conclusions and suggest improvements."
        : "\nDựa trên danh sách trên, vui lòng đưa ra:\n1) Hãy đánh giá thời gian biểu của tôi một cách chi tiết phù hợp hay không hợp lý gì không.\n2) Đánh giá tỷ lệ hoàn thành, trễ hạn, đúng hạn.\n3) Rút ra kết luận, đưa ra hướng khắc phục."
    );
    return lines.join("\n");
  };
  const aiPrompt = buildAiPrompt();

  const classifications = weekTasks.map((t) => {
    if (t.completedFlag) {
      if (t.completion_status === "late") return "overdue";
      return "done";
    }
    return "doing";
  });

  const totalTasks = computedCounts.total;
  const doneTasks = computedCounts.done;
  const overdueTasks = computedCounts.overdue;
  const doingTasks = computedCounts.doing;

  const tasksPieData = [
    {
      name: language === "en" ? "Completed" : "Hoàn thành",
      population: doneTasks,
      color: colors.positive,
      legendFontColor: colors.text,
      legendFontSize: 12,
    },
    {
      name: language === "en" ? "Doing" : "Đang thực hiện",
      population: doingTasks,
      color: colors.warn,
      legendFontColor: colors.text,
      legendFontSize: 12,
    },
    {
      name: language === "en" ? "Overdue" : "Trễ hạn",
      population: overdueTasks,
      color: colors.danger,
      legendFontColor: colors.text,
      legendFontSize: 12,
    },
  ];
  // If current range (week or month), include upcoming slice
  const isCurrentRange = viewMode === "week" ? isCurrentWeek : isCurrentMonth;
  const pieDataWithUpcoming = isCurrentRange
    ? [
        ...tasksPieData,
        {
          name: language === "en" ? "Upcoming" : "Chờ thực hiện",
          population: computedCounts.upcoming || 0,
          color: "#60a5fa",
          legendFontColor: colors.text,
          legendFontSize: 12,
        },
      ]
    : tasksPieData;

  const weekDays = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekLabels = language === "en" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const weekCounts = weekDays.map(
    (d) => weekData.occsForBar.filter((o) => isSameDay(o.start, d)).length
  );
  const maxWeekCount = useMemo(() => Math.max(0, ...weekCounts), [weekCounts]);
  const monthDays = useMemo(() => {
    const days = [] as Date[];
    const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
    const mEnd = monthEnd.getDate();
    for (let i = 0; i < mEnd; i++) {
      days.push(addDays(d, i));
    }
    return days;
  }, [monthStart, monthEnd]);
  const monthLabels = useMemo(
    () => monthDays.map((d) => String(d.getDate())),
    [monthDays]
  );
  const monthCounts = useMemo(
    () =>
      monthDays.map(
        (d) =>
          (monthData.occsForBar || []).filter((o) => isSameDay(o.start, d))
            .length
      ),
    [monthDays, monthData.occsForBar]
  );
  const maxMonthCount = useMemo(
    () => Math.max(0, ...(monthCounts.length ? monthCounts : [0])),
    [monthCounts]
  );
  // Classify occurrences taking into account recurring tasks and merge_streak.
  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      try {
        const now = Date.now();
        const occs =
          (viewMode === "week" ? weekData.occsForBar : monthData.occsForBar) ||
          [];

        // Fixed cutoff policy: always use 23:59 as the end-of-day cutoff
        const cutoffEnabled = true;
        const cutoffString = '23:59';

        const parseCutoffMs = (msDate: number, cs: string) => {
          try {
            const d = new Date(msDate);
            const [hStr, mStr] = (cs || '23:59').split(':');
            const h = parseInt(hStr || '23', 10);
            const m = parseInt(mStr || '59', 10);
            if (Number.isNaN(h) || Number.isNaN(m)) return null;
            return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
          } catch (e) {
            return null;
          }
        };

        const isSameLocalDate = (aMs: number, bMs: number) => {
          const a = new Date(aMs);
          const b = new Date(bMs);
          return (
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate()
          );
        };

        // Group occurrences by recurrence id for optimized loading
        const nonMergeOccs: any[] = [];
        const mergeRecMap: Record<number, { task: any; rec: any }> = {};
        const nonRecOccs: any[] = [];

        for (const o of occs) {
          const base = o.baseTask || {};
          const rec = base.recurrence;
          if (!rec) {
            nonRecOccs.push(o);
          } else if (rec.merge_streak === 1) {
            // collect a representative task+rec for this recurrence id
            if (rec.id != null && !mergeRecMap[rec.id])
              mergeRecMap[rec.id] = { task: base, rec };
          } else {
            nonMergeOccs.push(o);
          }
        }

        const done: any[] = [];
        const doing: any[] = [];
        const overdue: any[] = [];
        const upcoming: any[] = [];

        // Non-recurring occurrences: use task.completedFlag or end time
        for (const o of nonRecOccs) {
          const t = o.baseTask;
          const isDone = !!t.completedFlag;
          // Apply cutoff: when enabled and the occurrence falls on today's local date,
          // extend effective deadline to the cutoff time for that date.
          let effectiveDeadline = o.end.getTime();
          if (
            cutoffEnabled &&
            isSameLocalDate(o.end.getTime(), now)
          ) {
            const cutoffForDate = parseCutoffMs(o.end.getTime(), cutoffString);
            if (cutoffForDate != null) effectiveDeadline = Math.max(effectiveDeadline, cutoffForDate);
          }
          const isOverdue = !isDone && effectiveDeadline < nowMs;
          const isStarted = o.start && o.start.getTime() <= nowMs;
          const item: any = {
            id: `task-${t.id}-${o.start.getTime()}`,
            title: t.title,
            description: t.description,
            start: o.start,
            end: o.end,
            priority: t.priority,
          };
          // attach stored completion metadata if available from the base task
          if (t.completed_at) item.completed_at = t.completed_at;
          if (t.completion_diff_minutes != null) item.completion_diff_minutes = t.completion_diff_minutes;
          if (t.completion_status) item.completion_status = t.completion_status;
          if (isDone) done.push(item);
          else if (isOverdue) overdue.push(item);
          else if (isStarted) doing.push(item);
          else if (viewMode === "week" ? isCurrentWeek : isCurrentMonth)
            upcoming.push(item);
        }

        // Non-merge recurring occurrences: check completions per ymd
        // Load completions and completion times per recurrence id to avoid repeated async calls
        const recGroups: Record<number, any[]> = {};
        for (const o of nonMergeOccs) {
          const rid = o.baseTask.recurrence_id;
          if (!recGroups[rid]) recGroups[rid] = [];
          recGroups[rid].push(o);
        }
        for (const ridStr of Object.keys(recGroups)) {
          const rid = Number(ridStr);
          const group = recGroups[rid];
          const completions = await getHabitCompletions(rid);
          const times = await getHabitCompletionTimes(rid);
          for (const o of group) {
            const d = new Date(o.start);
            d.setHours(0, 0, 0, 0);
            const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const isDone = completions.has(ymd);
            // Apply cutoff same as non-recurring: extend today's deadline to cutoff when enabled
            const dueMs = o.end.getTime();
            let effectiveDeadlineRec = dueMs;
            if (cutoffEnabled && isSameLocalDate(o.end.getTime(), now)) {
              const cutoffForDate = parseCutoffMs(o.end.getTime(), cutoffString);
              if (cutoffForDate != null) effectiveDeadlineRec = Math.max(effectiveDeadlineRec, cutoffForDate);
            }
            const isOverdue = !isDone && effectiveDeadlineRec < nowMs;
            const isStarted = o.start && o.start.getTime() <= nowMs;
            const t = o.baseTask;
            const item: any = {
              id: `rec-${rid}-${o.start.getTime()}`,
              title: t.title,
              description: t.description,
              start: o.start,
              end: o.end,
              priority: t.priority,
            };

            // If we have a recorded completion time for this ymd, attach completed_at and compute minute diff & status
            const completionTs = times && times[ymd] != null ? times[ymd] : null;
            if (completionTs != null) {
              const completionMs = typeof completionTs === 'number' ? completionTs : Date.parse(String(completionTs));
              if (!isNaN(completionMs)) {
                item.completed_at = new Date(completionMs).toISOString();
                // Apply fixed cutoff semantics: early vs due; due->cutoff on_time (0p); late vs cutoff
                try {
                  const cutoffForDue = parseCutoffMs(dueMs, cutoffString);
                  const withinSameDay = isSameLocalDate(completionMs, dueMs);
                  if (completionMs <= dueMs) {
                    item.completion_status = 'early';
                    item.completion_diff_minutes = Math.round((completionMs - dueMs) / 60000);
                  } else if (withinSameDay && cutoffForDue != null && completionMs <= cutoffForDue) {
                    item.completion_status = 'on_time';
                    item.completion_diff_minutes = 0;
                  } else {
                    const lateBase = cutoffForDue != null ? cutoffForDue : dueMs;
                    item.completion_status = 'late';
                    item.completion_diff_minutes = Math.round((completionMs - lateBase) / 60000);
                  }
                } catch {}
              }
            }

            if (isDone) done.push(item);
            else if (isOverdue) overdue.push(item);
            else if (isStarted) doing.push(item);
            else if (viewMode === "week" ? isCurrentWeek : isCurrentMonth)
              upcoming.push(item);
          }
        }

        // Merge recurrences: count once per recurrence cycle; assign to week if last occurrence end falls inside week
        for (const ridStr of Object.keys(mergeRecMap)) {
          if (cancelled) break;
          const rid = Number(ridStr);
          const { task: baseTask, rec } = mergeRecMap[rid];
          // compute planned occurrences for this recurrence
          const occsAll = plannedHabitOccurrences(baseTask, rec);
          if (!occsAll || occsAll.length === 0) continue;
          // If any occurrence of the cycle intersects the week, we will count one item for the cycle in this week
          const intersects = occsAll.some(
            (o) =>
              !(o.endAt < weekStart.getTime() || o.startAt > weekEnd.getTime())
          );
          if (!intersects) continue;

          // Determine if the cycle has been completed and when (based on per-day completion times)
          const completions = await getHabitCompletions(rid);
          const times = await getHabitCompletionTimes(rid);
          // Build ymd list for the cycle
          const ymds: string[] = occsAll.map((o) => {
            const d = new Date(o.startAt);
            d.setHours(0, 0, 0, 0);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          });
          const allDone = ymds.every((ymd) => completions.has(ymd));
          let completionTimestamp: number | null = null;
          if (allDone) {
            // determine the completion time for the cycle as the latest recorded time among days
            let maxT = 0;
            for (const y of ymds) {
              const tt = times[y];
              if (tt && tt > maxT) maxT = tt;
            }
            completionTimestamp = maxT || null;
          }

          const last = occsAll[occsAll.length - 1];

          // Decide which week to attribute the done status to: only attribute done to this week
          // if completionTimestamp falls inside [weekStart, weekEnd]. If completed earlier/later,
          // we will not mark this cycle as done for the current week.
          if (allDone && completionTimestamp) {
            if (
              completionTimestamp >=
                (viewMode === "week"
                  ? weekStart.getTime()
                  : monthStart.getTime()) &&
              completionTimestamp <=
                (viewMode === "week" ? weekEnd.getTime() : monthEnd.getTime())
            ) {
              const dueMs = last.endAt;
              const item: any = {
                id: `merge-${rid}`,
                title: baseTask.title,
                description: baseTask.description,
                start: new Date(occsAll[0].startAt),
                end: new Date(last.endAt),
                priority: baseTask.priority,
                completed_at: new Date(completionTimestamp).toISOString(),
              };
              try {
                const cutoffForDue = parseCutoffMs(dueMs, cutoffString);
                const withinSameDay = isSameLocalDate(completionTimestamp, dueMs);
                if (completionTimestamp <= dueMs) {
                  item.completion_status = 'early';
                  item.completion_diff_minutes = Math.round((completionTimestamp - dueMs) / 60000);
                } else if (withinSameDay && cutoffForDue != null && completionTimestamp <= cutoffForDue) {
                  item.completion_status = 'on_time';
                  item.completion_diff_minutes = 0;
                } else {
                  const lateBase = cutoffForDue != null ? cutoffForDue : dueMs;
                  item.completion_status = 'late';
                  item.completion_diff_minutes = Math.round((completionTimestamp - lateBase) / 60000);
                }
              } catch {}
              done.push(item);
              continue;
            } else {
              // completed outside this range: do not count here
              continue;
            }
          }

          // Not fully completed within this week; determine overdue vs doing by last.endAt
          let effectiveDeadlineMerge = last.endAt;
          if (cutoffEnabled && isSameLocalDate(last.endAt, now)) {
            const cutoffForDate = parseCutoffMs(last.endAt, cutoffString);
            if (cutoffForDate != null) effectiveDeadlineMerge = Math.max(effectiveDeadlineMerge, cutoffForDate);
          }
          const isOverdue = effectiveDeadlineMerge < nowMs;
          const isStarted = occsAll.some((o) => o.startAt <= nowMs);
          const item = {
            id: `merge-${rid}`,
            title: baseTask.title,
            description: baseTask.description,
            start: new Date(occsAll[0].startAt),
            end: new Date(last.endAt),
            priority: baseTask.priority,
          };
          if (isOverdue) overdue.push(item);
          else if (isStarted) doing.push(item);
          else if (viewMode === "week" ? isCurrentWeek : isCurrentMonth)
            upcoming.push(item);
        }

        const total =
          done.length + doing.length + overdue.length + upcoming.length;
        if (!cancelled) {
          // Only update state when contents actually changed to avoid
          // causing unnecessary re-renders (which can lead to max update depth).
          const sameIds = (a: any[], b: any[]) => {
            if (a === b) return true;
            if (!a || !b) return false;
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
              if ((a[i] && a[i].id) !== (b[i] && b[i].id)) return false;
            }
            return true;
          };

          setDoneList((prev) => (sameIds(prev, done) ? prev : done));
          setDoingList((prev) => (sameIds(prev, doing) ? prev : doing));
          setOverdueList((prev) => (sameIds(prev, overdue) ? prev : overdue));
          setUpcomingList((prev) => (sameIds(prev, upcoming) ? prev : upcoming));

          setComputedCounts((prev) => {
            const next = {
              total,
              done: done.length,
              doing: doing.length,
              overdue: overdue.length,
              upcoming: upcoming.length,
            };
            // shallow compare
            if (
              prev.total === next.total &&
              prev.done === next.done &&
              prev.doing === next.doing &&
              prev.overdue === next.overdue &&
              (prev.upcoming || 0) === (next.upcoming || 0)
            ) {
              return prev;
            }
            return next;
          });
        }
      } catch (e) {
        // swallow errors to avoid breaking UI; keep previous lists
      }
    };
    compute();
    return () => {
      cancelled = true;
    };
  }, [
    weekData.occsForBar,
    monthData.occsForBar,
    mappedTasks,
    recurrences,
    weekStart,
    weekEnd,
    monthStart,
    monthEnd,
    viewMode,
  ]);
  // update effect dependencies to include monthData and viewMode

  const renderTaskItem = ({ item }: { item: any }) => {
  const time = item.start ? `${item.start.toLocaleString()}` : (language === "en" ? "No time" : "Không có giờ");
    const statusColor = item.completedFlag
      ? colors.positive
      : item.end && item.end.getTime() < Date.now()
        ? colors.danger
        : item.rawStatus === "doing" ||
            item.rawStatus === "in progress" ||
            item.rawStatus === "in-progress"
          ? colors.warn
          : colors.muted;
    const priorityColor =
      item.priority === "high"
        ? "#dc2626"
        : item.priority === "medium"
          ? "#f59e0b"
          : item.priority === "green" || item.priority === "low"
            ? "#16a34a"
            : "#94a3b8";
    const indicatorColor = item.priority ? priorityColor : statusColor;
    let priorityLabel = "";
    if (item.priority === "high") priorityLabel = language === "en" ? "High" : "Cao";
    else if (item.priority === "medium") priorityLabel = language === "en" ? "Medium" : "Trung bình";
    else if (item.priority === "low" || item.priority === "green")
      priorityLabel = language === "en" ? "Low" : "Thấp";
    else if (item.priority) priorityLabel = String(item.priority);
    if (priorityLabel)
      priorityLabel =
        priorityLabel.charAt(0).toUpperCase() + priorityLabel.slice(1);

    // Compute minute delta / human-friendly minute label (prefer attached fields)
    const computeMinuteLabel = () => {
      // If we have an explicit completion diff (minutes), use it
      const cDiff = (item as any).completion_diff_minutes;
      const cStatus = (item as any).completion_status;
      const completedAt = item.completed_at || (item.completed_at === null ? null : undefined);
      if (cDiff != null) {
        if (cStatus === 'on_time' || cDiff <= 0)
          return language === "en" ? `on time / early ${Math.abs(cDiff)} minutes` : `đúng hạn / sớm ${Math.abs(cDiff)} phút`;
        return language === "en" ? `late ${cDiff} minutes` : `trễ ${cDiff} phút`;
      }
      // If we have a completed timestamp but no diff, compute best-effort
      if (item.completed_at) {
        try {
          const compMs = new Date(item.completed_at).getTime();
          const dueMs = item.end ? item.end.getTime() : item.start ? item.start.getTime() : null;
          if (dueMs) {
            const diff = Math.round((compMs - dueMs) / 60000);
            if (diff <= 0) return language === "en" ? `on time / early ${Math.abs(diff)} minutes` : `đúng hạn / sớm ${Math.abs(diff)} phút`;
            return language === "en" ? `late ${diff} minutes` : `trễ ${diff} phút`;
          }
        } catch {}
      }
      // If not completed, but has an end time, show how many minutes until/after due
      if (item.end) {
        try {
          const nowMs = Date.now();
          const dueMs = item.end.getTime();
          const diffNow = Math.round((nowMs - dueMs) / 60000);
          if (diffNow > 0) return language === "en" ? `late ${diffNow} minutes` : `trễ ${diffNow} phút`;
          return language === "en" ? `remaining ${Math.abs(diffNow)} minutes` : `còn ${Math.abs(diffNow)} phút`;
        } catch {}
      }
      return null;
    };

    const minuteLabel = computeMinuteLabel();

    return (
      <View
        style={[
          styles.itemWrap,
          { backgroundColor: colors.panel, shadowOpacity: isDark ? 0 : 0.03 },
        ]}
      >
        <View
          style={[styles.statusIndicator, { backgroundColor: indicatorColor }]}
        />
        <View style={styles.itemContent}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            {item.title}
          </Text>
          {item.description ? (
            <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
              {item.description}
            </Text>
          ) : null}
        </View>
        <View style={styles.itemMeta}>
          <Text style={[styles.rowTime, { color: colors.muted }]}>{time}</Text>
          {/* minute diff moved to AI prompt; do not show 'trễ/sớm/đúng hạn X phút' on the card */}
          {item.priority ? (
            <View
              style={[styles.priorityPill, { backgroundColor: priorityColor }]}
            >
              <Text style={styles.priorityText}>{priorityLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>

      
    );
  };

  const mappedSchedules = useMemo(() => {
    return (schedules || []).map((s: any) => {
      const start = s.startAt ? new Date(s.startAt) : null;
      const end = s.endAt ? new Date(s.endAt) : null;
      const rawType = (s.type ?? "").toString().trim();
      const low = rawType.toLowerCase();
      const typeNormalized = /tạm/i.test(rawType)
        ? "tạm ngưng"
        : /bù/i.test(rawType)
          ? "bù"
          : /thi/i.test(rawType)
            ? "thi"
            : /lý|ly/i.test(low)
              ? "lý thuyết"
              : /thực|thuc|thực hành|thuc hanh/i.test(low)
                ? "thực hành"
                : "thường";
      return { ...s, start, end, rawType, typeNormalized };
    });
  }, [schedules]);

  const availableYears = useMemo(() => {
    const setYears = new Set<number>();
    (schedules || []).forEach((s: any) => {
      const tryDates = [s.startAt, s.start, s.singleDate, s.startDate, s.endAt, s.end, s.endDate];
      for (const d of tryDates) {
        if (!d) continue;
        try {
          const dt = d instanceof Date ? d : new Date(d);
          if (!isNaN(dt.getTime())) {
            setYears.add(dt.getFullYear());
            break;
          }
        } catch {}
      }
    });
    return Array.from(setYears).sort((a, b) => b - a);
  }, [schedules]);

  const filteredSchedules = useMemo(() => {
    if (selectedYear == null) return mappedSchedules;
    return mappedSchedules.filter((s: any) => {
      const candidates = [s.start, s.end, s.startAt, s.endAt, s.singleDate, s.startDate, s.endDate];
      for (const c of candidates) {
        if (!c) continue;
        try {
          const dt = c instanceof Date ? c : new Date(c);
          if (!isNaN(dt.getTime()) && dt.getFullYear() === selectedYear) return true;
        } catch {}
      }
      return false;
    });
  }, [mappedSchedules, selectedYear]);

  const TYPE_COLORS: Record<string, string> = {
    "lý thuyết": "#06b6d4",
    "thực hành": "#16a34a",
    "tạm ngưng": "#f97316",
    bù: "#7c3aed",
    thi: "#ef4444",
    thường: "#2563EB",
  };

  // --- per-course stats with taken counts up to today ---
  const perCourseStats = useMemo(() => {
    const map: Record<
      string,
      {
        subject: string;
        total: number;
        lyThuyet: number;
        thucHanh: number;
        tamNgung: number;
        bu: number;
        thi: number;
        sessions: any[];
        takenLyThuyet: number; // buổi LT đã học tới hôm nay
        takenThucHanh: number; // buổi TH đã học tới hôm nay
      }
    > = {};
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    filteredSchedules.forEach((s: any) => {
      const key = (s.subject || s.title || "Không tên").trim();
      if (!map[key])
        map[key] = {
          subject: key,
          total: 0,
          lyThuyet: 0,
          thucHanh: 0,
          tamNgung: 0,
          bu: 0,
          thi: 0,
          sessions: [],
          takenLyThuyet: 0,
          takenThucHanh: 0,
        };
      map[key].sessions.push(s);
      switch (s.typeNormalized) {
        case "tạm ngưng":
          map[key].tamNgung += 1;
          break;
        case "bù":
          map[key].bu += 1;
          break;
        case "thi":
          map[key].thi += 1;
          break;
        case "lý thuyết":
          map[key].lyThuyet += 1;
          break;
        case "thực hành":
          map[key].thucHanh += 1;
          break;
        default:
          break;
      }

      // count taken occurrences up to today (best-effort):
      // - if session has a start date (s.start) use it
      // - if session has singleDate or startDate string, try to parse
      const occDate = s.start ?? s.singleDate ?? s.startDate ?? null;
      let occ: Date | null = null;
      if (occDate instanceof Date) occ = occDate;
      else if (typeof occDate === "string" && occDate.length > 0) {
        const d = new Date(occDate);
        if (!isNaN(d.getTime())) occ = d;
        else {
          // try yyyy-MM-dd
          const m = occDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (m) occ = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        }
      }

      if (occ) {
        // treat sessions with endAt if available
        const end = s.end ?? s.endAt ?? occ;
        const endDate = end instanceof Date ? end : new Date(end);
        if (endDate.getTime() <= todayEnd.getTime()) {
          if (s.typeNormalized === "lý thuyết") map[key].takenLyThuyet += 1;
          else if (s.typeNormalized === "thực hành") map[key].takenThucHanh += 1;
        }
      } else {
        // If no explicit date but there is an explicit date range (startDate & endDate),
        // try approximate counting: if endDate <= today, count number of sessions in range.
        if (s.startDate && s.endDate) {
          const sd = new Date(s.startDate);
          const ed = new Date(s.endDate);
          if (!isNaN(sd.getTime()) && !isNaN(ed.getTime())) {
            if (ed.getTime() <= todayEnd.getTime()) {
              // crude approximation: count days in range as sessions
              const days = Math.max(1, Math.floor((ed.getTime() - sd.getTime()) / (24 * 3600 * 1000)) + 1);
              if (s.typeNormalized === "lý thuyết") map[key].takenLyThuyet += days;
              else if (s.typeNormalized === "thực hành") map[key].takenThucHanh += days;
            } else if (sd.getTime() <= todayEnd.getTime() && ed.getTime() > todayEnd.getTime()) {
              // partially happened up to today
              const days = Math.max(1, Math.floor((todayEnd.getTime() - sd.getTime()) / (24 * 3600 * 1000)) + 1);
              if (s.typeNormalized === "lý thuyết") map[key].takenLyThuyet += days;
              else if (s.typeNormalized === "thực hành") map[key].takenThucHanh += days;
            }
          }
        }
      }
    });
    const result = Object.values(map).map((v) => ({
      ...v,
      total: (v.lyThuyet || 0) + (v.thucHanh || 0),
    }));
    return result.sort((a, b) => b.total - a.total);
  }, [filteredSchedules]);

  const scheduleTypeCounts = useMemo(() => {
    const counts = { thuong: 0, tamNgung: 0, bu: 0, thi: 0 };
    filteredSchedules.forEach((s: any) => {
      if (s.typeNormalized === "tạm ngưng") counts.tamNgung++;
      else if (s.typeNormalized === "bù") counts.bu++;
      else if (s.typeNormalized === "thi") counts.thi++;
      else counts.thuong++;
    });
    return counts;
  }, [filteredSchedules]);

  const totalSessionsLTTH = useMemo(() => {
    return filteredSchedules.filter(
      (s: any) =>
        s.typeNormalized === "lý thuyết" || s.typeNormalized === "thực hành"
    ).length;
  }, [filteredSchedules]);

  const weekDayLabels =
    language === "en"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const weekCountsSched = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    filteredSchedules.forEach((s: any) => {
      if (!s.start) return;
      const wd = s.start.getDay();
      const idx = wd === 0 ? 6 : wd - 1;
      counts[idx] = counts[idx] + 1;
    });
    return counts;
  }, [filteredSchedules]);
  const maxSchedCount = useMemo(
    () => Math.max(0, ...weekCountsSched),
    [weekCountsSched]
  );

  const onSelectWeek = (d: Date) => {
    setSelectedWeekStart(startOfWeek(d, { weekStartsOn: 1 }));
    setShowPicker(false);
  };

  const onSelectMonth = (m: Date) => {
    setSelectedMonthStart(startOfMonth(m));
    setShowPicker(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <Text style={[styles.header, { color: colors.text }]}>
        {language === "en" ? "Reports & Stats" : "Báo cáo & Thống kê"}
      </Text>

      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}
      >
        {selectedKind === "tasks" ? (
          <TouchableOpacity
            style={[
              styles.weekDropdown,
              { backgroundColor: colors.panel, borderColor: colors.border },
            ]}
            onPress={() => setShowPicker(true)}
          >
            <Text style={[styles.weekDropdownText, { color: colors.text }]}>
              {viewMode === "week"
                ? `${format(selectedWeekStart, "dd/MM")} - ${format(addDays(selectedWeekStart, 6), "dd/MM")}`
                : `${format(selectedMonthStart, "MM/yyyy")}`}
            </Text>
          </TouchableOpacity>
        ) : null}

        {selectedKind === "schedules" ? (
          <TouchableOpacity
            style={[
              styles.weekDropdown,
              { backgroundColor: colors.panel, borderColor: colors.border, marginRight: 8 },
            ]}
            onPress={() => setShowYearModal(true)}
          >
            <Text style={[styles.weekDropdownText, { color: colors.text }]}>
              {selectedYear == null ? (language === "en" ? "All years" : "Tất cả") : String(selectedYear)}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ flexDirection: "row", marginLeft: "auto" }}>
          <TouchableOpacity
            style={[
              styles.kindBtn,
              selectedKind === "tasks" && styles.kindBtnActive,
              {
                backgroundColor:
                  selectedKind === "tasks" ? colors.accent : colors.panel,
              },
            ]}
            onPress={() => setSelectedKind("tasks")}
          >
              <Text
                style={[
                  styles.kindBtnText,
                  selectedKind === "tasks" && styles.kindBtnTextActive,
                  { color: selectedKind === "tasks" ? "#fff" : colors.text },
                ]}
              >
              {language === "en" ? "Tasks" : "Công việc"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.kindBtn,
              selectedKind === "schedules" && styles.kindBtnActive,
              {
                marginLeft: 8,
                backgroundColor:
                  selectedKind === "schedules" ? colors.accent : colors.panel,
              },
            ]}
            onPress={() => setSelectedKind("schedules")}
          >
              <Text
                style={[
                  styles.kindBtnText,
                  selectedKind === "schedules" && styles.kindBtnTextActive,
                  { color: selectedKind === "schedules" ? "#fff" : colors.text },
                ]}
              >
              {language === "en" ? "Schedules" : "Lịch học"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={showYearModal && selectedKind === "schedules"}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearModal(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: colors.modalBg }]}
          onPress={() => setShowYearModal(false)}
        >
          <View style={[styles.weekModal, { backgroundColor: colors.panel }]}> 
            <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 8, color: colors.text }}>
              {language === "en" ? "Select year" : "Chọn năm"}
            </Text>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingVertical: 4 }}>
              <TouchableOpacity
                style={[styles.weekModalItem, selectedYear == null && styles.weekModalItemActive, { backgroundColor: selectedYear == null ? colors.accent : colors.panel }]}
                onPress={() => { setSelectedYear(null); setShowYearModal(false); }}
              >
                <Text style={[styles.weekModalItemText, selectedYear == null && styles.weekModalItemTextActive, { color: selectedYear == null ? '#fff' : colors.text }]}>
                  {language === "en" ? "All years" : "Tất cả"}
                </Text>
              </TouchableOpacity>
              {availableYears.map((y) => {
                const isSelected = selectedYear === y;
                return (
                  <TouchableOpacity
                    key={String(y)}
                    style={[styles.weekModalItem, isSelected && styles.weekModalItemActive, { backgroundColor: isSelected ? colors.accent : colors.panel }]}
                    onPress={() => { setSelectedYear(y); setShowYearModal(false); }}
                  >
                    <Text style={[styles.weekModalItemText, isSelected && styles.weekModalItemTextActive, { color: isSelected ? '#fff' : colors.text }]}>{String(y)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* AI suggestion quick action - only visible on Tasks view */}
      {selectedKind === "tasks" && (
        <View style={{ marginBottom: 12 }}>
          <TouchableOpacity
            style={[styles.aiSuggestBtn, { backgroundColor: isDark ? "#2563EB" : "#2563EB" }]}
            onPress={() => setAiModalVisible(true)}
          >
            <Text style={styles.aiSuggestBtnText}>{language === "en" ? "🤖 AI review tasks" : "🤖 Nhận xét công việc từ AI"}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={showPicker && selectedKind === "tasks"}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: colors.modalBg }]}
          onPress={() => setShowPicker(false)}
        >
          <View style={[styles.weekModal, { backgroundColor: colors.panel }]}> 
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Text
                style={{ fontWeight: "700", fontSize: 16, color: colors.text }}
              >
                {viewMode === "week"
                  ? (language === "en" ? `Select week (${format(selectedWeekStart, "MM/yyyy")})` : `Chọn tuần (${format(selectedWeekStart, "MM/yyyy")})`)
                  : (language === "en" ? `Select month (${format(selectedMonthStart, "yyyy")})` : `Chọn tháng (${format(selectedMonthStart, "yyyy")})`)}
              </Text>
              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  onPress={() => setViewMode("week")}
                  style={{
                    marginRight: 8,
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor:
                      viewMode === "week" ? colors.accent : colors.panel,
                  }}
                >
                  <Text
                    style={{
                      color: viewMode === "week" ? "#fff" : colors.text,
                      fontWeight: "700",
                    }}
                  >
                    {language === "en" ? "Week" : "Tuần"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setViewMode("month")}
                  style={{
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor:
                      viewMode === "month" ? colors.accent : colors.panel,
                  }}
                >
                  <Text
                    style={{
                      color: viewMode === "month" ? "#fff" : colors.text,
                      fontWeight: "700",
                    }}
                  >
                    {language === "en" ? "Month" : "Tháng"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {viewMode === "week"
              ? (
                <ScrollView
                  ref={weekScrollRef}
                  style={{ maxHeight: 360 }}
                  contentContainerStyle={{ paddingVertical: 4 }}
                  showsVerticalScrollIndicator
                >
                  {weekOptions.map((week) => {
                    const isSelected = isSameDay(week, selectedWeekStart);
                    const isCurrent = isSameDay(
                      week,
                      startOfWeek(new Date(), { weekStartsOn: 1 })
                    );
                    return (
                      <TouchableOpacity
                        key={week.toISOString()}
                        style={[
                          styles.weekModalItem,
                          isSelected && styles.weekModalItemActive,
                          !isSelected && isCurrent && styles.weekModalItemCurrent,
                          {
                            backgroundColor: isSelected
                              ? colors.accent
                              : !isSelected && isCurrent
                                ? isDark
                                  ? "#07315a"
                                  : "#e0e7ff"
                                : colors.panel,
                          },
                        ]}
                        onPress={() => onSelectWeek(week)}
                      >
                        <Text
                          style={[
                            styles.weekModalItemText,
                            isSelected && styles.weekModalItemTextActive,
                            !isSelected &&
                              isCurrent &&
                              styles.weekModalItemTextCurrent,
                            { color: isSelected ? "#fff" : colors.text },
                          ]}
                        >
                          {format(week, "dd/MM")} -{" "}
                          {format(addDays(week, 6), "dd/MM")}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )
              : monthOptions.map((m) => {
                  const selMonth = startOfMonth(m);
                  const isSelected =
                    selMonth.getTime() === selectedMonthStart.getTime();
                  const isCurrent = isSameMonth(m, new Date());
                  return (
                    <TouchableOpacity
                      key={m.toISOString()}
                      style={[
                        styles.weekModalItem,
                        isSelected && styles.weekModalItemActive,
                        !isSelected && isCurrent && styles.weekModalItemCurrent,
                        {
                          backgroundColor: isSelected
                            ? colors.accent
                            : !isSelected && isCurrent
                              ? isDark
                                ? "#07315a"
                                : "#e0e7ff"
                              : colors.panel,
                        },
                      ]}
                      onPress={() => onSelectMonth(m)}
                    >
                      <Text
                        style={[
                          styles.weekModalItemText,
                          isSelected && styles.weekModalItemTextActive,
                          !isSelected &&
                            isCurrent &&
                            styles.weekModalItemTextCurrent,
                          { color: isSelected ? "#fff" : colors.text },
                        ]}
                      >
                        {format(m, "MM/yyyy")}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
          </View>
        </Pressable>
      </Modal>

      {selectedKind === "tasks" && (
        <>
          <View style={styles.kpiRow}>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: isDark ? "#071226" : "#f0f7ff" },
              ]}
            >
              <Text style={[styles.kpiValue, { color: colors.accent }]}>
                {totalTasks}
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.muted }]}>
                {language === "en" ? "Total tasks" : "Tổng công việc"}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: isDark ? "#072614" : "#ecfdf5" },
              ]}
            >
              <Text style={[styles.kpiValue, { color: colors.positive }]}>
                {doneTasks}
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.muted }]}>
                {language === "en" ? "Completed" : "Đã hoàn thành"}
              </Text>
            </View>
            {(viewMode === "week" ? isCurrentWeek : isCurrentMonth) ? (
              <View
                style={[
                  styles.kpiCard,
                  { backgroundColor: isDark ? "#0a1726" : "#e6f0ff" },
                ]}
              >
                <Text style={[styles.kpiValue, { color: "#60a5fa" }]}>
                  {computedCounts.upcoming || 0}
                </Text>
                <Text style={[styles.kpiLabel, { color: colors.muted }]}>
                  {language === "en" ? "Upcoming" : "Chờ thực hiện"}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.kpiRow}>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: isDark ? "#2b1f00" : "#fefce8" },
              ]}
            >
              <Text style={[styles.kpiValue, { color: "#ca8a04" }]}>
                {doingTasks}
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.muted }]}> 
                {language === "en" ? "In progress" : "Đang thực hiện"}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: isDark ? "#2b0f10" : "#fef2f2" },
              ]}
            >
              <Text style={[styles.kpiValue, { color: colors.danger }]}>
                {overdueTasks}
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.muted }]}> 
                {language === "en" ? "Overdue" : "Trễ hạn"}
              </Text>
            </View>
          </View>

          <Text style={[styles.subHeader, { color: colors.text }]}>
            {language === "en" ? "Status distribution" : "Tỷ lệ trạng thái"}
          </Text>
          <PieChart
            data={pieDataWithUpcoming}
            width={screenWidth - 32}
            height={200}
            chartConfig={{ color: () => `#000` }}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"16"}
            absolute
          />

          <Text style={[styles.subHeader, { color: colors.text }]}> 
            {viewMode === "week"
              ? (language === "en" ? "Tasks per day (week)" : "Số công việc theo ngày (tuần)")
              : (language === "en" ? `Tasks per day (month ${format(monthStart, "MM/yyyy")})` : `Số công việc theo ngày (tháng ${format(monthStart, "MM/yyyy")})`)}
          </Text>
          {viewMode === "week" ? (
            <BarChart
              data={{ labels: weekLabels, datasets: [{ data: weekCounts }] }}
              width={screenWidth - 32}
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              fromZero
              showValuesOnTopOfBars
              segments={Math.max(1, maxWeekCount)}
              chartConfig={{
                backgroundColor: colors.surface,
                backgroundGradientFrom: colors.surface,
                backgroundGradientTo: colors.surface,
                decimalPlaces: 0,
                color: (opacity = 1) =>
                  `${colors.accent}${Math.round(opacity * 255)
                    .toString(16)
                    .padStart(2, "0")}`,
                labelColor: (opacity = 1) => colors.text,
                propsForLabels: {
                  fontSize: "12",
                  fontWeight: "bold",
                  fill: colors.text,
                },
              }}
              style={{
                borderRadius: 8,
                paddingLeft: 0,
              }}
            />
          ) : (
            // For month view, render chart in horizontal scroll to avoid dense columns
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <BarChart
                data={{
                  labels: monthLabels,
                  datasets: [{ data: monthCounts }],
                }}
                width={Math.max(screenWidth - 16, monthLabels.length * 40)}
                height={220}
                yAxisLabel=""
                yAxisSuffix=""
                fromZero
                showValuesOnTopOfBars
                segments={Math.max(1, maxMonthCount)}
                chartConfig={{
                  backgroundColor: colors.surface,
                  backgroundGradientFrom: colors.surface,
                  backgroundGradientTo: colors.surface,
                  decimalPlaces: 0,
                  color: (opacity = 1) =>
                    `${colors.accent}${Math.round(opacity * 255)
                      .toString(16)
                      .padStart(2, "0")}`,
                  labelColor: (opacity = 1) => colors.text,
                  barPercentage: 0.7, // Giúp các cột có độ rộng nhất quán
                  propsForLabels: {
                    fontSize: "12",
                    fontWeight: "bold",
                    fill: colors.text,
                  },
                }}
                style={{
                  borderRadius: 8,
                  paddingRight: 20, // Thêm khoảng đệm bên phải để cột cuối không bị mất
                }}
              />
            </ScrollView>
          )}
          <View
            style={{
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              marginVertical: 12,
            }}
          />

          <Text style={[styles.subHeader, { color: "#ca8a04" }]}> 
            {language === "en" ? "In progress" : "Công việc đang thực hiện"}
          </Text>
          {doingList.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}> 
              {language === "en" ? "None" : "Không có"}
            </Text>
          ) : doingList.length > LIST_VISIBLE_COUNT ? (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              persistentScrollbar
              style={{ maxHeight: LIST_ITEM_HEIGHT * LIST_VISIBLE_COUNT }}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {doingList.map((item) => (
                <View key={String(item.id)}>{renderTaskItem({ item })}</View>
              ))}
            </ScrollView>
          ) : (
            <>
              {doingList.map((item) => (
                <View key={String(item.id)}>{renderTaskItem({ item })}</View>
              ))}
            </>
          )}

          <Text
            style={[
              styles.subHeader,
              { marginTop: 12, color: colors.positive },
            ]}
          >
            {language === "en" ? "Completed tasks" : "Công việc đã hoàn thành"}
          </Text>
          {doneList.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}> 
              {language === "en" ? "None" : "Không có"}
            </Text>
          ) : doneList.length > LIST_VISIBLE_COUNT ? (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              persistentScrollbar
              style={{ maxHeight: LIST_ITEM_HEIGHT * LIST_VISIBLE_COUNT }}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {doneList.map((item) => (
                <View key={String(item.id)}>{renderTaskItem({ item })}</View>
              ))}
            </ScrollView>
          ) : (
            <>
              {doneList.map((item) => (
                <View key={String(item.id)}>{renderTaskItem({ item })}</View>
              ))}
            </>
          )}

          <Text
            style={[styles.subHeader, { marginTop: 12, color: colors.danger }]}
          >
            {language === "en" ? "Overdue tasks" : "Công việc trễ hạn"}
          </Text>
          {overdueList.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}> 
              {language === "en" ? "None" : "Không có"}
            </Text>
          ) : overdueList.length > LIST_VISIBLE_COUNT ? (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              persistentScrollbar
              style={{ maxHeight: LIST_ITEM_HEIGHT * LIST_VISIBLE_COUNT }}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {overdueList.map((item) => (
                <View key={String(item.id)}>{renderTaskItem({ item })}</View>
              ))}
            </ScrollView>
          ) : (
            <>
              {overdueList.map((item) => (
                <View key={String(item.id)}>{renderTaskItem({ item })}</View>
              ))}
            </>
          )}

          {(viewMode === "week" ? isCurrentWeek : isCurrentMonth) && (
            <>
              <Text
                style={[styles.subHeader, { marginTop: 12, color: "#60a5fa" }]}
              >
                {language === "en" ? "Upcoming tasks" : "Công việc chờ thực hiện"}
              </Text>
                {upcomingList.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.muted }]}> 
                    {language === "en" ? "None" : "Không có"}
                  </Text>
                ) : upcomingList.length > LIST_VISIBLE_COUNT ? (
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    persistentScrollbar
                    style={{ maxHeight: LIST_ITEM_HEIGHT * LIST_VISIBLE_COUNT }}
                    contentContainerStyle={{ paddingBottom: 4 }}
                  >
                    {upcomingList.map((item) => (
                      <View key={String(item.id)}>{renderTaskItem({ item })}</View>
                    ))}
                  </ScrollView>
                ) : (
                  <>
                    {upcomingList.map((item) => (
                      <View key={String(item.id)}>{renderTaskItem({ item })}</View>
                    ))}
                  </>
                )}
            </>
          )}

          <AIChatModal visible={aiModalVisible} onClose={() => setAiModalVisible(false)} initialPrompt={aiPrompt} />
        </>
      )}

      {selectedKind === "schedules" && (
        <>
          <Text style={[styles.subHeader, { color: colors.text }]}>
            {language === "en" ? "Schedules overview" : "Tổng quan Lịch học"}
          </Text>

          <View style={styles.kpiRow}>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: isDark ? "#071226" : "#f8fafc" },
              ]}
            >
              <Text style={[styles.kpiValue, { color: colors.accent }]}> 
                {totalSessionsLTTH}
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.muted }]}> 
                {language === "en" ? "Total sessions" : "Tổng buổi"}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: isDark ? "#2b1608" : "#fff7ed" },
              ]}
            >
              <Text style={[styles.kpiValue, { color: "#c2410c" }]}> 
                {scheduleTypeCounts.thi}
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.muted }]}> 
                {language === "en" ? "Exam sessions" : "Lịch thi"}
              </Text>
            </View>
          </View>

          <Text style={[styles.subHeader, { color: colors.text }]}>
            {language === "en" ? "Session type distribution" : "Tỉ lệ loại buổi"}
          </Text>
          <PieChart
            data={[
              {
                name: language === "en" ? "Regular sessions" : "Buổi thường",
                population: scheduleTypeCounts.thuong,
                color: "#3b82f6",
                legendFontColor: colors.text,
                legendFontSize: 12,
              },
              {
                name: language === "en" ? "Paused" : "Tạm ngưng",
                population: scheduleTypeCounts.tamNgung,
                color: "#f97316",
                legendFontColor: colors.text,
                legendFontSize: 12,
              },
              {
                name: language === "en" ? "Makeup sessions" : "Buổi bù",
                population: scheduleTypeCounts.bu,
                color: "#7c3aed",
                legendFontColor: colors.text,
                legendFontSize: 12,
              },
              {
                name: language === "en" ? "Exam sessions" : "Lịch thi",
                population: scheduleTypeCounts.thi,
                color: "#ef4444",
                legendFontColor: colors.text,
                legendFontSize: 12,
              },
            ]}
            width={screenWidth - 32}
            height={200}
            chartConfig={{ color: () => `#000` }}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"16"}
            absolute
          />

          <Text style={[styles.subHeader, { color: colors.text }]}>
            {language === "en" ? "Sessions per day (overall)" : "Số buổi theo ngày trong tuần (Tổng dữ liệu)"}
          </Text>
          <BarChart
            data={{
              labels: weekDayLabels,
              datasets: [{ data: weekCountsSched }],
            }}
            width={screenWidth - 32}
            height={200}
            yAxisLabel=""
            yAxisSuffix=""
            fromZero
            showValuesOnTopOfBars
            segments={Math.max(1, maxSchedCount)}
            chartConfig={{
              backgroundColor: colors.surface,
              backgroundGradientFrom: colors.surface,
              backgroundGradientTo: colors.surface,
              decimalPlaces: 0,
              color: (opacity = 1) =>
                `${colors.accent}${Math.round(opacity * 255)
                  .toString(16)
                  .padStart(2, "0")}`,
              labelColor: (opacity = 1) => colors.text,
              propsForLabels: {
                fontSize: "12",
                fontWeight: "bold",
                fill: colors.text,
              },
            }}
            style={{
              borderRadius: 8,
              paddingLeft: -15,
            }}
          />
          <View
            style={{
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              marginVertical: 12,
            }}
          />

          <Text style={[styles.subHeader, { color: colors.accent }]}> 
            {language === "en" ? "Stats by subject" : "Thống kê theo môn"}
          </Text>
          {perCourseStats.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}> 
              {language === "en" ? "No schedules" : "Không có lịch"}
            </Text>
          ) : (
            perCourseStats.map((c) => (
              <View
                key={c.subject}
                style={[
                  styles.itemWrap,
                  {
                    flexDirection: "column",
                    alignItems: "stretch",
                    backgroundColor: colors.panel,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontWeight: "700", color: colors.text }}>
                    {c.subject}
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    <Text style={{ fontWeight: "700" }}>{language === "en" ? "Theory: " : "LT: "}</Text>{c.lyThuyet}{"  "}
                    <Text style={{ fontWeight: "700" }}>{language === "en" ? "Practice: " : "TH: "}</Text>{c.thucHanh}
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    marginTop: 8,
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#06b6d4" }}>
                    {language === "en" ? `Theory: Session ${c.takenLyThuyet || 0}` : `Lý thuyết: Buổi ${c.takenLyThuyet || 0}`}
                  </Text>
                  <Text style={{ color: "#16a34a" }}>
                    {language === "en" ? `Practice: Session ${c.takenThucHanh || 0}` : `Thực hành: Buổi ${c.takenThucHanh || 0}`}
                  </Text>
                  <Text style={{ color: "#f97316" }}>
                    {language === "en" ? `Paused: ${c.tamNgung}` : `Tạm ngưng: ${c.tamNgung}`}
                  </Text>
                  <Text style={{ color: "#7c3aed" }}>{language === "en" ? `Makeup sessions: ${c.bu}` : `Buổi bù: ${c.bu}`}</Text>
                </View>
              </View>
            ))
          )}
        </>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 18, fontWeight: "700", marginBottom: 12 },

  kpiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: "center",
  },
  kpiValue: { fontSize: 20, fontWeight: "700" },
  kpiLabel: { fontSize: 13, marginTop: 4 },
  subHeader: { fontSize: 16, fontWeight: "700", marginVertical: 12 },

  empty: { fontSize: 14, textAlign: "center", paddingVertical: 8 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
  rowTime: { fontSize: 12, marginLeft: 8 },

  itemWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 8,
    shadowColor: "#000",
    shadowRadius: 4,
    elevation: 1,
  },
  statusIndicator: {
    width: 8,
    height: "100%",
    borderRadius: 6,
    marginRight: 10,
    alignSelf: "stretch",
  },
  itemContent: {
    flex: 1,
    paddingRight: 8,
  },
  itemMeta: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 96,
  },
  priorityPill: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  priorityText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  weekDropdown: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 180,
  },
  weekDropdownText: { fontWeight: "700" },

  kindBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  kindBtnActive: {},
  kindBtnText: { fontWeight: "700" },
  kindBtnTextActive: { color: "#fff" },

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  weekModal: {
    borderRadius: 12,
    padding: 18,
    minWidth: 260,
    elevation: 4,
  },
  weekModalItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  weekModalItemActive: {
    backgroundColor: "#2563EB",
  },
  weekModalItemCurrent: {
    backgroundColor: "#e0e7ff",
  },
  weekModalItemText: {
    fontWeight: "600",
    fontSize: 15,
  },
  weekModalItemTextActive: {
    color: "#fff",
  },
  weekModalItemTextCurrent: {
    color: "#2563EB",
    fontWeight: "700",
  },

  aiSuggestBox: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    marginTop: 8,
  },
  aiSuggestTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  aiSuggestContent: {},
  aiSuggestText: {
    fontSize: 14,
    marginBottom: 4,
  },
  aiSuggestBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  aiSuggestBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
