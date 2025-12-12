import React, { useState } from "react";
import { SectionList, View, Text, TouchableOpacity, Platform } from "react-native";
import DateTimePicker from '@react-native-community/datetimepicker';
import type { Task } from "../../types/Task";
import type { Reminder} from "../../types/Reminder";
import type { Recurrence } from "../../types/Recurrence";
import TaskItem from "./TaskItem";
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

interface TaskListViewProps {
  filteredTasks: Task[];
  search?: string;
  // allTasks: Task[]; // Removed to simplify the props
  reminders: Reminder[];
  recurrences: Recurrence[];
  REPEAT_OPTIONS: { label: string; value: string }[];
  editTask: (id: number, updates: Partial<Task>) => Promise<void>;
  openEditModal: (task: Task) => void;
  handleDeleteTask: (id: number) => void;
  loading: boolean;
  onInlineAlert?: (info: { tone: 'error'|'warning'|'success'|'info'; title: string; message: string }) => void;
}

export default function TaskListView({
  filteredTasks,
  search,
  // allTasks, // Removed to simplify the props
  reminders,
  recurrences,
  REPEAT_OPTIONS,
  editTask,
  openEditModal,
  handleDeleteTask,
  loading,
  onInlineAlert,
}: TaskListViewProps) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const colors = {
    background: isDark ? '#071226' : '#fff',
    surface: isDark ? '#0b1220' : '#FFFFFF',
    cardBorder: isDark ? '#223049' : '#ddd',
    text: isDark ? '#E6EEF8' : '#111827',
    pillBg: isDark ? '#0f1724' : '#f5f5f5',
    todayBorder: isDark ? '#60A5FA' : '#007AFF',
    todayBg: isDark ? '#1e40af' : '#007AFF',
    buttonBg: isDark ? '#0f172a' : '#FFFFFF',
    buttonBorder: isDark ? '#223049' : '#ddd',
  };
  if (loading) {
    return <Text>{t.tasks?.list?.loading}</Text>;
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
    const baseStartMs = baseStart ? baseStart.getTime() : undefined;
    const baseEndMs = task.end_at ? new Date(task.end_at).getTime() : undefined;

    // Non-repeating: include if any part of [start, end] overlaps the selected date
    const selStart = startOfDay(date);
    const selEnd = endOfDay(date);
    if (!task.recurrence_id) {
      const s = (baseStartMs != null) ? baseStartMs : (baseEndMs != null ? baseEndMs : undefined);
      const e = (baseEndMs != null) ? baseEndMs : (baseStartMs != null ? baseStartMs : undefined);
      if (s == null || e == null) return null;
      const overlaps = s <= selEnd && e >= selStart;
      if (!overlaps) return null;
      const occStart = Math.max(s, selStart);
      const occEnd = baseEndMs != null ? Math.min(baseEndMs, selEnd) : undefined;
      return { start: occStart, end: occEnd };
    }

  const rec = getRecurrenceFor(task);
    if (!rec) {
      // Fallback: treat as non-recurring if recurrence record is missing
      const s = (baseStartMs != null) ? baseStartMs : (baseEndMs != null ? baseEndMs : undefined);
      const e = (baseEndMs != null) ? baseEndMs : (baseStartMs != null ? baseStartMs : undefined);
      if (s == null || e == null) return null;
      const overlaps = s <= selEnd && e >= selStart;
      if (!overlaps) return null;
      const occStart = Math.max(s, selStart);
      const occEnd = baseEndMs != null ? Math.min(baseEndMs, selEnd) : undefined;
      return { start: occStart, end: occEnd };
    }
    // Recurrence exists: need base start to compute time-of-day candidate
    if (baseStartMs == null || !baseStart) return null;
    const bs = baseStartMs as number;
    const duration = (baseEndMs != null && baseEndMs > bs) ? (baseEndMs - bs) : undefined;
    const timeH = baseStart.getHours();
    const timeM = baseStart.getMinutes();
    const timeS = baseStart.getSeconds();
    const timeMs = baseStart.getMilliseconds();
    const candidateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), timeH, timeM, timeS, timeMs).getTime();
    const candidateEnd = duration !== undefined ? candidateStart + duration : undefined;

    // Convert recurrence boundaries to ms and make endDate inclusive (end of day)
    const recStartMs = rec.start_date ? new Date(rec.start_date).getTime() : undefined;
    const recEndMs = rec.end_date ? endOfDay(new Date(rec.end_date)) : undefined;
    const endBoundary = recEndMs ?? Infinity;
    const boundaryStart = Math.max(bs, recStartMs ?? bs);
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

  // Prepare items to display.
  // If `search` is provided (non-empty) we should show matches across all days
  // (the parent already filtered by text). For recurring tasks we show only
  // the base/first occurrence (do not expand to multiple daily occurrences).
  const selectedItems: Task[] = [];
  const occurrenceStartMap = new Map<number, number>();
  const isSearching = !!(search && String(search).trim());
  if (isSearching) {
    for (const t of filteredTasks) {
      selectedItems.push(t);
      // Determine a sensible sort key: prefer task.start_at, then recurrence start, then 0
      try {
        const baseStart = t.start_at ? (typeof t.start_at === 'string' ? new Date(t.start_at).getTime() : t.start_at) : undefined;
        if (t.id != null) occurrenceStartMap.set(t.id, baseStart ?? 0);
      } catch {
        if (t.id != null) occurrenceStartMap.set(t.id, 0);
      }
    }
  } else {
    for (const t of filteredTasks) {
      const occ = getOccurrenceForDate(t, selectedDate);
      if (occ) {
        selectedItems.push(t);
        if (t.id != null) occurrenceStartMap.set(t.id, occ.start);
      }
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
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };
  const goNextDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  };
  const onPressToday = () => {
    // Always return to today's date in day mode
    setSelectedDate(new Date());
  };
  const goToday = () => {
    setSelectedDate(new Date());
  };

  // Date display
  const dateLabel = `${selectedDate.getDate().toString().padStart(2, '0')}/${(selectedDate.getMonth()+1).toString().padStart(2, '0')}/${selectedDate.getFullYear()}`;
  const isTodaySelected = isSameDay(selectedDate, new Date());

  // Prepare items and title based on mode
  const listItems = selectedItems;
  const sectionTitle = isSearching ? (t.tasks?.list?.searchResults || 'Search results') : dateLabel;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {!isSearching && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 as any, marginVertical: 8 }}>
          <TouchableOpacity onPress={goPrevDay} style={{ paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.buttonBorder, borderRadius: 8, backgroundColor: colors.buttonBg }}>
            <Text style={{ fontSize: 18, color: colors.text }}>{'<'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowDatePicker(true); }} style={{ paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, backgroundColor: colors.pillBg }}>
            <Text style={{ fontWeight: '600', fontSize: 16, color: colors.text }}>{dateLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goNextDay} style={{ paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.buttonBorder, borderRadius: 8, backgroundColor: colors.buttonBg }}>
            <Text style={{ fontSize: 18, color: colors.text }}>{'>'}</Text>
          </TouchableOpacity>
          <View style={{ position: 'relative', marginHorizontal: 6 }}>
            <TouchableOpacity onPress={onPressToday} style={{ paddingVertical: 6, paddingHorizontal: 16, borderWidth: 1, borderColor: isTodaySelected ? colors.todayBorder : colors.cardBorder, borderRadius: 20, backgroundColor: isTodaySelected ? colors.todayBg : colors.pillBg }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: isTodaySelected ? '#fff' : colors.text }}>{t.tasks?.list?.today}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {!isSearching && showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) {
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
              <Text className="italic" style={{ color: isDark ? '#C6D4E1' : '#6b7280' }}>{t.tasks?.list?.noTasks}</Text>
            </View>
          ) : null
        )}
        renderItem={({ item }) => (
          <TaskItem
            item={item}
            allTasks={filteredTasks} // Use filteredTasks for conflict detection
            reminders={reminders}
            recurrences={recurrences}
            REPEAT_OPTIONS={REPEAT_OPTIONS}
            editTask={editTask}
            openEditModal={openEditModal}
            handleDeleteTask={handleDeleteTask}
            onInlineAlert={onInlineAlert}
            hideDate={isSearching ? false : true}
            allMode={isSearching}
            selectedDate={selectedDate}
          />
        )}
      />
    </View>
  );
}