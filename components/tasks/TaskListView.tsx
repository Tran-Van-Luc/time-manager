import React, { useState } from "react";
import { SectionList, View, Text, TouchableOpacity, Platform } from "react-native";
import DateTimePicker from '@react-native-community/datetimepicker';
import type { Task } from "../../types/Task";
import type { Reminder} from "../../types/Reminder";
import type { Recurrence } from "../../types/Recurrence";
import TaskItem from "./TaskItem";
import CompactSelect from "./CompactSelect";

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

  // State for selected date
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [todayBtnWidth, setTodayBtnWidth] = useState<number | undefined>(undefined);

  // Utils
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const getRecurrenceFor = (task: Task) =>
    task.recurrence_id
      ? recurrences.find((r) => r.id === task.recurrence_id)
      : undefined;

  // Filter tasks for selected date
  const getOccurrenceForDate = (task: Task, date: Date): { start: number; end?: number } | null => {
    const baseStart = task.start_at ? new Date(task.start_at) : null;
    if (!baseStart) return null;
    const baseStartMs = baseStart.getTime();
    const baseEndMs = task.end_at ? new Date(task.end_at).getTime() : undefined;
    const duration = baseEndMs && baseEndMs > baseStartMs ? (baseEndMs - baseStartMs) : undefined;

    const timeH = baseStart.getHours();
    const timeM = baseStart.getMinutes();
    const timeS = baseStart.getSeconds();
    const timeMs = baseStart.getMilliseconds();

    // Candidate occurrence at same time-of-day
    const candidateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), timeH, timeM, timeS, timeMs).getTime();
    const candidateEnd = duration !== undefined ? candidateStart + duration : undefined;

    // Non-repeating: check if base starts on selected date
    const selStart = startOfDay(date);
    const selEnd = endOfDay(date);
    if (!task.recurrence_id) {
      return (baseStartMs >= selStart && baseStartMs <= selEnd) ? { start: baseStartMs, end: baseEndMs } : null;
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
      return days.includes(date.getDay()) ? { start: candidateStart, end: candidateEnd } : null;
    }
    if (freq === "monthly") {
      let dom: number[] = [];
      if (rec.day_of_month) {
        try {
          dom = (JSON.parse(rec.day_of_month) as string[]).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
        } catch {}
      }
      if (dom.length === 0) dom = [baseStart.getDate()];
      return dom.includes(date.getDate()) ? { start: candidateStart, end: candidateEnd } : null;
    }
    if (freq === "yearly") {
      return (date.getDate() === baseStart.getDate() && date.getMonth() === baseStart.getMonth())
        ? { start: candidateStart, end: candidateEnd }
        : null;
    }
    return null;
  };

  // Filter tasks for selected date
  const selectedItems: Task[] = [];
  const occurrenceStartMap = new Map<number, number>();
  for (const t of filteredTasks) {
    const occ = getOccurrenceForDate(t, selectedDate);
    if (occ) {
      selectedItems.push(t);
      if (t.id != null) occurrenceStartMap.set(t.id, occ.start);
    }
  }

  // Sort by occurrence start time, then title
  selectedItems.sort((a, b) => {
    const aOcc = a.id != null ? occurrenceStartMap.get(a.id) : undefined;
    const bOcc = b.id != null ? occurrenceStartMap.get(b.id) : undefined;
    if (aOcc != null && bOcc != null) {
      if (aOcc !== bOcc) return aOcc - bOcc;
      return (a.title || "").localeCompare(b.title || "");
    }
    if (aOcc != null) return -1;
    if (bOcc != null) return 1;
    // fallback: sort by start_at
    const aStartRaw = a.start_at ? (typeof a.start_at === "string" ? new Date(a.start_at).getTime() : a.start_at) : Number.POSITIVE_INFINITY;
    const bStartRaw = b.start_at ? (typeof b.start_at === "string" ? new Date(b.start_at).getTime() : b.start_at) : Number.POSITIVE_INFINITY;
    if (aStartRaw !== bStartRaw) return aStartRaw - bStartRaw;
    return (a.title || "").localeCompare(b.title || "");
  });

  // Date navigation handlers
  const goPrevDay = () => {
    setShowAll(false);
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };
  const goNextDay = () => {
    setShowAll(false);
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  };
  const onPressToday = () => {
    // Always return to today's date in day mode
    setShowAll(false);
    setSelectedDate(new Date());
  };
  const goToday = () => {
    setShowAll(false);
    setSelectedDate(new Date());
  };

  // Date display
  const dateLabel = `${selectedDate.getDate().toString().padStart(2, '0')}/${(selectedDate.getMonth()+1).toString().padStart(2, '0')}/${selectedDate.getFullYear()}`;
  const isTodaySelected = isSameDay(selectedDate, new Date());

  // Prepare items and title based on mode
  const listItems = showAll ? [...filteredTasks].sort((a, b) => {
    const aStartRaw = a.start_at ? (typeof a.start_at === "string" ? new Date(a.start_at).getTime() : a.start_at) : Number.POSITIVE_INFINITY;
    const bStartRaw = b.start_at ? (typeof b.start_at === "string" ? new Date(b.start_at).getTime() : b.start_at) : Number.POSITIVE_INFINITY;
    if (aStartRaw !== bStartRaw) return aStartRaw - bStartRaw;
    return (a.title || "").localeCompare(b.title || "");
  }) : selectedItems;
  const sectionTitle = showAll ? 'Toàn bộ' : dateLabel;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 as any, marginVertical: 8 }}>
        {!showAll && (
          <TouchableOpacity onPress={goPrevDay} style={{ paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 18 }}>{'<'}</Text>
          </TouchableOpacity>
        )}
        {!showAll && (
          <TouchableOpacity onPress={() => { setShowAll(false); setShowDatePicker(true); }} style={{ paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, backgroundColor: '#f5f5f5' }}>
            <Text style={{ fontWeight: '600', fontSize: 16 }}>{dateLabel}</Text>
          </TouchableOpacity>
        )}
        <View style={{ position: 'relative', marginHorizontal: 6 }}>
          <TouchableOpacity onLayout={(e) => setTodayBtnWidth(e.nativeEvent.layout.width)} onPress={onPressToday} style={{ paddingVertical: 6, paddingHorizontal: 16, paddingRight: 40, borderWidth: 1, borderColor: (isTodaySelected && !showAll) ? '#007AFF' : (showAll ? '#007AFF' : '#ddd'), borderRadius: 20, backgroundColor: (isTodaySelected && !showAll) ? '#007AFF' : '#f5f5f5' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: (isTodaySelected && !showAll) ? '#fff' : '#000' }}>{showAll ? 'Toàn bộ' : 'Hôm nay'}</Text>
          </TouchableOpacity>
          {/* Arrow overlay at the right end of the same button; only tapping arrow opens dropdown */}
          <View style={{ position: 'absolute', top: 0, right: 0 }}>
            <CompactSelect
              value={showAll ? 'all' : 'today'}
              onChange={(v) => {
                if (v === 'today') {
                  setShowAll(false);
                  setSelectedDate(new Date());
                } else if (v === 'all') {
                  setShowAll(true);
                }
              }}
              options={[
                { label: 'Hôm nay', value: 'today' },
                { label: 'Toàn bộ', value: 'all' },
              ]}
              fontSizeClassName="text-base"
              iconOnly
              buttonStyle={{ borderWidth: 0, backgroundColor: 'transparent', paddingVertical: 6, paddingHorizontal: 12 }}
              menuWidth={todayBtnWidth}
            />
          </View>
        </View>
        {!showAll && (
          <TouchableOpacity onPress={goNextDay} style={{ paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 18 }}>{'>'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) {
              setShowAll(false);
              setSelectedDate(date);
            }
          }}
        />
      )}
      {/* Mode selection handled inline by CompactSelect */}
      <SectionList
        sections={[{ title: sectionTitle, data: listItems }]}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        renderSectionHeader={() => null}
        stickySectionHeadersEnabled={false}
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
            hideDate={!showAll}
          />
        )}
      />
    </View>
  );
}