import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import type { Task } from "../../types/Task";
import type { Recurrence } from "../../types/Recurrence";
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

interface TaskWeekViewProps {
  filteredTasks: Task[];
  currentWeekStart: number;
  setCurrentWeekStart: (value: number | ((prev: number) => number)) => void;
  setDetailTask: (task: Task | null) => void;
  setShowDetail: (show: boolean) => void;
  recurrences: Recurrence[];
}

export default function TaskWeekView({
  filteredTasks,
  currentWeekStart,
  setCurrentWeekStart,
  setDetailTask,
  setShowDetail,
  recurrences,
}: TaskWeekViewProps) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = {
    background: isDark ? "#071226" : "#fff",
    surface: isDark ? "#0b1220" : "#FFFFFF",
    headerPillBg: isDark ? "#0f1724" : "#f5f5f5",
    headerPillBorder: isDark ? "#223049" : "#ddd",
    text: isDark ? "#E6EEF8" : "#111827",
    mutedText: isDark ? "#C6D4E1" : "#333",
    tableBorder: isDark ? "#223049" : "#d1d5db",
    tableHeaderBg: isDark ? "#1d4ed8" : "#3b82f6",
    tableHeaderText: "#ffffff",
    leftColBg: isDark ? "#0f172a" : "#f3f4f6",
    leftColHeaderBg: isDark ? "#16253b" : "#e5e7eb",
    buttonBg: isDark ? "#0f172a" : "#fff",
    buttonBorder: isDark ? "#223049" : "#ddd",
    todayBorder: isDark ? "#60A5FA" : "#007AFF",
    todayBg: isDark ? "#1e40af" : "#007AFF",
  };
  const MIN_ROW_HEIGHT = 44; // đảm bảo đủ cao để hiển thị trọn chữ "Sáng/Chiều/Tối"
  const COL_WIDTH = 100; // chiều rộng mỗi cột ngày (nhỏ hơn để đỡ phải kéo ngang nhiều)
  // Tính Monday của tuần hiện tại (00:00) để so với currentWeekStart
  const today = new Date();
  const dayOfWeek = today.getDay() || 7; // 1..7 (Mon..Sun)
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - (dayOfWeek - 1));
  currentMonday.setHours(0, 0, 0, 0);
  const isCurrentWeek = currentWeekStart === currentMonday.getTime();
  const startOfDay = (dt: number | Date) => {
    const d = new Date(dt);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const endOfDay = (dt: number | Date) => {
    const d = new Date(dt);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  };

  const formatDDMMYYYY = (ms: number) => {
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const weekDays: number[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d.getTime();
  });

  // ---- Expand recurring tasks into occurrences within the current week ----
  const tasksForWeek = useMemo(() => {
    const startWeek = new Date(currentWeekStart);
    startWeek.setHours(0, 0, 0, 0);
    const endWeek = new Date(currentWeekStart);
    endWeek.setDate(endWeek.getDate() + 6);
    endWeek.setHours(23, 59, 59, 999);

    const durationOf = (t: Task) => {
      const s = t.start_at ? new Date(t.start_at).getTime() : undefined;
      const e = t.end_at ? new Date(t.end_at).getTime() : undefined;
      return s !== undefined && e !== undefined ? Math.max(0, e - s) : 0;
    };

    const result: Array<Task & { _occurrenceStart?: number; _occurrenceEnd?: number }> = [];
    const seen = new Set<string>();

    const pushOcc = (task: Task, startMs: number, duration: number) => {
      const occStart = startMs;
      const occEnd = occStart + duration;
      if (occEnd < startWeek.getTime() || occStart > endWeek.getTime()) return;
      const key = `${task.id ?? "tmp"}-${occStart}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ ...task, _occurrenceStart: occStart, _occurrenceEnd: occEnd });
    };

    const sameYMD = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const dayNameToIndex = (name: string): number | null => {
      const key = name.trim().toLowerCase();
      const map: Record<string, number> = {
        sun: 0, sunday: 0,
        mon: 1, monday: 1,
        tue: 2, tues: 2, tuesday: 2,
        wed: 3, wednesday: 3,
        thu: 4, thurs: 4, thursday: 4,
        fri: 5, friday: 5,
        sat: 6, saturday: 6,
      };
      return key in map ? map[key] : null;
    };

    // Do not hide completed tasks — include all tasks so completed occurrences
    // (non-recurring, recurring occurrences and merged ranges) are shown.
    const filtered = filteredTasks;

    for (const t of filtered) {
      const start = t.start_at ? new Date(t.start_at) : null;
      if (!start) continue;
      const duration = durationOf(t);
      const baseStartAt = start.getTime();

      if (!t.recurrence_id) {
        pushOcc(t, baseStartAt, duration);
        continue;
      }

      const rec = recurrences.find((r) => r.id === t.recurrence_id);
      if (!rec) {
        pushOcc(t, baseStartAt, duration);
        continue;
      }

      const endBoundary = rec.end_date ?? endWeek.getTime();
      const freq = (rec.type || "daily").toLowerCase();
      const interval = Math.max(1, rec.interval || 1);

      const timeH = start.getHours();
      const timeM = start.getMinutes();
      const timeS = start.getSeconds();
      const timeMs = start.getMilliseconds();

      // We always include occurrences — pushDay simply adds the occurrence.
      const pushDay = (d: Date) => {
        const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), timeH, timeM, timeS, timeMs).getTime();
        pushOcc(t, s, duration);
      };

      // Only include base occurrence when it actually matches the recurrence selection
      const maybeIncludeBase = () => {
        if (freq === 'daily' || freq === 'yearly') {
          pushOcc(t, baseStartAt, duration);
          return;
        }
        if (freq === 'weekly') {
          const dowSet = new Set(
            rec.days_of_week
              ? (JSON.parse(rec.days_of_week) as string[])
                  .map((d) => dayNameToIndex(d))
                  .filter((n): n is number => n !== null)
              : []
          );
          if (dowSet.size === 0) dowSet.add(start.getDay());
          if (dowSet.has(start.getDay())) pushOcc(t, baseStartAt, duration);
          return;
        }
        if (freq === 'monthly') {
          const domList: number[] = rec.day_of_month
            ? (JSON.parse(rec.day_of_month) as string[]).map((d) => parseInt(d, 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 31)
            : [start.getDate()];
          if (domList.includes(start.getDate())) pushOcc(t, baseStartAt, duration);
          return;
        }
      };
      maybeIncludeBase();

      if (freq === "daily") {
        let cursor = sameYMD(start);
        while (true) {
          cursor = new Date(cursor);
          cursor.setDate(cursor.getDate() + interval);
          if (cursor.getTime() > endBoundary) break;
          pushDay(cursor);
          if (cursor.getTime() > endWeek.getTime()) break;
        }
      } else if (freq === "weekly") {
        const dowSet = new Set(
          rec.days_of_week
            ? (JSON.parse(rec.days_of_week) as string[])
                .map((d) => dayNameToIndex(d))
                .filter((n): n is number => n !== null)
            : []
        );
        if (dowSet.size === 0) dowSet.add(start.getDay());

        // Generate occurrences for days within the current week only for performance
        let cursor = new Date(startWeek);
        while (cursor.getTime() <= endWeek.getTime()) {
          if (dowSet.has(cursor.getDay())) {
            const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), timeH, timeM, timeS, timeMs);
            const ms = candidate.getTime();
            if (ms >= baseStartAt && ms <= endBoundary) {
              pushDay(candidate);
            }
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      } else if (freq === "monthly") {
        const domList: number[] = rec.day_of_month
          ? (JSON.parse(rec.day_of_month) as string[]).map((d) => parseInt(d, 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 31)
          : [start.getDate()];
        // Only within this week window
        const cursor = new Date(startWeek);
        while (cursor.getTime() <= endWeek.getTime()) {
          for (const dom of domList) {
            const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), dom, timeH, timeM, timeS, timeMs);
            if (candidate.getMonth() !== cursor.getMonth()) continue;
            const ms = candidate.getTime();
            if (ms >= baseStartAt && ms <= endBoundary) pushDay(candidate);
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      } else if (freq === "yearly") {
        // Only include if this week matches same month/day
        const cursor = new Date(startWeek);
        while (cursor.getTime() <= endWeek.getTime()) {
          if (
            cursor.getDate() === start.getDate() &&
            cursor.getMonth() === start.getMonth()
          ) {
            const ms = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), timeH, timeM, timeS, timeMs).getTime();
            if (ms >= baseStartAt && ms <= endBoundary) pushOcc(t, ms, duration);
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    // Sort occurrences by start
    return result.sort((a, b) => (a._occurrenceStart ?? 0) - (b._occurrenceStart ?? 0));
  }, [filteredTasks, recurrences, currentWeekStart]);

  return (
    <View className="mb-3" style={{ backgroundColor: colors.background }}>
      {/* Header điều khiển tuần - style đồng nhất với dạng danh sách */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 as any, marginVertical: 8 }}>
        <TouchableOpacity
          onPress={() => setCurrentWeekStart((prev) => prev - 7 * 24 * 60 * 60 * 1000)}
          style={{ paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.buttonBorder, borderRadius: 8, backgroundColor: colors.buttonBg }}
        >
          <Text style={{ fontSize: 18, color: colors.text }}>{'<'}</Text>
        </TouchableOpacity>

        {/* Nhãn dải ngày của tuần dạng pill */}
        <View style={{ paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.headerPillBorder, borderRadius: 20, backgroundColor: colors.headerPillBg }}>
          <Text style={{ fontWeight: '600', fontSize: 16, color: colors.text }}>
            {formatDDMMYYYY(weekDays[0])} - {formatDDMMYYYY(weekDays[6])}
          </Text>
        </View>

        {/* Nút "Tuần hiện tại" styled như nút Hôm nay */}
        <TouchableOpacity
          onPress={() => setCurrentWeekStart((prev) => prev + 7 * 24 * 60 * 60 * 1000)}
          style={{ paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.buttonBorder, borderRadius: 8, backgroundColor: colors.buttonBg }}
        >
          <Text style={{ fontSize: 18, color: colors.text }}>{'>'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            const t = new Date();
            const dow = t.getDay() || 7;
            const monday = new Date(t);
            monday.setDate(t.getDate() - (dow - 1));
            monday.setHours(0, 0, 0, 0);
            setCurrentWeekStart(monday.getTime());
          }}
          style={{ paddingVertical: 6, paddingHorizontal: 16, borderWidth: 1, borderColor: isCurrentWeek ? colors.todayBorder : colors.headerPillBorder, borderRadius: 20, backgroundColor: isCurrentWeek ? colors.todayBg : colors.headerPillBg }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: isCurrentWeek ? '#fff' : colors.text }}>{t.tasks?.week?.currentWeek}</Text>
        </TouchableOpacity>
      </View>

      {/* Bảng tuần: cột khung giờ cố định + phần ngày cuộn ngang; chiều cao hàng khớp theo nội dung */}
      {(() => {
        const [rowHeights, setRowHeights] = useState<number[]>([MIN_ROW_HEIGHT, MIN_ROW_HEIGHT, MIN_ROW_HEIGHT]);
        const setHeight = (idx: number, h: number) => {
          if (!Number.isFinite(h) || h <= 0) return;
          const next = Math.max(MIN_ROW_HEIGHT, Math.ceil(h));
          setRowHeights((prev) => (prev[idx] === next ? prev : prev.map((v, i) => (i === idx ? next : v))));
        };

        return (
          <View className="mt-3 flex-row" style={{ backgroundColor: colors.surface }}>
            {/* Cột trái cố định */}
            <View className="border rounded-l" style={{ borderColor: colors.tableBorder, backgroundColor: colors.surface }}>
              <View className="w-20 h-10 justify-center items-center border-b" style={{ backgroundColor: colors.leftColHeaderBg, borderColor: colors.tableBorder }}>
                <Text className="text-xs font-bold" style={{ color: colors.text }}>{t.tasks?.week?.timeSlots}</Text>
              </View>
              { ["morning", "afternoon", "evening"].map((key, pIdx) => (
                <View
                  key={`left-${pIdx}`}
                  className="w-20 justify-center items-center border-b px-1"
                  style={{
                    height: Math.max(MIN_ROW_HEIGHT, rowHeights[pIdx]),
                    backgroundColor: colors.leftColBg,
                    borderColor: colors.tableBorder,
                  }}
                >
                  <Text className="text-xs font-medium text-center" style={{ color: colors.mutedText }}>
                    {pIdx === 0 ? `🌞 ${t.tasks?.week?.morning}` : pIdx === 1 ? `🌇 ${t.tasks?.week?.afternoon}` : `🌙 ${t.tasks?.week?.evening}`}
                  </Text>
                </View>
              ))}
            </View>

            {/* Phần phải cuộn ngang */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="border-t border-r border-b rounded-r" style={{ borderColor: colors.tableBorder, backgroundColor: colors.surface }}>
                {/* Header ngày */}
                <View className="flex-row">
                  {weekDays.map((day, idx) => (
                    <View
                      key={`hdr-${day}`}
                      className="h-10 justify-center items-center border-r border-b"
                      style={{ width: COL_WIDTH, backgroundColor: colors.tableHeaderBg, borderColor: colors.tableBorder }}
                    >
                      <Text className="text-xs font-bold" style={{ color: colors.tableHeaderText }}>
                        {(t.tasks?.week?.dayShorts ?? ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"])[idx]} {formatDDMMYYYY(day)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* 3 hàng nội dung; đo chiều cao để sync với cột trái */}
                {["morning", "afternoon", "evening"].map((period, pIdx) => (
                  <View
                    key={`row-${period}`}
                    className="flex-row"
                    style={{ minHeight: MIN_ROW_HEIGHT }}
                    onLayout={(e) => setHeight(pIdx, e.nativeEvent.layout.height)}
                  >
                    {weekDays.map((day) => {
                      const tasks = tasksForWeek
                        .filter((t) => {
                          const ts = t._occurrenceStart ?? (t.start_at ? new Date(t.start_at).getTime() : NaN);
                          if (isNaN(ts)) return false;
                          const inDay = ts >= startOfDay(day) && ts <= endOfDay(day);
                          if (!inDay) return false;
                          const hour = new Date(ts).getHours();
                          if (pIdx === 0) return hour < 12;
                          if (pIdx === 1) return hour >= 12 && hour < 18;
                          return hour >= 18;
                        })
                        .sort((a, b) => {
                          const aStart = a._occurrenceStart ?? (a.start_at ? new Date(a.start_at).getTime() : 0);
                          const bStart = b._occurrenceStart ?? (b.start_at ? new Date(b.start_at).getTime() : 0);
                          return aStart - bStart;
                        });

                      return (
                        <View key={`${day}-${period}`} className="p-1 border-r border-b" style={{ width: COL_WIDTH, borderColor: colors.tableBorder }}>
                          {tasks.map((t) => {
                            const chipColors = (() => {
                              if (t.priority === 'high') {
                                return {
                                  bg: isDark ? '#fecaca' : '#fee2e2', // red-200/100
                                  border: isDark ? '#f87171' : '#f87171', // red-400
                                  text: isDark ? '#0b1220' : '#991b1b', // black-ish on dark, red-800 on light
                                };
                              }
                              if (t.priority === 'medium') {
                                return {
                                  bg: isDark ? '#fef3c7' : '#fef9c3', // amber-200/100
                                  border: isDark ? '#f59e0b' : '#f59e0b', // amber-500
                                  text: isDark ? '#0b1220' : '#92400e', // black-ish on dark, amber-800
                                };
                              }
                              return {
                                bg: isDark ? '#d1fae5' : '#dcfce7', // green-200/100
                                border: isDark ? '#34d399' : '#34d399', // green-400
                                text: isDark ? '#0b1220' : '#065f46', // black-ish on dark, green-800
                              };
                            })();
                            return (
                              <TouchableOpacity
                                key={`${t.id}-${t._occurrenceStart ?? t.start_at}`}
                                style={{
                                  marginBottom: 4,
                                  borderRadius: 6,
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  borderWidth: 1,
                                  backgroundColor: chipColors.bg,
                                  borderColor: chipColors.border,
                                }}
                                onPress={() => {
                                  setDetailTask(t);
                                  setShowDetail(true);
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    lineHeight: 16,
                                    color: chipColors.text,
                                  }}
                                  numberOfLines={2}
                                  ellipsizeMode="tail"
                                >
                                  {`📋 ${t.title}`}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        );
      })()}
    </View>
  );
}