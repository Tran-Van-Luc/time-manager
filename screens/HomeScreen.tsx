// HomeScreen.tsx
import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  SafeAreaView,
  Dimensions,
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native";
import { useSchedules } from "../hooks/useSchedules";
import { useTasks } from "../hooks/useTasks";
import { useRecurrences } from "../hooks/useRecurrences";
import { generateOccurrences } from "../utils/taskValidation";
import { AnimatedToggle } from "../components/AnimatedToggle";

type DayScheduleItem = {
  kind: "schedule";
  id?: number;
  subject: string;
  start: Date;
  end: Date;
  color: string;
  type: string;
  instructorName?: string | null;
  location?: string | null;
};

type DayTaskItem = {
  kind: "task";
  id?: number;
  title: string;
  start?: Date;
  end?: Date;
  color?: string;
  notes?: string | null;
  priority?: string | null;
  status?: string | null;
};

type DayItem = DayScheduleItem | DayTaskItem;

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function pad2(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
function endOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }
function hashColor(input: string) { let h = 0; for (let i = 0; i < input.length; i++) h = (h << 5) - h + input.charCodeAt(i); return `hsl(${Math.abs(h) % 360}, 60%, 60%)`; }

// Task colors (main + light background)
function getTaskColor(priority?: string) {
  switch (priority) {
    case "high":
    case "urgent":
      return "#DC2626";
    case "medium":
      return "#CA8A04";
    case "low":
      return "#16A34A";
    default:
      return "#3b82f6";
  }
}
function getTaskBgColor(priority?: string) {
  switch (priority) {
    case "high": return "#FECACA";
    case "medium": return "#FEF9C3";
    case "low": return "#DCFCE7";
    default: return "#EFF6FF";
  }
}

function getScheduleColor(type?: string, subject?: string) { if (type === "Lịch thi") return "#ef4444"; if (type === "Lịch học bù") return "#f59e0b"; if (type === "Lịch tạm ngưng") return "#9ca3af"; if (type === "Lịch học thường xuyên") return "#3b82f6"; return subject ? hashColor(subject) : "#6366f1"; }

const themeColor = "#2563EB";

const DEFAULT_TYPE_STYLE: Record<string, { color: string; emoji: string; pillBg: string }> = {
  "Lịch học thường xuyên": { color: "#1D4ED8", emoji: "📚", pillBg: "#DBEAFE" },
  "Lịch thi": { color: "#DC2626", emoji: "📝", pillBg: "#FECACA" },
  "Lịch tạm ngưng": { color: "#D97706", emoji: "⏸", pillBg: "#FDE68A" },
  "Lịch học bù": { color: "#047857", emoji: "📅", pillBg: "#BBF7D0" },
};

