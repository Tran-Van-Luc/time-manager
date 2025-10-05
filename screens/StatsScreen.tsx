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
  startOfWeek,
  addDays,
  isSameDay,
  format,
  subWeeks,
} from "date-fns";

const screenWidth = Dimensions.get("window").width;
const WEEK_PICKER_COUNT = 12;

export default function StatsScreen() {
  const { tasks, loadTasks } = useTasks();
  const { schedules, loadSchedules } = useSchedules();
  const { recurrences, loadRecurrences } = useRecurrences();

  const [selectedWeekStart, setSelectedWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedKind, setSelectedKind] = useState<"tasks" | "schedules">(
    "tasks"
  );
  const [showWeekPicker, setShowWeekPicker] = useState(false);

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

  // ------------------ TASKS (week-based) ------------------
  const recurrenceMap = useMemo(() => {
    const m: Record<number, any> = {};
    (recurrences || []).forEach((r: any) => { if (r.id != null) m[r.id] = r; });
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
  const weekEnd = new Date(rawWeekEnd.getFullYear(), rawWeekEnd.getMonth(), rawWeekEnd.getDate(), 23, 59, 59, 999);

  const weekData = useMemo(() => {
    const occsForBar: { taskId: number; start: Date; end: Date; baseTask: any }[] = [];
    const tasksInWeek: any[] = [];
    const weekStartMs = weekStart.getTime();
    const weekEndMs = weekEnd.getTime();
    mappedTasks.forEach(t => {
      if (t.recurrence && t.start) {
        const baseStartMs = t.start.getTime();
        const baseEndMs = t.end ? t.end.getTime() : (() => { const tmp = new Date(baseStartMs); tmp.setHours(23,59,59,999); return tmp.getTime(); })();
        const recEnd = t.recurrence.end_date ? new Date(t.recurrence.end_date).getTime() : undefined;
        const recConfig = {
          enabled: true,
          frequency: t.recurrence.type || 'daily',
          interval: t.recurrence.interval || 1,
          daysOfWeek: t.recurrence.days_of_week ? JSON.parse(t.recurrence.days_of_week) : [],
          daysOfMonth: t.recurrence.day_of_month ? JSON.parse(t.recurrence.day_of_month) : [],
          endDate: recEnd,
        } as any;
        let occs: { startAt: number; endAt: number }[] = [];
        try { occs = generateOccurrences(baseStartMs, baseEndMs, recConfig); } catch { occs = [{ startAt: baseStartMs, endAt: baseEndMs }]; }
        const occsInWeek = occs.filter(o => !(o.endAt < weekStartMs || o.startAt > weekEndMs));
        if (occsInWeek.length) {
          tasksInWeek.push(t);
          occsInWeek.forEach(o => occsForBar.push({ taskId: t.id, start: new Date(o.startAt), end: new Date(o.endAt), baseTask: t }));
        }
      } else {
        const s = t.start ?? t.end;
        const e = t.end ?? t.start ?? s;
        if (s && e && !(e.getTime() < weekStart.getTime() || s.getTime() > weekEnd.getTime())) {
          tasksInWeek.push(t);
          occsForBar.push({ taskId: t.id, start: s, end: e, baseTask: t });
        }
      }
    });
    return { tasksInWeek, occsForBar };
  }, [mappedTasks, weekStart, weekEnd]);

  const weekTasks = weekData.tasksInWeek;

  const classifications = weekTasks.map((t) => {
    if (t.completedFlag) {
      if (t.completion_status === 'late') return 'overdue';
      return 'done';
    }
    return 'doing';
  });

  const totalTasks = weekTasks.length;
  const doneTasks = classifications.filter(c => c === 'done').length;
  const overdueTasks = classifications.filter(c => c === 'overdue').length;
  const doingTasks = classifications.filter(c => c === 'doing').length;

  const tasksPieData = [
    { name: "Hoàn thành", population: doneTasks, color: "#22c55e", legendFontColor: "#333", legendFontSize: 12 },
    { name: "Đang thực hiện", population: doingTasks, color: "#facc15", legendFontColor: "#333", legendFontSize: 12 },
    { name: "Trễ hạn", population: overdueTasks, color: "#ef4444", legendFontColor: "#333", legendFontSize: 12 },
  ];

  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)), [weekStart]);
  const weekLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const weekCounts = weekDays.map((d) => weekData.occsForBar.filter(o => isSameDay(o.start, d)).length);
  const maxWeekCount = useMemo(() => Math.max(0, ...weekCounts), [weekCounts]);

  const doingList = weekTasks.filter((t, i) => classifications[i] === 'doing');
  const doneList = weekTasks.filter((t, i) => classifications[i] === 'done');
  const overdueList = weekTasks.filter((t, i) => classifications[i] === 'overdue');

  const renderTaskItem = ({ item }: { item: any }) => {
    const time = item.start ? `${item.start.toLocaleString()}` : "Không có giờ";
    const statusColor =
      item.completedFlag
        ? "#16a34a"
        : item.end && item.end.getTime() < Date.now()
        ? "#ef4444"
        : item.rawStatus === "doing" || item.rawStatus === "in progress" || item.rawStatus === "in-progress"
        ? "#facc15"
        : "#94a3b8";
    const priorityColor =
      item.priority === "high" ? "#dc2626" : item.priority === "medium" ? "#f59e0b" : item.priority === "green" || item.priority === "low" ? "#16a34a" : "#94a3b8";
    const indicatorColor = item.priority ? priorityColor : statusColor;
    let priorityLabel = "";
    if (item.priority === "high") priorityLabel = "Cao";
    else if (item.priority === "medium") priorityLabel = "Trung bình";
    else if (item.priority === "low" || item.priority === "green") priorityLabel = "Thấp";
    else if (item.priority) priorityLabel = String(item.priority);
    if (priorityLabel) priorityLabel = priorityLabel.charAt(0).toUpperCase() + priorityLabel.slice(1);

    return (
      <View style={styles.itemWrap}>
        <View style={[styles.statusIndicator, { backgroundColor: indicatorColor }]} />
        <View style={styles.itemContent}>
          <Text style={styles.rowTitle}>{item.title}</Text>
          {item.description ? <Text style={styles.rowSubtitle}>{item.description}</Text> : null}
        </View>
        <View style={styles.itemMeta}>
          <Text style={styles.rowTime}>{time}</Text>
          {item.priority ? (
            <View style={[styles.priorityPill, { backgroundColor: priorityColor }]}>
              <Text style={styles.priorityText}>{priorityLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  // ------------------ SCHEDULES (aggregate total, no week) ------------------
  const mappedSchedules = useMemo(() => {
    return (schedules || []).map((s: any) => {
      const start = s.startAt ? new Date(s.startAt) : null;
      const end = s.endAt ? new Date(s.endAt) : null;
      const rawType = (s.type ?? "").toString().trim();
      const low = rawType.toLowerCase();
      const typeNormalized =
        /tạm/i.test(rawType) ? "tạm ngưng" :
        /bù/i.test(rawType) ? "bù" :
        /thi/i.test(rawType) ? "thi" :
        /lý|ly/i.test(low) ? "lý thuyết" :
        /thực|thuc|thực hành|thuc hanh/i.test(low) ? "thực hành" :
        "thường";
      return { ...s, start, end, rawType, typeNormalized };
    });
  }, [schedules]);

  // Colors mapping
  const TYPE_COLORS: Record<string, string> = {
    "lý thuyết": "#06b6d4", // xanh nước
    "thực hành": "#16a34a", // xanh lá
    "tạm ngưng": "#f97316", // giữ như cũ
    "bù": "#7c3aed",        // tím cho buổi bù
    "thi": "#ef4444",
    "thường": "#2563EB",
  };

  // Per-course stats: split Lý thuyết and Thực hành; total = LT + TH only
  const perCourseStats = useMemo(() => {
    const map: Record<string, {
      subject: string;
      total: number; // LT + TH
      lyThuyet: number;
      thucHanh: number;
      tamNgung: number;
      bu: number;
      thi: number;
      sessions: any[];
    }> = {};
    mappedSchedules.forEach((s: any) => {
      const key = (s.subject || s.title || "Không tên").trim();
      if (!map[key])
        map[key] = { subject: key, total: 0, lyThuyet: 0, thucHanh: 0, tamNgung: 0, bu: 0, thi: 0, sessions: [] };
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
    });
    const result = Object.values(map).map(v => ({ ...v, total: (v.lyThuyet || 0) + (v.thucHanh || 0) }));
    return result.sort((a, b) => b.total - a.total);
  }, [mappedSchedules]);

  // Counts including exams for display; KPI total will exclude exams below
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

  // TOTAL SESSIONS on KPI: count only LT + TH (exclude exams, pauses, makeups)
  const totalSessionsLTTH = useMemo(() => {
    return mappedSchedules.filter((s: any) => s.typeNormalized === "lý thuyết" || s.typeNormalized === "thực hành").length;
  }, [mappedSchedules]);

  const pausedList = mappedSchedules.filter((s: any) => s.typeNormalized === "tạm ngưng");
  const makeUpList = mappedSchedules.filter((s: any) => s.typeNormalized === "bù");
  const examList = mappedSchedules.filter((s: any) => s.typeNormalized === "thi");
  const ongoingList = mappedSchedules.filter((s: any) => {
    if (!s.start || !s.end) return false;
    const now = Date.now();
    return s.start.getTime() <= now && now <= s.end.getTime();
  });

  const weekDayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const weekCountsSched = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    mappedSchedules.forEach((s: any) => {
      if (!s.start) return;
      const wd = s.start.getDay(); // 0 Sun .. 6 Sat
      const idx = wd === 0 ? 6 : wd - 1; // map to 0..6 Mon..Sun
      counts[idx] = counts[idx] + 1;
    });
    return counts;
  }, [mappedSchedules]);
  const maxSchedCount = useMemo(() => Math.max(0, ...weekCountsSched), [weekCountsSched]);

  const renderScheduleItem = ({ item }: { item: any }) => {
    const time =
      item.start && item.end
        ? `${item.start.toLocaleString()} - ${item.end.toLocaleTimeString()}`
        : item.start
        ? `${item.start.toLocaleString()}`
        : "Không có giờ";
    const lowType = String(item.typeNormalized || "").toLowerCase();
    const color = TYPE_COLORS[lowType] ?? TYPE_COLORS[item.rawType?.toLowerCase()] ?? "#2563EB";

    return (
      <View style={styles.itemWrap}>
        <View style={[styles.statusIndicator, { backgroundColor: color }]} />
        <View style={styles.itemContent}>
          <Text style={styles.rowTitle}>{item.subject || item.title || "Không tên"}</Text>
          {item.instructorName ? <Text style={styles.rowSubtitle}>Giảng viên: {item.instructorName}</Text> : null}
          {item.location ? <Text style={styles.rowSubtitle}>Phòng: {item.location}</Text> : null}
        </View>

        <View style={styles.itemMeta}>
          <Text style={styles.rowTime}>{time}</Text>
          <View style={[styles.priorityPill, { backgroundColor: color }]}>
            <Text style={styles.priorityText}>
              {String(item.typeNormalized ?? item.rawType ?? "").charAt(0).toUpperCase() + String(item.typeNormalized ?? item.rawType ?? "").slice(1)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const currentMonth = selectedWeekStart.getMonth();
  const currentYear = selectedWeekStart.getFullYear();
  const monthWeeks = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    let weeks: Date[] = [];
    let week = startOfWeek(firstDay, { weekStartsOn: 1 });
    while (week <= lastDay) {
      weeks.push(week);
      week = addDays(week, 7);
    }
    return weeks;
  }, [currentMonth, currentYear, selectedWeekStart]);

  const onSelectWeek = (d: Date) => {
    setSelectedWeekStart(startOfWeek(d, { weekStartsOn: 1 }));
    setShowWeekPicker(false);
  };

  // ------------------ UI ------------------
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={styles.header}>Báo cáo & Thống kê</Text>

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
        {selectedKind === "tasks" ? (
          <TouchableOpacity
            style={styles.weekDropdown}
            onPress={() => setShowWeekPicker(true)}
          >
            <Text style={styles.weekDropdownText}>
              {format(selectedWeekStart, "dd/MM")} - {format(addDays(selectedWeekStart, 6), "dd/MM")}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ flexDirection: "row", marginLeft: "auto" }}>
          <TouchableOpacity
            style={[styles.kindBtn, selectedKind === "tasks" && styles.kindBtnActive]}
            onPress={() => setSelectedKind("tasks")}
          >
            <Text style={[styles.kindBtnText, selectedKind === "tasks" && styles.kindBtnTextActive]}>Công việc</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.kindBtn, selectedKind === "schedules" && styles.kindBtnActive, { marginLeft: 8 }]}
            onPress={() => setSelectedKind("schedules")}
          >
            <Text style={[styles.kindBtnText, selectedKind === "schedules" && styles.kindBtnTextActive]}>Lịch học</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={showWeekPicker && selectedKind === "tasks"}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWeekPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowWeekPicker(false)}>
          <View style={styles.weekModal}>
            <Text style={{ fontWeight: "700", marginBottom: 8, fontSize: 16 }}>
              Chọn tuần ({format(selectedWeekStart, "MM/yyyy")})
            </Text>
            {monthWeeks.map((week) => {
              const isSelected = isSameDay(week, selectedWeekStart);
              const isCurrent = isSameDay(week, startOfWeek(new Date(), { weekStartsOn: 1 }));
              return (
                <TouchableOpacity
                  key={week.toISOString()}
                  style={[
                    styles.weekModalItem,
                    isSelected && styles.weekModalItemActive,
                    !isSelected && isCurrent && styles.weekModalItemCurrent,
                  ]}
                  onPress={() => onSelectWeek(week)}
                >
                  <Text style={[
                    styles.weekModalItemText,
                    isSelected && styles.weekModalItemTextActive,
                    !isSelected && isCurrent && styles.weekModalItemTextCurrent,
                  ]}>
                    {format(week, "dd/MM")} - {format(addDays(week, 6), "dd/MM")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* TASKS VIEW */}
      {selectedKind === "tasks" && (
        <>
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, { backgroundColor: "#f0f7ff" }]}>
              <Text style={[styles.kpiValue, { color: "#2563EB" }]}>{totalTasks}</Text>
              <Text style={styles.kpiLabel}>Tổng công việc</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: "#ecfdf5" }]}>
              <Text style={[styles.kpiValue, { color: "#16a34a" }]}>{doneTasks}</Text>
              <Text style={styles.kpiLabel}>Đã hoàn thành</Text>
            </View>
          </View>

          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, { backgroundColor: "#fefce8" }]}>
              <Text style={[styles.kpiValue, { color: "#ca8a04" }]}>{doingTasks}</Text>
              <Text style={styles.kpiLabel}>Đang thực hiện</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: "#fef2f2" }]}>
              <Text style={[styles.kpiValue, { color: "#dc2626" }]}>{overdueTasks}</Text>
              <Text style={styles.kpiLabel}>Trễ hạn</Text>
            </View>
          </View>

          <Text style={styles.subHeader}>Tỷ lệ trạng thái</Text>
          <PieChart
            data={tasksPieData}
            width={screenWidth - 32}
            height={200}
            chartConfig={{ color: () => `#000` }}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"16"}
            absolute
          />

          <Text style={styles.subHeader}>Số công việc theo ngày</Text>
          <BarChart
            data={{ labels: weekLabels, datasets: [{ data: weekCounts }] }}
            width={screenWidth - 32}
            height={220}
            fromZero
            showValuesOnTopOfBars
            segments={maxWeekCount || 1}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: "#fff",
              backgroundGradientFrom: "#fff",
              backgroundGradientTo: "#fff",
              decimalPlaces: 0,
              color: () => "#2563EB",
              labelColor: () => "#333",
            }}
            style={{ borderRadius: 8 }}
          />

          <View style={{ borderBottomWidth: 1, borderBottomColor: "#eef2ff", marginVertical: 12 }} />

          <Text style={[styles.subHeader, { color: "#ca8a04" }]}>Công việc đang thực hiện</Text>
          {doingList.length === 0 ? <Text style={styles.empty}>Không có</Text> : <FlatList data={doingList} keyExtractor={(i) => String(i.id)} renderItem={renderTaskItem} scrollEnabled={false} />}

          <Text style={[styles.subHeader, { marginTop: 12, color: "#16a34a" }]}>Công việc đã hoàn thành</Text>
          {doneList.length === 0 ? <Text style={styles.empty}>Không có</Text> : <FlatList data={doneList} keyExtractor={(i) => String(i.id)} renderItem={renderTaskItem} scrollEnabled={false} />}

          <Text style={[styles.subHeader, { marginTop: 12, color: "#ef4444" }]}>Công việc trễ hạn</Text>
          {overdueList.length === 0 ? <Text style={styles.empty}>Không có</Text> : <FlatList data={overdueList} keyExtractor={(i) => String(i.id)} renderItem={renderTaskItem} scrollEnabled={false} />}

          <View style={styles.aiSuggestBox}>
            <Text style={styles.aiSuggestTitle}>Gợi ý cải thiện công việc từ AI</Text>
            <View style={styles.aiSuggestContent}>
              <Text style={styles.aiSuggestText}>• Ưu tiên các công việc quan trọng trong tuần này.</Text>
              <Text style={styles.aiSuggestText}>• Phân bổ thời gian hợp lý giữa các công việc đang thực hiện.</Text>
              <Text style={styles.aiSuggestText}>• Đặt nhắc nhở cho các công việc sắp đến hạn.</Text>
              <TouchableOpacity style={styles.aiSuggestBtn}>
                <Text style={styles.aiSuggestBtnText}>Nhận gợi ý công việc từ AI</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* SCHEDULES VIEW */}
      {selectedKind === "schedules" && (
        <>
          <Text style={styles.subHeader}>Tổng quan Lịch học</Text>

          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, { backgroundColor: "#f8fafc" }]}>
              <Text style={[styles.kpiValue, { color: "#2563EB" }]}>{totalSessionsLTTH}</Text>
              <Text style={styles.kpiLabel}>Tổng buổi</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: "#fff7ed" }]}>
              <Text style={[styles.kpiValue, { color: "#c2410c" }]}>{scheduleTypeCounts.thi}</Text>
              <Text style={styles.kpiLabel}>Lịch thi</Text>
            </View>
          </View>

          <Text style={styles.subHeader}>Tỉ lệ loại buổi</Text>
          <PieChart
            data={[
              { name: "Buổi thường", population: scheduleTypeCounts.thuong, color: "#3b82f6", legendFontColor: "#333", legendFontSize: 12 },
              { name: "Tạm ngưng", population: scheduleTypeCounts.tamNgung, color: "#f97316", legendFontColor: "#333", legendFontSize: 12 },
              { name: "Buổi bù", population: scheduleTypeCounts.bu, color: "#7c3aed", legendFontColor: "#333", legendFontSize: 12 },
              { name: "Lịch thi", population: scheduleTypeCounts.thi, color: "#ef4444", legendFontColor: "#333", legendFontSize: 12 },
            ]}
            width={screenWidth - 32}
            height={200}
            chartConfig={{ color: () => `#000` }}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"16"}
            absolute
          />

          <Text style={styles.subHeader}>Số buổi theo ngày trong tuần (Tổng dữ liệu)</Text>
          <BarChart
            data={{ labels: weekDayLabels, datasets: [{ data: weekCountsSched }] }}
            width={screenWidth - 32}
            height={200}
            fromZero
            showValuesOnTopOfBars
            segments={maxSchedCount || 1}
            yAxisLabel={""}
            yAxisSuffix={""}
            chartConfig={{
              backgroundColor: "#fff",
              backgroundGradientFrom: "#fff",
              backgroundGradientTo: "#fff",
              decimalPlaces: 0,
              color: () => "#2563EB",
              labelColor: () => "#333",
            }}
            style={{ borderRadius: 8 }}
          />
          <View style={{ borderBottomWidth: 1, borderBottomColor: "#eef2ff", marginVertical: 12 }} />

          <Text style={[styles.subHeader, { color: "#2563EB" }]}>Thống kê theo môn </Text>
          {perCourseStats.length === 0 ? (
            <Text style={styles.empty}>Không có lịch</Text>
          ) : (
            perCourseStats.map((c) => (
              <View key={c.subject} style={[styles.itemWrap, { flexDirection: "column", alignItems: "stretch" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "700" }}>{c.subject}</Text>
                  <Text style={{ color: "#374151" }}>{c.total} buổi</Text>
                </View>
                <View style={{ flexDirection: "row", marginTop: 8, justifyContent: "space-between" }}>
                  <Text style={{ color: "#06b6d4" }}>Lý thuyết: {c.lyThuyet}</Text>
                  <Text style={{ color: "#16a34a" }}>Thực hành: {c.thucHanh}</Text>
                  <Text style={{ color: "#f97316" }}>Tạm ngưng: {c.tamNgung}</Text>
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
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  header: { fontSize: 18, fontWeight: "700", marginBottom: 12 },

  kpiRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  kpiCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4,
    alignItems: "center",
  },
  kpiValue: { fontSize: 20, fontWeight: "700" },
  kpiLabel: { fontSize: 13, color: "#555", marginTop: 4 },
  subHeader: { fontSize: 16, fontWeight: "700", marginVertical: 12 },

  empty: { color: "#666", fontSize: 14, textAlign: "center", paddingVertical: 8 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSubtitle: { fontSize: 13, color: "#666", marginTop: 2 },
  rowTime: { fontSize: 12, color: "#888", marginLeft: 8 },

  itemWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.03,
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
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minWidth: 180,
  },
  weekDropdownText: { color: "#374151", fontWeight: "700" },

  kindBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
  },
  kindBtnActive: { backgroundColor: "#2563EB" },
  kindBtnText: { color: "#374151", fontWeight: "700" },
  kindBtnTextActive: { color: "#fff" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  weekModal: {
    backgroundColor: "#fff",
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
    color: "#374151",
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
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    marginTop: 8,
  },
  aiSuggestTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    color: "#2563EB",
  },
  aiSuggestContent: {},
  aiSuggestText: {
    fontSize: 14,
    color: "#374151",
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
