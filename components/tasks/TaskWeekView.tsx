import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import type { Task } from "../../types/Task";
import type { Recurrence } from "../../types/Recurrence";

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
  const MIN_ROW_HEIGHT = 44; // đảm bảo đủ cao để hiển thị trọn chữ "Sáng/Chiều/Tối"
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

    for (const t of filteredTasks) {
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

      const pushDay = (d: Date) => {
        const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), timeH, timeM, timeS, timeMs).getTime();
        pushOcc(t, s, duration);
      };

      // Always include the base occurrence if inside the window
      pushOcc(t, baseStartAt, duration);

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
              pushOcc(t, ms, duration);
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
            if (ms >= baseStartAt && ms <= endBoundary) pushOcc(t, ms, duration);
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
    <View className="mb-3">
      {/* Header điều khiển tuần */}
      <View className="flex-row items-center justify-between">
        <TouchableOpacity
          className="px-3 py-2 bg-gray-200 rounded"
          onPress={() =>
            setCurrentWeekStart((prev) => prev - 7 * 24 * 60 * 60 * 1000)
          }
        >
          <Text>◀ Trước</Text>
        </TouchableOpacity>

        <View className="items-center">
          <Text className="font-medium mb-1">
            {formatDDMMYYYY(weekDays[0])} - {formatDDMMYYYY(weekDays[6])}
          </Text>
          <TouchableOpacity
            className={`px-3 py-1 rounded ${isCurrentWeek ? "bg-blue-600" : "bg-gray-500"}`}
            onPress={() => {
              const t = new Date();
              const dow = t.getDay() || 7;
              const monday = new Date(t);
              monday.setDate(t.getDate() - (dow - 1));
              monday.setHours(0, 0, 0, 0);
              setCurrentWeekStart(monday.getTime());
            }}
          >
            <Text className="text-white text-xs">Tuần hiện tại</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          className="px-3 py-2 bg-gray-200 rounded"
          onPress={() =>
            setCurrentWeekStart((prev) => prev + 7 * 24 * 60 * 60 * 1000)
          }
        >
          <Text>Sau ▶</Text>
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
          <View className="mt-3 flex-row">
            {/* Cột trái cố định */}
            <View className="border border-gray-300 rounded-l bg-white">
              <View className="w-20 h-10 bg-gray-200 justify-center items-center border-b border-gray-300">
                <Text className="text-xs font-bold">Khung giờ</Text>
              </View>
              { ["Sáng", "Chiều", "Tối"].map((_, pIdx) => (
                <View
                  key={`left-${pIdx}`}
                  style={{ height: Math.max(MIN_ROW_HEIGHT, rowHeights[pIdx]) }}
                  className="w-20 justify-center items-center border-b border-gray-300 bg-gray-100 px-1"
                >
                  <Text className="text-xs font-medium text-center">
                    {pIdx === 0 ? "🌞 Sáng" : pIdx === 1 ? "🌇 Chiều" : "🌙 Tối"}
                  </Text>
                </View>
              ))}
            </View>

            {/* Phần phải cuộn ngang */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="border-t border-r border-b border-gray-300 rounded-r bg-white">
                {/* Header ngày */}
                <View className="flex-row">
                  {weekDays.map((day, idx) => (
                    <View
                      key={`hdr-${day}`}
                      className="w-40 h-10 bg-blue-500 justify-center items-center border-r border-b border-gray-300"
                    >
                      <Text className="text-xs font-bold text-white">
                        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"][idx]} {formatDDMMYYYY(day)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* 3 hàng nội dung; đo chiều cao để sync với cột trái */}
                {["Sáng", "Chiều", "Tối"].map((period, pIdx) => (
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
                        <View key={`${day}-${period}`} className="w-40 p-1 border-r border-b border-gray-300">
                          {tasks.map((t) => (
                            <TouchableOpacity
                              key={`${t.id}-${t._occurrenceStart ?? t.start_at}`}
                              className={`mb-1 rounded px-2 py-1 border ${
                                t.priority === "high"
                                  ? "bg-red-100 border-red-400"
                                  : t.priority === "medium"
                                    ? "bg-yellow-100 border-yellow-400"
                                    : "bg-green-100 border-green-400"
                              }`}
                              onPress={() => {
                                setDetailTask(t);
                                setShowDetail(true);
                              }}
                            >
                              <Text
                                className={`text-[11px] leading-4 ${
                                  t.priority === "high"
                                    ? "text-red-700"
                                    : t.priority === "medium"
                                      ? "text-yellow-700"
                                      : "text-green-700"
                                }`}
                                numberOfLines={2}
                                ellipsizeMode="tail"
                              >
                                {`📋 ${t.title}`}
                              </Text>
                            </TouchableOpacity>
                          ))}
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