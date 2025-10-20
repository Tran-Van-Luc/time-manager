// app/stats.tsx
import React, { useEffect, useMemo, useState } from "react";
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
} from "date-fns";
import { useTheme } from "../context/ThemeContext";

const screenWidth = Dimensions.get("window").width;
const WEEK_PICKER_COUNT = 12;

export default function StatsScreen() {
  const { tasks, loadTasks } = useTasks();
  const { schedules, loadSchedules } = useSchedules();
  const { recurrences, loadRecurrences } = useRecurrences();

  const { theme } = useTheme();
  const isDark = theme === "dark";

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

  useEffect(() => {
    loadTasks();
    loadSchedules();
    loadRecurrences();
  }, [loadTasks, loadSchedules, loadRecurrences]);

  const weekOptions = useMemo(() => {
    const now = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: WEEK_PICKER_COUNT }).map((_, i) =>
      subWeeks(now, i)
    );
  }, []);

  const monthOptions = useMemo(() => {
    const now = startOfMonth(new Date());
    return Array.from({ length: WEEK_PICKER_COUNT }).map((_, i) =>
      subMonths(now, i)
    );
  }, []);

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
        const recEnd = t.recurrence.end_date
          ? new Date(t.recurrence.end_date).getTime()
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
        const recEnd = t.recurrence.end_date
          ? new Date(t.recurrence.end_date).getTime()
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
      name: "Hoàn thành",
      population: doneTasks,
      color: colors.positive,
      legendFontColor: colors.text,
      legendFontSize: 12,
    },
    {
      name: "Đang thực hiện",
      population: doingTasks,
      color: colors.warn,
      legendFontColor: colors.text,
      legendFontSize: 12,
    },
    {
      name: "Trễ hạn",
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
          name: "Chờ thực hiện",
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
  const weekLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
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
          const isOverdue = !isDone && o.end.getTime() < nowMs;
          const isStarted = o.start && o.start.getTime() <= nowMs;
          const item = {
            id: `task-${t.id}-${o.start.getTime()}`,
            title: t.title,
            description: t.description,
            start: o.start,
            end: o.end,
            priority: t.priority,
          };
          if (isDone) done.push(item);
          else if (isOverdue) overdue.push(item);
          else if (isStarted) doing.push(item);
          else if (viewMode === "week" ? isCurrentWeek : isCurrentMonth)
            upcoming.push(item);
        }

        // Non-merge recurring occurrences: check completions per ymd
        // Load completions per recurrence id to avoid repeated async calls
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
          for (const o of group) {
            const d = new Date(o.start);
            d.setHours(0, 0, 0, 0);
            const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const isDone = completions.has(ymd);
            const isOverdue = !isDone && o.end.getTime() < nowMs;
            const isStarted = o.start && o.start.getTime() <= nowMs;
            const t = o.baseTask;
            const item = {
              id: `rec-${rid}-${o.start.getTime()}`,
              title: t.title,
              description: t.description,
              start: o.start,
              end: o.end,
              priority: t.priority,
            };
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
              const item = {
                id: `merge-${rid}`,
                title: baseTask.title,
                description: baseTask.description,
                start: new Date(occsAll[0].startAt),
                end: new Date(last.endAt),
                priority: baseTask.priority,
              };
              done.push(item);
              continue;
            } else {
              // completed outside this range: do not count here
              continue;
            }
          }

          // Not fully completed within this week; determine overdue vs doing by last.endAt
          const isOverdue = last.endAt < nowMs;
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
    const time = item.start ? `${item.start.toLocaleString()}` : "Không có giờ";
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
    if (item.priority === "high") priorityLabel = "Cao";
    else if (item.priority === "medium") priorityLabel = "Trung bình";
    else if (item.priority === "low" || item.priority === "green")
      priorityLabel = "Thấp";
    else if (item.priority) priorityLabel = String(item.priority);
    if (priorityLabel)
      priorityLabel =
        priorityLabel.charAt(0).toUpperCase() + priorityLabel.slice(1);

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

    mappedSchedules.forEach((s: any) => {
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
  }, [mappedSchedules]);

  const scheduleTypeCounts = useMemo(() => {
    const counts = { thuong: 0, tamNgung: 0, bu: 0, thi: 0 };
    mappedSchedules.forEach((s: any) => {
      if (s.typeNormalized === "tạm ngưng") counts.tamNgung++;
      else if (s.typeNormalized === "bù") counts.bu++;
      else if (s.typeNormalized === "thi") counts.thi++;
      else counts.thuong++;
    });
    return counts;
  }, [mappedSchedules]);

  const totalSessionsLTTH = useMemo(() => {
    return mappedSchedules.filter(
      (s: any) =>
        s.typeNormalized === "lý thuyết" || s.typeNormalized === "thực hành"
    ).length;
  }, [mappedSchedules]);

  const weekDayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const weekCountsSched = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    mappedSchedules.forEach((s: any) => {
      if (!s.start) return;
      const wd = s.start.getDay();
      const idx = wd === 0 ? 6 : wd - 1;
      counts[idx] = counts[idx] + 1;
    });
    return counts;
  }, [mappedSchedules]);
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
        Báo cáo & Thống kê
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
              Công việc
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
              Lịch học
            </Text>
          </TouchableOpacity>
        </View>
      </View>

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
                  ? `Chọn tuần (${format(selectedWeekStart, "MM/yyyy")})`
                  : `Chọn tháng (${format(selectedMonthStart, "yyyy")})`}
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
                    Tuần
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
                    Tháng
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {viewMode === "week"
              ? weekOptions.map((week) => {
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
                })
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
                Tổng công việc
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
                Đã hoàn thành
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
                  Chờ thực hiện
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
                Đang thực hiện
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
                Trễ hạn
              </Text>
            </View>
          </View>

          <Text style={[styles.subHeader, { color: colors.text }]}>
            Tỷ lệ trạng thái
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
              ? "Số công việc theo ngày (tuần)"
              : `Số công việc theo ngày (tháng ${format(monthStart, "MM/yyyy")})`}
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
            Công việc đang thực hiện
          </Text>
          {doingList.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}>
              Không có
            </Text>
          ) : (
            <FlatList
              data={doingList}
              keyExtractor={(i) => String(i.id)}
              renderItem={renderTaskItem}
              scrollEnabled={false}
            />
          )}

          <Text
            style={[
              styles.subHeader,
              { marginTop: 12, color: colors.positive },
            ]}
          >
            Công việc đã hoàn thành
          </Text>
          {doneList.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}>
              Không có
            </Text>
          ) : (
            <FlatList
              data={doneList}
              keyExtractor={(i) => String(i.id)}
              renderItem={renderTaskItem}
              scrollEnabled={false}
            />
          )}

          <Text
            style={[styles.subHeader, { marginTop: 12, color: colors.danger }]}
          >
            Công việc trễ hạn
          </Text>
          {overdueList.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}>
              Không có
            </Text>
          ) : (
            <FlatList
              data={overdueList}
              keyExtractor={(i) => String(i.id)}
              renderItem={renderTaskItem}
              scrollEnabled={false}
            />
          )}

          {(viewMode === "week" ? isCurrentWeek : isCurrentMonth) && (
            <>
              <Text
                style={[styles.subHeader, { marginTop: 12, color: "#60a5fa" }]}
              >
                Công việc chờ thực hiện
              </Text>
              {upcomingList.length === 0 ? (
                <Text style={[styles.empty, { color: colors.muted }]}>
                  Không có
                </Text>
              ) : (
                <FlatList
                  data={upcomingList}
                  keyExtractor={(i) => String(i.id)}
                  renderItem={renderTaskItem}
                  scrollEnabled={false}
                />
              )}
            </>
          )}

          <View
            style={[
              styles.aiSuggestBox,
              { backgroundColor: isDark ? "#071226" : "#f1f5f9" },
            ]}
          >
            <Text style={[styles.aiSuggestTitle, { color: colors.accent }]}>
              Gợi ý cải thiện công việc từ AI
            </Text>
            <View style={styles.aiSuggestContent}>
              <Text style={[styles.aiSuggestText, { color: colors.muted }]}>
                • Ưu tiên các công việc quan trọng trong tuần này.
              </Text>
              <Text style={[styles.aiSuggestText, { color: colors.muted }]}>
                • Phân bổ thời gian hợp lý giữa các công việc đang thực hiện.
              </Text>
              <Text style={[styles.aiSuggestText, { color: colors.muted }]}>
                • Đặt nhắc nhở cho các công việc sắp đến hạn.
              </Text>
              <TouchableOpacity style={styles.aiSuggestBtn}>
                <Text style={styles.aiSuggestBtnText}>
                  Nhận gợi ý công việc từ AI
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {selectedKind === "schedules" && (
        <>
          <Text style={[styles.subHeader, { color: colors.text }]}>
            Tổng quan Lịch học
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
                Tổng buổi
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
                Lịch thi
              </Text>
            </View>
          </View>

          <Text style={[styles.subHeader, { color: colors.text }]}>
            Tỉ lệ loại buổi
          </Text>
          <PieChart
            data={[
              {
                name: "Buổi thường",
                population: scheduleTypeCounts.thuong,
                color: "#3b82f6",
                legendFontColor: colors.text,
                legendFontSize: 12,
              },
              {
                name: "Tạm ngưng",
                population: scheduleTypeCounts.tamNgung,
                color: "#f97316",
                legendFontColor: colors.text,
                legendFontSize: 12,
              },
              {
                name: "Buổi bù",
                population: scheduleTypeCounts.bu,
                color: "#7c3aed",
                legendFontColor: colors.text,
                legendFontSize: 12,
              },
              {
                name: "Lịch thi",
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
            Số buổi theo ngày trong tuần (Tổng dữ liệu)
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
            Thống kê theo môn{" "}
          </Text>
          {perCourseStats.length === 0 ? (
            <Text style={[styles.empty, { color: colors.muted }]}>
              Không có lịch
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
                    <Text style={{ fontWeight: "700" }}>LT: </Text>{c.lyThuyet}{"  "}
                    <Text style={{ fontWeight: "700" }}>TH: </Text>{c.thucHanh}
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
                    Lý thuyết: Buổi {c.takenLyThuyet || 0}
                  </Text>
                  <Text style={{ color: "#16a34a" }}>
                    Thực hành: Buổi {c.takenThucHanh || 0}
                  </Text>
                  <Text style={{ color: "#f97316" }}>
                    Tạm ngưng: {c.tamNgung}
                  </Text>
                  <Text style={{ color: "#7c3aed" }}>Buổi bù: {c.bu}</Text>
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