function labelPriorityVn(p?: string) {
  if (!p) return "Khác";
  if (p === "high" || p === "urgent") return "Cao";
  if (p === "medium") return "Trung bình";
  if (p === "low") return "Thấp";
  return p.charAt(0).toUpperCase() + p.slice(1);
}
function labelStatusVn(s?: string) {
  if (!s) return "Chưa rõ";
  if (s === "pending") return "Chờ thực hiện";
  if (s === "in-progress") return "Đang thực hiện";
  if (s === "completed") return "Hoàn thành";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function HomeScreen() {
  const { schedules, loadSchedules } = useSchedules();
  const { tasks, loadTasks } = useTasks();
  const { recurrences, loadRecurrences } = useRecurrences();

  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [current, setCurrent] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { loadSchedules(); loadTasks(); loadRecurrences(); }, [loadSchedules, loadTasks, loadRecurrences]);

  const monthDays = useMemo(() => {
    const firstDay = new Date(current.getFullYear(), current.getMonth(), 1);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
    const cells: Date[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(new Date(current.getFullYear(), current.getMonth(), 1 - (firstWeekday - i)));
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(current.getFullYear(), current.getMonth(), day));
    while (cells.length < 42) cells.push(new Date(cells[cells.length - 1].getFullYear(), cells[cells.length - 1].getMonth(), cells[cells.length - 1].getDate() + 1));
    return cells;
  }, [current]);

  const dayMap = useMemo(() => {
    const map = new Map<string, DayItem[]>();

    for (const s of schedules) {
      const key = ymd(startOfDay(s.startAt));
      const arr = map.get(key) ?? [];
      arr.push({
        kind: "schedule",
        id: s.id,
        subject: s.subject || "Lịch học",
        start: s.startAt,
        end: s.endAt,
        color: getScheduleColor(s.type, s.subject),
        type: s.type,
        instructorName: s.instructorName ?? null,
        location: s.location ?? null,
      } as DayScheduleItem);
      map.set(key, arr);
    }

    // Map recurrence id -> recurrence object for quick lookup
    const recMap = new Map<number, any>();
    recurrences.forEach(r => { if (r.id != null) recMap.set(r.id, r); });

    for (const t of tasks) {
      const baseStart = t.start_at ? new Date(t.start_at).getTime() : null;
      const baseEnd = t.end_at ? new Date(t.end_at).getTime() : null;
      if (!baseStart) continue; // nếu không có start bỏ qua
      let effectiveEnd = baseEnd;
      if (!effectiveEnd) {
        // nếu không có end, set end cuối ngày start
        const tmp = new Date(baseStart); tmp.setHours(23,59,59,999); effectiveEnd = tmp.getTime();
      }
      if (!effectiveEnd) continue;

      let occurrences: Array<{ startAt: number; endAt: number }> = [];
      if (t.recurrence_id && recMap.has(t.recurrence_id)) {
        const r = recMap.get(t.recurrence_id);
        try {
          occurrences = generateOccurrences(baseStart, effectiveEnd, {
            enabled: true,
            frequency: r.type,
            interval: r.interval,
            daysOfWeek: r.days_of_week ? JSON.parse(r.days_of_week) : undefined,
            daysOfMonth: r.day_of_month ? JSON.parse(r.day_of_month) : undefined,
            endDate: r.end_date,
          });
        } catch {
          occurrences = [{ startAt: baseStart, endAt: effectiveEnd }];
        }
      } else {
        occurrences = [{ startAt: baseStart, endAt: effectiveEnd }];
      }

      for (const occ of occurrences) {
        const s = new Date(occ.startAt);
        const e = new Date(occ.endAt);
        // add each day spanned by this occurrence (in case multi-day)
        for (let d = new Date(startOfDay(s)); d <= endOfDay(e); d.setDate(d.getDate() + 1)) {
          const key = ymd(startOfDay(d));
          const arr = map.get(key) ?? [];
            arr.push({
              kind: 'task',
              id: t.id,
              title: t.title ?? 'Công việc',
              start: s,
              end: e,
              color: getTaskColor(t.priority),
              notes: (t as any).notes ?? null,
              priority: t.priority ?? null,
              status: (t as any).status ?? null,
            } as DayTaskItem);
          map.set(key, arr);
        }
      }
    }

    return map;
  }, [schedules, tasks]);

  // helper: reset to today (normalized)
  function resetToToday() {
    const today = startOfDay(new Date());
    setSelectedDate(today);
    setCurrent(new Date()); // current used for week/month grid center; set to now
  }

  // When user switches tabs via AnimatedToggle we'll call resetToToday (see onChange below)
  const handlePressDay = (d: Date) => {
    const day = startOfDay(d);
    setSelectedDate(day);
    setShowModal(true);
  };

  const prev = () => {
    if (viewMode === "month") {
      setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1));
    } else if (viewMode === "week") {
      const ref = new Date(current);
      ref.setDate(ref.getDate() - 7);
      setCurrent(ref);
    } else {
      const ref = new Date(current);
      ref.setDate(ref.getDate() - 1);
      setCurrent(ref);
    }
  };
  const next = () => {
    if (viewMode === "month") {
      setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    } else if (viewMode === "week") {
      const ref = new Date(current);
      ref.setDate(ref.getDate() + 7);
      setCurrent(ref);
    } else {
      const ref = new Date(current);
      ref.setDate(ref.getDate() + 1);
      setCurrent(ref);
    }
  };

  const dayFocused = useMemo(() => {
    if (viewMode === "day") {
      return selectedDate ?? startOfDay(new Date());
    }
    return current;
  }, [viewMode, current, selectedDate]);

  // weekDays: keep based on current so user can still navigate weeks.
  const weekDays = useMemo(() => {
    const focus = startOfDay(current);
    const dayOfWeek = (focus.getDay() + 6) % 7;
    const monday = new Date(focus);
    monday.setDate(focus.getDate() - dayOfWeek);
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [current]);

  const selectedItems: DayItem[] = useMemo(() => {
    if (!selectedDate) return [];
    return dayMap.get(ymd(startOfDay(selectedDate))) ?? [];
  }, [selectedDate, dayMap]);

  const todayKey = ymd(startOfDay(new Date()));

  const screenHeight = Dimensions.get("window").height;
  const headerHeight = 64;
  const weekLabelHeight = 30;
  const gridHeight = screenHeight - headerHeight - weekLabelHeight - 60;
  const cellHeight = gridHeight / 6;

  const fmtTime = (d?: Date) => d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "—";

  const schedulesForDay = selectedItems.filter(i => i.kind === "schedule") as DayScheduleItem[];
  const tasksForDay = selectedItems.filter(i => i.kind === "task") as DayTaskItem[];

  // openDetailsFor: select normalized day and either show modal (month/day) or details below (week)
  const openDetailsFor = (d: Date) => {
    const day = startOfDay(d);
    setSelectedDate(day);
    setCurrent(new Date(day.getFullYear(), day.getMonth(), day.getDate()));
    if (viewMode === "week") {
      setShowModal(false);
    } else {
      setShowModal(true);
    }
  };

  const schedulesForSelectedDay = useMemo(() => {
    if (!selectedDate) return [];
    return (dayMap.get(ymd(startOfDay(selectedDate))) ?? []).filter(it => it.kind === "schedule") as DayScheduleItem[];
  }, [selectedDate, dayMap]);

  const tasksForSelectedDay = useMemo(() => {
    if (!selectedDate) return [];
    return (dayMap.get(ymd(startOfDay(selectedDate))) ?? []).filter(it => it.kind === "task") as DayTaskItem[];
  }, [selectedDate, dayMap]);

  return (
    <SafeAreaView style={styles.container}>
      {/* compact header */}
      <View style={styles.headerSmall}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={prev} style={styles.navBtnSmall}><Text style={styles.navTextSmall}>‹</Text></TouchableOpacity>

          <View style={styles.titleWrapper}>
            <Text
              style={styles.monthTitleSmall}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {viewMode === "month" ? `Tháng ${current.getMonth() + 1}, ${current.getFullYear()}` :
               viewMode === "week" ? (() => {
                 const mon = weekDays[0];
                 const sun = weekDays[6];
                 const sameMonth = mon.getMonth() === sun.getMonth() && mon.getFullYear() === sun.getFullYear();
                 if (sameMonth) return `Tuần ${mon.getDate()} - ${sun.getDate()} ${mon.getMonth() + 1}/${mon.getFullYear()}`;
                 return `Tuần ${mon.getDate()}/${mon.getMonth() + 1} - ${sun.getDate()}/${sun.getMonth() + 1} ${sun.getFullYear()}`;
               })() :
               `Ngày ${ymd(dayFocused)}`}
            </Text>
          </View>

          <TouchableOpacity onPress={next} style={styles.navBtnSmall}><Text style={styles.navTextSmall}>›</Text></TouchableOpacity>
        </View>

        <AnimatedToggle
          value={viewMode === "day" ? "day" : viewMode === "week" ? "week" : "month"}
          onChange={(v) => {
            // Always reset to today when switching tabs
            resetToToday();

            if (v === "day") {
              setViewMode("day");
            } else if (v === "week") {
              setViewMode("week");
            } else {
              setViewMode("month");
            }
            setShowModal(false);
          }}
        />
      </View>

      {viewMode !== "day" && (
        <View style={styles.weekRow}>
          {WEEKDAY_LABELS.map((lbl) => <Text key={lbl} style={styles.weekLabel}>{lbl}</Text>)}
        </View>
      )}

      {viewMode === "month" && (
        <View style={styles.grid}>
          {monthDays.map((d, idx) => {
            const inMonth = d.getMonth() === current.getMonth();
            const key = ymd(startOfDay(d));
            const items = dayMap.get(key) ?? [];
            const maxIcons = 2;
            const icons = items.slice(0, maxIcons - 1);
            const more = items.length - icons.length;
            const isToday = key === todayKey;
            const isSelected = selectedDate && key === ymd(startOfDay(selectedDate));
            const showBorder = !!isSelected || (isToday && !selectedDate);

            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.cell,
                  {
                    height: cellHeight,
                    borderRadius: 12,
                    backgroundColor: isToday ? `${themeColor}20` : "#fff",
                    borderColor: showBorder ? themeColor : "#e5e7eb",
                    borderWidth: showBorder ? 2 : 0.5,
                    opacity: inMonth ? 1 : 0.3,
                  },
                ]}
                onPress={() => handlePressDay(d)}
                activeOpacity={0.7}
              >
                <Text style={styles.dayNum}>{d.getDate()}</Text>
                <View style={styles.iconColumn}>
                  {icons.map((it, i) => (
                    <View key={i} style={[styles.iconBadge, { backgroundColor: (it as DayItem).kind === "task" ? (it as DayTaskItem).color ?? "#9ca3af" : (it as DayScheduleItem).color }]}>
                      <Text style={styles.iconText}>{it.kind === "task" ? "📚" : "📋"}</Text>
                    </View>
                  ))}
                  {more > 0 && (
                    <View style={[styles.iconBadge, { backgroundColor: "#9ca3af" }]}>
                      <Text style={styles.iconText}>+{more}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {viewMode === "week" && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {weekDays.map((d, idx) => {
              const key = ymd(startOfDay(d));
              const items = dayMap.get(key) ?? [];
              const maxIcons = 3;
              const icons = items.slice(0, maxIcons);
              const more = items.length - icons.length;
              const isToday = key === todayKey;
              const isSelected = selectedDate && key === ymd(startOfDay(selectedDate));
              const borderColor = isSelected ? themeColor : (isToday ? `${themeColor}80` : "#e5e7eb");
              const borderWidth = isSelected ? 2 : (isToday ? 1.5 : 0.5);

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.cell,
                    {
                      width: `${100 / 7}%`,
                      height: cellHeight,
                      borderRadius: 12,
                      backgroundColor: isToday ? `${themeColor}20` : "#fff",
                      borderColor: borderColor,
                      borderWidth: borderWidth,
                      opacity: 1,
                      paddingVertical: 8,
                    },
                  ]}
                  onPress={() => openDetailsFor(d)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dayNum}>{d.getDate()}</Text>
                  <View style={{ marginTop: 6, alignItems: "center" }}>
                    {icons.map((it, i) => (
                      <View key={i} style={[styles.iconBadge, { backgroundColor: (it as DayItem).kind === "task" ? (it as DayTaskItem).color ?? "#9ca3af" : (it as DayScheduleItem).color, marginBottom: 6 }]}>
                        <Text style={styles.iconText}>{it.kind === "task" ? "📚" : "📋"}</Text>
                      </View>
                    ))}
                    {more > 0 && (
                      <View style={[styles.iconBadge, { backgroundColor: "#9ca3af" }]}>
                        <Text style={styles.iconText}>+{more}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedDate && (
            <View style={{ padding: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>{ymd(startOfDay(selectedDate))}</Text>
                <TouchableOpacity onPress={() => { setShowModal(true); }} style={styles.navBtn}>
                  <Text style={{ color: "#374151" }}>Xem chi tiết</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionTitle}>Lịch học</Text>
              {schedulesForSelectedDay.length === 0 ? (
                <View style={styles.emptyRow}><Text style={styles.emptyRowText}>Không có lịch học</Text></View>
              ) : schedulesForSelectedDay.map((s, i) => {
                const st = DEFAULT_TYPE_STYLE[s.type] || { color: s.color || "#6B7280", emoji: "📋", pillBg: "#fff" };
                return (
                  <View key={i} style={[styles.scheduleCard, { borderLeftColor: st.color, backgroundColor: st.pillBg }]}>
                    <View style={styles.rowTop}>
                      <Text style={styles.subjectText}>{st.emoji} {s.subject}</Text>
                    </View>
                    <Text style={styles.timeText}>⏰ {fmtTime(s.start)} – {fmtTime(s.end)}</Text>
                    <Text style={styles.detailText}>👨‍🏫 {s.instructorName ?? "Chưa có giảng viên"}</Text>
                    <Text style={styles.detailText}>📍 {s.location ?? "Chưa có phòng"}</Text>
                  </View>
                );
              })}

              <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Công việc</Text>
              {tasksForSelectedDay.length === 0 ? (
                <View style={styles.emptyRow}><Text style={styles.emptyRowText}>Không có công việc</Text></View>
              ) : tasksForSelectedDay.map((t, i) => {
                const bgColor = getTaskBgColor(t.priority ?? undefined);
                const borderColor = getTaskColor(t.priority ?? undefined);
                const textColor = "#111827";
                return (
                  <View
                    key={i}
                    style={[
                      styles.taskCard,
                      { backgroundColor: bgColor, borderLeftWidth: 6, borderLeftColor: borderColor },
                    ]}
                  >
                    <View style={styles.rowTop}>
                      <Text style={[styles.taskTitleText, { color: textColor }]}>📚 {t.title}</Text>
                    </View>

                    <Text style={[styles.timeText, { color: textColor }]}>
                      ⏰ {fmtTime(t.start)} {t.start || t.end ? "–" : ""} {fmtTime(t.end)}
                    </Text>

                    <View style={styles.rowPills}>
                      <View style={[styles.pill, { backgroundColor: borderColor }]}>
                        <Text style={styles.pillText}>{labelPriorityVn(t.priority ?? undefined)}</Text>
                      </View>

                      <View style={[styles.pill, { backgroundColor: "#fff", borderWidth: 0, paddingHorizontal: 12 }]}>
                        <Text style={[styles.pillText, { color: "#111827" }]}>{labelStatusVn(t.status ?? undefined)}</Text>
                      </View>
                    </View>

                    {t.notes ? <Text style={[styles.detailText, { color: textColor }]}>📝 {t.notes}</Text> : null}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      {viewMode === "day" && (
        <ScrollView style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <View style={{ marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>{ymd(startOfDay(dayFocused))}</Text>
            <TouchableOpacity onPress={() => openDetailsFor(dayFocused)} style={[styles.navBtn]}>
              <Text style={{ color: "#374151" }}>Xem chi tiết</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Lịch học</Text>
          {(() => {
            const key = ymd(startOfDay(dayFocused));
            const items = dayMap.get(key) ?? [];
            const scheds = items.filter(it => it.kind === "schedule") as DayScheduleItem[];
            if (scheds.length === 0) return <View style={styles.emptyRow}><Text style={styles.emptyRowText}>Không có lịch học</Text></View>;
            return scheds.map((s, i) => {
              const st = DEFAULT_TYPE_STYLE[s.type] || { color: s.color || "#6B7280", emoji: "📋", pillBg: "#fff" };
              return (
                <View key={i} style={[styles.scheduleCard, { borderLeftColor: st.color, backgroundColor: st.pillBg }]}>
                  <View style={styles.rowTop}>
                    <Text style={styles.subjectText}>{st.emoji} {s.subject}</Text>
                  </View>
                  <Text style={styles.timeText}>⏰ {fmtTime(s.start)} – {fmtTime(s.end)}</Text>
                  <Text style={styles.detailText}>👨‍🏫 {s.instructorName ?? "Chưa có giảng viên"}</Text>
                  <Text style={styles.detailText}>📍 {s.location ?? "Chưa có phòng"}</Text>
                </View>
              );
            });
          })()}

          <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Công việc</Text>
          {(() => {
            const key = ymd(startOfDay(dayFocused));
            const items = dayMap.get(key) ?? [];
            const tasksList = items.filter(it => it.kind === "task") as DayTaskItem[];
            if (tasksList.length === 0) return <View style={styles.emptyRow}><Text style={styles.emptyRowText}>Không có công việc</Text></View>;
            return tasksList.map((t, i) => {
              const bgColor = getTaskBgColor(t.priority ?? undefined);
              const borderColor = getTaskColor(t.priority ?? undefined);
              const textColor = "#111827";
              return (
                <View
                  key={i}
                  style={[
                    styles.taskCard,
                    { backgroundColor: bgColor, borderLeftWidth: 6, borderLeftColor: borderColor },
                  ]}
                >
                  <View style={styles.rowTop}>
                    <Text style={[styles.taskTitleText, { color: textColor }]}>📚 {t.title}</Text>
                  </View>

                  <Text style={[styles.timeText, { color: textColor }]}>
                    ⏰ {fmtTime(t.start)} {t.start || t.end ? "–" : ""} {fmtTime(t.end)}
                  </Text>

                  <View style={styles.rowPills}>
                    <View style={[styles.pill, { backgroundColor: borderColor }]}>
                      <Text style={styles.pillText}>{labelPriorityVn(t.priority ?? undefined)}</Text>
                    </View>

                    <View style={[styles.pill, { backgroundColor: "#fff", borderWidth: 0, paddingHorizontal: 12 }]}>
                      <Text style={[styles.pillText, { color: "#111827" }]}>{labelStatusVn(t.status ?? undefined)}</Text>
                    </View>
                  </View>

                  {t.notes ? <Text style={[styles.detailText, { color: textColor }]}>📝 {t.notes}</Text> : null}
                </View>
              );
            });
          })()}
        </ScrollView>
      )}

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowModal(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.cardWrapper}>
                <View style={styles.modalList}>
                  <View style={styles.modalHeaderRow}>
                    <View style={styles.datePill}>
                      <Text style={styles.modalDateTitle}>{selectedDate ? `${ymd(startOfDay(selectedDate))}` : ""}</Text>
                    </View>

                    <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeButton}>
                      <Text style={styles.closeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView contentContainerStyle={{ padding: 8 }}>
                    <Text style={styles.sectionTitle}>Lịch học</Text>
                    {schedulesForDay.length === 0 ? (
                      <View style={styles.emptyRow}><Text style={styles.emptyRowText}>Không có lịch học</Text></View>
                    ) : schedulesForDay.map((s, i) => {
                      const st = DEFAULT_TYPE_STYLE[s.type] || { color: s.color || "#6B7280", emoji: "📋", pillBg: "#fff" };
                      return (
                        <View key={i} style={[styles.scheduleCard, { borderLeftColor: st.color, backgroundColor: st.pillBg }]}>
                          <View style={styles.rowTop}>
                            <Text style={styles.subjectText}>{st.emoji} {s.subject}</Text>
                          </View>
                          <Text style={styles.timeText}>⏰ {fmtTime(s.start)} – {fmtTime(s.end)}</Text>
                          <Text style={styles.detailText}>👨‍🏫 {s.instructorName ?? "Chưa có giảng viên"}</Text>
                          <Text style={styles.detailText}>📍 {s.location ?? "Chưa có phòng"}</Text>
                        </View>
                      );
                    })}

                    <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Công việc</Text>
                    {tasksForDay.length === 0 ? (
                      <View style={styles.emptyRow}><Text style={styles.emptyRowText}>Không có công việc</Text></View>
                    ) : tasksForDay.map((t, i) => {
                      const bgColor = getTaskBgColor(t.priority ?? undefined);
                      const borderColor = getTaskColor(t.priority ?? undefined);
                      const textColor = "#111827";
                      return (
                        <View
                          key={i}
                          style={[
                            styles.taskCard,
                            { backgroundColor: bgColor, borderLeftWidth: 6, borderLeftColor: borderColor },
                          ]}
                        >
                          <View style={styles.rowTop}>
                            <Text style={[styles.taskTitleText, { color: textColor }]}>📚 {t.title}</Text>
                          </View>

                          <Text style={[styles.timeText, { color: textColor }]}>
                            ⏰ {fmtTime(t.start)} {t.start || t.end ? "–" : ""} {fmtTime(t.end)}
                          </Text>

                          <View style={styles.rowPills}>
                            <View style={[styles.pill, { backgroundColor: borderColor }]}>
                              <Text style={styles.pillText}>{labelPriorityVn(t.priority ?? undefined)}</Text>
                            </View>

                            <View style={[styles.pill, { backgroundColor: "#fff", borderWidth: 0, paddingHorizontal: 12 }]}>
                              <Text style={[styles.pillText, { color: "#111827" }]}>{labelStatusVn(t.status ?? undefined)}</Text>
                            </View>
                          </View>

                          {t.notes ? <Text style={[styles.detailText, { color: textColor }]}>📝 {t.notes}</Text> : null}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },

  headerSmall: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  navBtnSmall: { padding: 6, borderRadius: 6, backgroundColor: "#f3f4f6", marginHorizontal: 4 },
  navTextSmall: { fontSize: 18, color: "#374151" },
  titleWrapper: { flex: 1, marginHorizontal: 6, minWidth: 80, alignItems: "center" },
  monthTitleSmall: { fontSize: 14, fontWeight: "700", color: "#111827", textAlign: "center", paddingHorizontal: 2 },

  navBtn: { padding: 8, borderRadius: 8, backgroundColor: "#f3f4f6" },
  navText: { fontSize: 22, color: "#374151" },

  weekRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 6, paddingVertical: 6 },
  weekLabel: { width: `${100 / 7}%`, textAlign: "center", color: "#6b7280", fontWeight: "600" },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", justifyContent: "flex-start", paddingVertical: 4 },
  dayNum: { fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 4 },
  iconColumn: { justifyContent: "flex-start", alignItems: "center", gap: 4 },
  iconBadge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 12, color: "#fff" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  cardWrapper: { width: "95%", maxHeight: "85%", backgroundColor: "transparent" },

  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  datePill: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    elevation: 2,
  },
  modalDateTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  closeButton: {
    backgroundColor: "#ffffff",
    width: 38,
    height: 38,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  closeBtn: { fontSize: 18, color: themeColor },

  modalList: { backgroundColor: "#fff", borderRadius: 10, padding: 8 },

  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#374151", marginBottom: 8 },

  scheduleCard: {
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 10,
    elevation: 2,
  },
  taskCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    borderWidth: 0,
  },

  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  subjectText: { fontSize: 16, fontWeight: "600" },
  taskTitleText: { fontSize: 16, fontWeight: "600" },
  timeText: { fontSize: 14, marginBottom: 4, color: "#374151" },
  detailText: { fontSize: 14, marginBottom: 2, color: "#374151" },

  emptyRow: { padding: 12, borderRadius: 8, backgroundColor: "#fff", marginBottom: 8 },
  emptyRowText: { color: "#6b7280" },

  rowPills: { flexDirection: "row", gap: 8, marginTop: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 8 },
  pillText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
