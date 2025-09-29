import React from "react";
import { SectionList, View, Text } from "react-native";
import type { Task } from "../../types/Task";
import type { Reminder} from "../../types/Reminder";
import type { Recurrence } from "../../types/Recurrence";
import TaskItem from "./TaskItem";

interface TaskListViewProps {
  filteredTasks: Task[];
  reminders: Reminder[];
  recurrences: Recurrence[];
  REPEAT_OPTIONS: { label: string; value: string }[];
  editTask: (id: number, updates: Partial<Task>) => Promise<void>;
  openEditModal: (task: Task) => void;
  handleDeleteTask: (id: number) => void;
  loading: boolean;
}

export default function TaskListView({
  filteredTasks,
  reminders,
  recurrences,
  REPEAT_OPTIONS,
  editTask,
  openEditModal,
  handleDeleteTask,
  loading,
}: TaskListViewProps) {
  if (loading) {
    return <Text>Đang tải...</Text>;
  }

  // Helpers
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x.getTime();
  };
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  const getRecurrenceFor = (task: Task) =>
    task.recurrence_id
      ? recurrences.find((r) => r.id === task.recurrence_id)
      : undefined;

  const getTodayOccurrence = (task: Task): { start: number; end?: number } | null => {
    const baseStart = task.start_at ? new Date(task.start_at) : null;
    if (!baseStart) return null;
    const baseStartMs = baseStart.getTime();
    const baseEndMs = task.end_at ? new Date(task.end_at).getTime() : undefined;
    const duration = baseEndMs && baseEndMs > baseStartMs ? (baseEndMs - baseStartMs) : undefined;

    const timeH = baseStart.getHours();
    const timeM = baseStart.getMinutes();
    const timeS = baseStart.getSeconds();
    const timeMs = baseStart.getMilliseconds();

    // Candidate occurrence today at same time-of-day
    const candidateStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), timeH, timeM, timeS, timeMs).getTime();
    const candidateEnd = duration !== undefined ? candidateStart + duration : undefined;

    // Non-repeating: check if base starts today
    if (!task.recurrence_id) {
      return (baseStartMs >= todayStart && baseStartMs <= todayEnd) ? { start: baseStartMs, end: baseEndMs } : null;
    }

    const rec = getRecurrenceFor(task);
    if (!rec) return null;

    const endBoundary = rec.end_date ?? Infinity;
    const boundaryStart = Math.max(baseStartMs, rec.start_date ?? baseStartMs);
    if (candidateStart < boundaryStart || candidateStart > endBoundary) return null;

    const freq = (rec.type || "daily").toLowerCase();
    if (freq === "daily") {
      return { start: candidateStart, end: candidateEnd };
    }
    if (freq === "weekly") {
      const dowMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
      let days: number[] = [];
      if (rec.days_of_week) {
        try {
          const arr = JSON.parse(rec.days_of_week) as string[];
          days = arr.map((d) => dowMap[d as keyof typeof dowMap]).filter((n) => n !== undefined);
        } catch {}
      }
      if (days.length === 0) days = [baseStart.getDay()];
      return days.includes(today.getDay()) ? { start: candidateStart, end: candidateEnd } : null;
    }
    if (freq === "monthly") {
      let dom: number[] = [];
      if (rec.day_of_month) {
        try {
          dom = (JSON.parse(rec.day_of_month) as string[]).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
        } catch {}
      }
      if (dom.length === 0) dom = [baseStart.getDate()];
      return dom.includes(today.getDate()) ? { start: candidateStart, end: candidateEnd } : null;
    }
    if (freq === "yearly") {
      return (today.getDate() === baseStart.getDate() && today.getMonth() === baseStart.getMonth())
        ? { start: candidateStart, end: candidateEnd }
        : null;
    }
    return null;
  };

  const todayItems: Task[] = [];
  const otherItems: Task[] = [];

  for (const t of filteredTasks) {
    const occ = getTodayOccurrence(t);
    if (occ) {
      todayItems.push({
        ...t,
        start_at: new Date(occ.start).toISOString(),
        end_at: occ.end !== undefined ? new Date(occ.end).toISOString() : undefined,
      } as Task);
    } else {
      otherItems.push(t);
    }
  }

  // Sort each section by start time
  const byStart = (a: Task, b: Task) => {
    const aStart = a.start_at
      ? (typeof a.start_at === "string" ? new Date(a.start_at).getTime() : a.start_at)
      : Number.POSITIVE_INFINITY;
    const bStart = b.start_at
      ? (typeof b.start_at === "string" ? new Date(b.start_at).getTime() : b.start_at)
      : Number.POSITIVE_INFINITY;
    if (aStart !== bStart) return aStart - bStart;
    // Tie-breaker by title for stable ordering
    return (a.title || "").localeCompare(b.title || "");
  };
  todayItems.sort(byStart);
  otherItems.sort(byStart);

  const sections = [
    { title: "Hôm nay", data: todayItems },
    { title: "Các công việc khác", data: otherItems },
  ];

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
      renderSectionHeader={({ section: { title } }) => (
        <View className="bg-gray-100 px-3 py-2">
          <Text className="font-semibold">{title}</Text>
        </View>
      )}
      renderSectionFooter={({ section }) => (
        section.data.length === 0 ? (
          <View className="px-3 py-2">
            <Text className="italic text-gray-500">Không có công việc</Text>
          </View>
        ) : null
      )}
      renderItem={({ item }) => (
        <TaskItem
          item={item}
          reminders={reminders}
          recurrences={recurrences}
          REPEAT_OPTIONS={REPEAT_OPTIONS}
          editTask={editTask}
          openEditModal={openEditModal}
          handleDeleteTask={handleDeleteTask}
        />
      )}
  // Tổng thể rỗng vẫn có hai footer ở trên; bỏ ListEmptyComponent để tránh trùng
    />
  );
}