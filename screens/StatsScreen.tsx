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

  // week selection used only by Tasks view
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
  }, [loadTasks, loadSchedules]);

  // week options for picker (mon-based)
  const weekOptions = useMemo(() => {
    const now = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: WEEK_PICKER_COUNT }).map((_, i) =>
      subWeeks(now, i)
    );
  }, []);

  // ------------------ TASKS (week-based) ------------------
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
      return { ...t, start, end, rawStatus, completedFlag };
    });
  }, [tasks]);

  const weekStart = selectedWeekStart;
  const weekEnd = addDays(selectedWeekStart, 6);

  const weekTasks = useMemo(
    () =>
      mappedTasks.filter((t) => {
        if (!t.start && !t.end) return false;
        const s = t.start ?? t.end;
        const e = t.end ?? t.start ?? s;
        return !(e < weekStart || s > weekEnd);
      }),
    [mappedTasks, weekStart, weekEnd]
  );

  const totalTasks = weekTasks.length;
  const doneTasks = weekTasks.filter((t) => t.completedFlag).length;
  const overdueTasks = weekTasks.filter((t) => {
    if (t.completedFlag) return false;
    if (!t.end) return false;
    return t.end.getTime() < Date.now();
  }).length;
  const doingTasks = weekTasks.filter((t) => {
    if (t.completedFlag) return false;
    if (
      t.rawStatus === "doing" ||
      t.rawStatus === "in progress" ||
      t.rawStatus === "in-progress"
    )
      return true;
    if (t.start && t.end) {
      const now = Date.now();
      return t.start.getTime() <= now && now <= t.end.getTime();
    }
    if (t.start && !t.end) return t.start.getTime() <= Date.now();
    return false;
  }).length;

  const tasksPieData = [
    {
      name: "Hoàn thành",
      population: doneTasks,
      color: "#22c55e",
      legendFontColor: "#333",
      legendFontSize: 12,
    },
    {
      name: "Đang thực hiện",
      population: doingTasks,
      color: "#facc15",
      legendFontColor: "#333",
      legendFontSize: 12,
    },
    {
      name: "Trễ hạn",
      population: overdueTasks,
      color: "#ef4444",
      legendFontColor: "#333",
      legendFontSize: 12,
    },
  ];

  const weekDays = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const weekCounts = weekDays.map((d) =>
    weekTasks.filter((t) => t.start && isSameDay(t.start, d)).length
  );

  const doingList = weekTasks.filter((t) => {
    if (t.completedFlag) return false;
    if (
      t.rawStatus === "doing" ||
      t.rawStatus === "in progress" ||
      t.rawStatus === "in-progress"
    )
      return true;
    if (t.start && t.end) {
      const now = Date.now();
      return t.start.getTime() <= now && now <= t.end.getTime();
    }
    if (t.start && !t.end) return t.start.getTime() <= Date.now();
    return false;
  });

  const doneList = weekTasks.filter((t) => t.completedFlag);
  const overdueList = weekTasks.filter((t) => {
    if (t.completedFlag) return false;
    if (!t.end) return false;
    return t.end.getTime() < Date.now();
  });

  const renderTaskItem = ({ item }: { item: any }) => {
    const time = item.start ? `${item.start.toLocaleString()}` : "Không có giờ";

    const statusColor =
      item.completedFlag
        ? "#16a34a"
        : item.end && item.end.getTime() < Date.now()
        ? "#ef4444"
        : item.rawStatus === "doing" ||
          item.rawStatus === "in progress" ||
          item.rawStatus === "in-progress"
        ? "#facc15"
        : "#94a3b8";

    const priorityColor =
      item.priority === "high"
        ? "#dc2626"
        : item.priority === "medium"
        ? "#f59e0b"
        : item.priority === "green" || item.priority === "low"
        ? "#16a34a"
        : "#94a3b8";

    let priorityLabel = "";
    if (item.priority === "high") priorityLabel = "Cao";
    else if (item.priority === "medium") priorityLabel = "Trung bình";
    else if (item.priority === "low" || item.priority === "green")
      priorityLabel = "Thấp";
    else if (item.priority) priorityLabel = String(item.priority);

    if (priorityLabel)
      priorityLabel = priorityLabel.charAt(0).toUpperCase() + priorityLabel.slice(1);

    return (
      <View style={styles.itemWrap}>
        <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
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
      const typeNormalized = /tạm/i.test(rawType)
        ? "tạm ngưng"
        : /bù/i.test(rawType)
        ? "bù"
        : /thi/i.test(rawType)
        ? "thi"
        : "thường";
      return { ...s, start, end, rawType, typeNormalized };
    });
  }, [schedules]);

  const perCourseStats = useMemo(() => {
    const map: Record<
      string,
      {
        subject: string;
        total: number;
        thuong: number;
        tamNgung: number;
        bu: number;
        thi: number;
        sessions: any[];
      }
    > = {};
    mappedSchedules.forEach((s: any) => {
      const key = (s.subject || s.title || "Không tên").trim();
      if (!map[key])
        map[key] = {
          subject: key,
          total: 0,
          thuong: 0,
          tamNgung: 0,
          bu: 0,
          thi: 0,
          sessions: [],
        };
      map[key].total += 1;
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
        default:
          map[key].thuong += 1;
      }
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
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

  const renderScheduleItem = ({ item }: { item: any }) => {
    const time =
      item.start && item.end
        ? `${item.start.toLocaleString()} - ${item.end.toLocaleTimeString()}`
        : item.start
        ? `${item.start.toLocaleString()}`
        : "Không có giờ";
    const color =
      item.typeNormalized === "tạm ngưng"
        ? "#f97316"
        : item.typeNormalized === "bù"
        ? "#10b981"
        : item.typeNormalized === "thi"
        ? "#ef4444"
        : "#2563EB";

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
              {item.typeNormalized?.charAt(0).toUpperCase() + item.typeNormalized?.slice(1)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // monthWeeks for week picker modal (only used in tasks mode)
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
        {/* Week selector displayed only when viewing tasks */}
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

      {/* Week picker modal (used only when tasks view active) */}
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

      {/* ---------------- TASKS VIEW (week-based) ---------------- */}
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

          {/* AI suggestions shown only in Tasks view */}
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

      {/* ---------------- SCHEDULES VIEW (aggregate, no week) ---------------- */}
      {selectedKind === "schedules" && (
        <>
          <Text style={styles.subHeader}>Tổng quan Lịch học</Text>

          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, { backgroundColor: "#f8fafc" }]}>
              <Text style={[styles.kpiValue, { color: "#2563EB" }]}>{mappedSchedules.length}</Text>
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
              { name: "Buổi bù", population: scheduleTypeCounts.bu, color: "#10b981", legendFontColor: "#333", legendFontSize: 12 },
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

          <Text style={styles.subHeader}>Số buổi theo ngày trong tuần (tổng dữ liệu)</Text>
          <BarChart
            data={{ labels: weekDayLabels, datasets: [{ data: weekCountsSched }] }}
            width={screenWidth - 32}
            height={200}
            fromZero
            showValuesOnTopOfBars
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

          <Text style={[styles.subHeader, { color: "#2563EB" }]}>Thống kê theo môn (tổng)</Text>
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
                  <Text style={{ color: "#06b6d4" }}>Thường: {c.thuong}</Text>
                  <Text style={{ color: "#f97316" }}>Tạm ngưng: {c.tamNgung}</Text>
                  <Text style={{ color: "#10b981" }}>Buổi bù: {c.bu}</Text>
                  <Text style={{ color: "#ef4444" }}>Thi: {c.thi}</Text>
                </View>
              </View>
            ))
          )}

          <Text style={[styles.subHeader, { marginTop: 12, color: "#16a34a" }]}>Buổi đang diễn ra</Text>
          {ongoingList.length === 0 ? <Text style={styles.empty}>Không có</Text> : <FlatList data={ongoingList} keyExtractor={(i) => String(i.id)} renderItem={renderScheduleItem} scrollEnabled={false} />}

          <Text style={[styles.subHeader, { marginTop: 12, color: "#f97316" }]}>Buổi tạm ngưng</Text>
          {pausedList.length === 0 ? <Text style={styles.empty}>Không có</Text> : <FlatList data={pausedList} keyExtractor={(i) => String(i.id)} renderItem={renderScheduleItem} scrollEnabled={false} />}

          <Text style={[styles.subHeader, { marginTop: 12, color: "#10b981" }]}>Buổi bù</Text>
          {makeUpList.length === 0 ? <Text style={styles.empty}>Không có</Text> : <FlatList data={makeUpList} keyExtractor={(i) => String(i.id)} renderItem={renderScheduleItem} scrollEnabled={false} />}

          <Text style={[styles.subHeader, { marginTop: 12, color: "#ef4444" }]}>Lịch thi</Text>
          {examList.length === 0 ? <Text style={styles.empty}>Không có</Text> : <FlatList data={examList} keyExtractor={(i) => String(i.id)} renderItem={renderScheduleItem} scrollEnabled={false} />}
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// helpers
function startOfDayLocal(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
function endOfDayLocal(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

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
