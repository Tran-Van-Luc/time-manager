import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Switch,
  ActivityIndicator,
  SafeAreaView,
  Platform as RNPlatform,
} from "react-native";
import axios from "axios";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import FilterPicker from "./SelectBox"; 
import CompactSelect from "./CompactSelect";
import SegmentedOptions from "./SegmentedOptions"; 
import FloatingLabelInput from "./FloatingLabelInput";
import ColoredSegmentGroup from "./ColoredSegmentGroup";
import VoiceTaskInput from './VoiceTaskInput';
import { useLanguage } from '../../context/LanguageContext';

import { Dimensions } from 'react-native';

export default function TaskModal({
  visible,
  onClose,
  // Đã loại bỏ nhập từ file: bỏ inputMode & importing
  editId,
  setEditId,
  newTask,
  setNewTask,
  handleAddTask,
  handleEditTask,
  reminder,
  setReminder,
  reminderTime,
  setReminderTime,
  reminderMethod,
  setReminderMethod,
  repeat,
  setRepeat,
  repeatFrequency,
  setRepeatFrequency,
  repeatInterval,
  setRepeatInterval,
  repeatDaysOfWeek,
  setRepeatDaysOfWeek,
  repeatDaysOfMonth,
  setRepeatDaysOfMonth,
  repeatEndDate,
  setRepeatEndDate,
  showStartPicker,
  setShowStartPicker,
  showEndPicker,
  setShowEndPicker,
  showRepeatStartPicker,
  setShowRepeatStartPicker,
  showRepeatEndPicker,
  setShowRepeatEndPicker,
  PRIORITY_OPTIONS,
  REMINDER_OPTIONS,
  REPEAT_OPTIONS,
  Platform = RNPlatform,
  onInlineAlert,
}: any) {
  const { t } = useLanguage();
  // Local iOS picker visibility state (avoid changing parent props)
  const [iosShowStartDate, setIosShowStartDate] = useState(false);
  const [iosShowStartTime, setIosShowStartTime] = useState(false);
  const [iosShowEndTime, setIosShowEndTime] = useState(false);
  const [iosShowRepeatEndDate, setIosShowRepeatEndDate] = useState(false);
  // Yearly: number of occurrences (1-100)
  const [yearlyCount, setYearlyCount] = useState<number | "">("");
  // Track previous repeat frequency to detect transitions (e.g., switching into 'yearly')
  const prevRepeatFrequencyRef = useRef<string | null>(null);
  // Habit options (apply to any recurrence)
  const [habitMergeStreak, setHabitMergeStreak] = useState(false);
  // Auto-complete option: tự động đánh hoàn thành khi hết hạn
  const [habitAutoCompleteExpired, setHabitAutoCompleteExpired] = useState(false);
  // Toggle handlers: allow auto-complete and merge to be independent
  const toggleHabitAuto = (val: boolean) => {
    setHabitAutoCompleteExpired(val);
    // Cập nhật global flag ngay lập tức để tránh bị trễ khi người dùng ấn Lưu ngay sau khi bật/tắt
    try {
      (global as any).__habitFlags = {
        ...( (global as any).__habitFlags || {} ),
        auto: !!val,
        // giữ nguyên merge hiện tại
        merge: !!habitMergeStreak,
      };
    } catch {}
  };
  const toggleHabitMerge = (val: boolean) => {
    setHabitMergeStreak(val);
    // Cập nhật global flag ngay lập tức
    try {
      (global as any).__habitFlags = {
        ...( (global as any).__habitFlags || {} ),
        merge: !!val,
        auto: !!habitAutoCompleteExpired,
      };
    } catch {}
  };
  // Track the original start time to know if user changed it during edit
  const originalStartAtRef = useRef<number | undefined>(undefined);
  

  // Removed 5-minute constraint per request
  // Custom reminder state
  const [customReminderMode, setCustomReminderMode] = useState(false);
  const [customReminderValue, setCustomReminderValue] = useState<string>("");
  const [customReminderUnit, setCustomReminderUnit] = useState<string>("minutes");
  // Lưu metadata để khi mở lại sửa vẫn giữ đơn vị người dùng đã chọn (ví dụ 2 ngày)
  const [savedCustomMeta, setSavedCustomMeta] = useState<null | { unit: string; value: string }>(null);
  const MAX_CUSTOM_MINUTES = 7 * 24 * 60; // 7 days
  const [reminderWarning, setReminderWarning] = useState<string>("");
  // Smooth permission handling for reminder toggle
  const [notificationPermissionChecked, setNotificationPermissionChecked] = useState<boolean>(false);
  const [notificationPermissionGranted, setNotificationPermissionGranted] = useState<boolean>(false);
  const [reminderTogglePending, setReminderTogglePending] = useState<boolean>(false);
  // Bỏ nhập từ file trong modal; chỉ còn thêm thủ công

  const formatLead = (mins: number) => {
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    const parts: string[] = [];
    if (d) parts.push(`${d} ngày`);
    if (h) parts.push(`${h} giờ`);
    if (m) parts.push(`${m} phút`);
    return parts.join(" ") || "0 phút";
  };

  const deriveCustomParts = (totalMinutes: number) => {
    if (totalMinutes % 1440 === 0) {
      return { value: (totalMinutes / 1440).toString(), unit: "days" };
    }
    if (totalMinutes % 60 === 0) {
      return { value: (totalMinutes / 60).toString(), unit: "hours" };
    }
    return { value: totalMinutes.toString(), unit: "minutes" };
  };

  // Normalize end date returned by AI to a local end-of-day timestamp (ms).
  // Handles date-only strings (YYYY-MM-DD), numeric epochs, and ISO datetimes.
  // If AI returns a UTC timestamp like 2025-11-29T23:59:00Z we take the UTC Y/M/D
  // and produce a local Date at 23:59 for that calendar date so the calendar
  // day does not shift when viewed in a different timezone.
  const normalizeAiEndDate = (raw: any): number | null => {
    if (raw == null) return null;
    try {
      const s = String(raw).trim();
      // YYYY-MM-DD (date-only)
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, mo, d] = s.split("-").map(Number);
        return new Date(y, mo - 1, d, 23, 59, 0, 0).getTime();
      }

      // Numeric epoch (ms)
      const ms = Number(s);
      if (!Number.isNaN(ms)) {
        const dt = new Date(ms);
        // Use the UTC calendar date from the timestamp
        const y = dt.getUTCFullYear();
        const mo = dt.getUTCMonth();
        const day = dt.getUTCDate();
        return new Date(y, mo, day, 23, 59, 0, 0).getTime();
      }

      // Fallback: parseable ISO datetime string
      const parsed = Date.parse(s);
      if (!Number.isNaN(parsed)) {
        const dt = new Date(parsed);
        const y = dt.getUTCFullYear();
        const mo = dt.getUTCMonth();
        const day = dt.getUTCDate();
        return new Date(y, mo, day, 23, 59, 0, 0).getTime();
      }
    } catch (e) {
      // ignore and fall through to null
    }
    return null;
  };

  // Handler to receive parsed task payload from AI/voice component
  const handleAIPopulate = (payload: { task?: Record<string, any>; reminder?: any; recurrence?: any }) => {
    if (!payload) return;
    const { task: t, reminder: r, recurrence: rec } = payload;
    try { console.log('[AI->Modal] Incoming task payload:', t); } catch {}
    // habit merge flag may be present on payload or inside task
    const habitFlag = (payload as any).habitMerge ?? t?.habitMerge ?? t?.habit_merge ?? null;
    if (habitFlag !== null && habitFlag !== undefined) {
      try {
        setHabitMergeStreak(Boolean(habitFlag));
      } catch {}
    }
    // auto-complete flag from payload
    const autoFlag = (payload as any).habitAuto ?? t?.habitAuto ?? t?.habit_auto ?? null;
    if (autoFlag !== null && autoFlag !== undefined) {
      try {
        setHabitAutoCompleteExpired(Boolean(autoFlag));
      } catch {}
    }
    // Populate basic fields
    if (t) {
      const nextStart = (t.start_at ?? t.startAt ?? t.start_time) ?? undefined;
      const nextEnd = (t.end_at ?? t.endAt ?? t.end_time) ?? undefined;
      setNewTask((prev: any) => {
        const next = {
          ...prev,
          title: t.title ?? prev.title ?? '',
          description: t.description ?? prev.description ?? prev.description,
          start_at: typeof nextStart === 'number' ? nextStart : prev.start_at,
          end_at: typeof nextEnd === 'number' ? nextEnd : prev.end_at,
          priority: t.priority ?? prev.priority,
          status: t.status ?? prev.status,
        };
        try { console.log('[AI->Modal] After first setNewTask(next):', next); } catch {}
        return next;
      });
      // Ensure AI times win over any concurrent default-set in useEffect
      if (typeof nextStart === 'number' || typeof nextEnd === 'number') {
        setTimeout(() => {
          setNewTask((prev: any) => {
            const next = {
              ...prev,
              start_at: typeof nextStart === 'number' ? nextStart : prev.start_at,
              end_at: typeof nextEnd === 'number' ? nextEnd : prev.end_at,
            };
            try { console.log('[AI->Modal] Reinforced times (timeout 0):', { start_at: next.start_at, end_at: next.end_at }); } catch {}
            return next;
          });
        }, 0);
      }
    }

    // Reminder: only enable if AI explicitly sets enabled true
    if (r) {
      try {
        if (typeof r.enabled === 'boolean') setReminder(!!r.enabled);
        if (r.enabled) {
          const minutes = r.time ?? r.minutes ?? r.minutesBefore ?? r.remind_before ?? null;
          if (minutes != null) setReminderTime(Number(minutes));
          if (r.method) setReminderMethod(String(r.method));
        }
      } catch {}
    }

    // Recurrence: only enable if AI explicitly sets enabled true
    if (rec) {
      try {
        if (typeof rec.enabled === 'boolean') setRepeat(!!rec.enabled);
        if (rec.enabled) {
          if (rec.frequency) setRepeatFrequency(String(rec.frequency));
          if (rec.interval) setRepeatInterval(Number(rec.interval));
          if (rec.daysOfWeek) setRepeatDaysOfWeek(Array.isArray(rec.daysOfWeek) ? rec.daysOfWeek : []);
          if (rec.daysOfMonth) setRepeatDaysOfMonth(Array.isArray(rec.daysOfMonth) ? rec.daysOfMonth : []);
          if (rec.endDate) {
            const normalized = normalizeAiEndDate(rec.endDate);
            if (normalized != null) setRepeatEndDate(normalized);
          }
          if (rec.frequency === 'yearly' && rec.endDate && newTask.start_at) {
            const normalized = normalizeAiEndDate(rec.endDate);
            if (normalized != null) {
              const derived = deriveYearlyCountFromDates(newTask.start_at, normalized);
              if (derived !== null) setYearlyCount(derived);
            }
          }
        }
      } catch {}
    }
  };

  // Observe time changes for debugging
  useEffect(() => {
    try {
      console.log('[Modal] newTask times updated:', {
        start_at: newTask.start_at,
        end_at: newTask.end_at,
        start_local: newTask.start_at ? new Date(newTask.start_at).toString() : null,
        end_local: newTask.end_at ? new Date(newTask.end_at).toString() : null,
      });
    } catch {}
  }, [newTask.start_at, newTask.end_at]);

  // Đồng bộ giá trị custom (nếu người dùng chỉnh)
  useEffect(() => {
    if (!customReminderMode) return;
    const n = parseInt(customReminderValue, 10);
    if (!isNaN(n) && n > 0) {
      let minutes = n;
      if (customReminderUnit === "hours") minutes = n * 60;
      else if (customReminderUnit === "days") minutes = n * 1440;
      if (minutes > MAX_CUSTOM_MINUTES) {
        minutes = MAX_CUSTOM_MINUTES;
        // Điều chỉnh hiển thị phù hợp đơn vị
        if (customReminderUnit === "days") setCustomReminderValue("7");
        else if (customReminderUnit === "hours") setCustomReminderValue("168");
        else setCustomReminderValue("10080");
      }
      setReminderTime(minutes);
    }
  }, [customReminderValue, customReminderUnit, customReminderMode]);

  // Effect: hiện chỉ còn giới hạn tối đa 7 ngày, không hiển thị cảnh báo động
  useEffect(() => {
    if (!reminder) { setReminderWarning(""); return; }
    const startMs = newTask.start_at;
    if (!startMs) { setReminderWarning(""); return; }
    if (reminderTime > MAX_CUSTOM_MINUTES) {
      setReminderTime(MAX_CUSTOM_MINUTES);
    }
    // Không set warning nào nữa
    setReminderWarning("");
  }, [reminderTime, reminder, newTask.start_at, customReminderMode]);

  // Prefetch notification permission status once when modal opens for smoother toggle
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const perms = await Notifications.getPermissionsAsync();
        // On iOS: perms.status; On Android: perms.granted boolean
        const granted = (perms as any).granted === true || (perms as any).status === 'granted' || (perms as any).ios?.status === 3; // AUTHORIZED = 3
        if (mounted) {
          setNotificationPermissionGranted(!!granted);
        }
      } catch {}
      if (mounted) setNotificationPermissionChecked(true);
    })();
    return () => { mounted = false; };
  }, [visible]);

  // If reminder time isn't one of presets, auto-select custom mode and prefill value/unit
  useEffect(() => {
    if (!visible) return;
    if (!reminder) return;
    const presetValues = (REMINDER_OPTIONS || []).map((o: any) => Number(o.value));
    if (!presetValues.includes(Number(reminderTime))) {
      const parts = deriveCustomParts(Number(reminderTime || 0));
      setCustomReminderMode(true);
      setCustomReminderValue(parts.value);
      setCustomReminderUnit(parts.unit);
      setSavedCustomMeta({ unit: parts.unit, value: parts.value });
    }
  }, [visible, reminder, reminderTime]);

  const formatDate = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
  const oneHourFromNow = () => new Date(Date.now() + 60 * 60 * 1000);
  const isSameCalendarDay = (a: Date, b: Date) => (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );

  const getStartDateObj = () =>
    newTask.start_at ? new Date(newTask.start_at) : new Date();
  const getEndDateObj = () =>
    newTask.end_at ? new Date(newTask.end_at) : new Date();
  const combineDateTime = (date: Date, time: Date) =>
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      time.getHours(),
      time.getMinutes(),
      0,
      0
    );

  // Helper: derive yearly count from start/end dates (expects end aligned to start's month/day)
  const deriveYearlyCountFromDates = (
    startMs?: number,
    endMs?: number
  ): number | null => {
    if (!startMs || !endMs) return null;
    const start = new Date(startMs);
    const end = new Date(endMs);
    let years = end.getFullYear() - start.getFullYear() + 1;
    // Clamp to 1..100
    years = Math.max(1, Math.min(100, years));
    return years;
  };

  // Helper: compute the next occurrence after start based on frequency + interval
  const getNextOccurrenceMs = (startMs?: number, freq?: string, interval?: number): number | null => {
    if (!startMs || !freq) return null;
    const intv = Math.max(1, Number(interval) || 1);
    const start = new Date(startMs);
    switch ((freq || "").toString().toLowerCase()) {
      case "yearly": {
        const d = new Date(start);
        d.setFullYear(d.getFullYear() + intv);
        return d.getTime();
      }
      case "monthly": {
        const d = new Date(start);
        d.setMonth(d.getMonth() + intv);
        return d.getTime();
      }
      case "weekly": {
        return startMs + intv * 7 * 24 * 60 * 60 * 1000;
      }
      case "daily":
      case "day":
      default: {
        return startMs + intv * 24 * 60 * 60 * 1000;
      }
    }
  };

  // Helper: next weekly occurrence taking specific daysOfWeek into account
  const getNextWeeklyOccurrenceMsWithDays = (
    startMs: number,
    daysOfWeek: string[],
    interval: number
  ): number | null => {
    if (!startMs || !daysOfWeek || daysOfWeek.length === 0) return null;
    const idxMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const selected = Array.from(new Set(daysOfWeek.map((d) => idxMap[d]).filter((n) => n !== undefined))).sort((a, b) => a - b);
    if (selected.length === 0) return null;
    const intv = Math.max(1, Number(interval) || 1);
    const start = new Date(startMs);
    const startIdx = start.getDay();
    // same-cycle week (weekIndex=0): pick first selected day strictly after start day
    const sameWeek = selected.find((d) => d > startIdx);
    if (sameWeek !== undefined) {
      const deltaDays = sameWeek - startIdx;
      const next = new Date(start);
      next.setDate(start.getDate() + deltaDays);
      return next.getTime();
    }
    // next valid cycle week (weekIndex = interval)
    const minSel = selected[0];
    const deltaDays = intv * 7 + ((minSel - startIdx + 7) % 7);
    const next = new Date(start);
    next.setDate(start.getDate() + deltaDays);
    return next.getTime();
  };

  // Helper: next monthly occurrence taking specific daysOfMonth into account
  const getNextMonthlyOccurrenceMsWithDays = (
    startMs: number,
    daysOfMonth: string[],
    interval: number
  ): number | null => {
    if (!startMs || !daysOfMonth || daysOfMonth.length === 0) return null;
    const dom = Array.from(new Set(
      daysOfMonth.map((d) => Math.max(1, Math.min(31, parseInt(String(d).replace(/[^0-9]/g, ''), 10) || 0)))
    ))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 31)
      .sort((a, b) => a - b);
    if (dom.length === 0) return null;
    const intv = Math.max(1, Number(interval) || 1);
    const start = new Date(startMs);
    const year = start.getFullYear();
    const month = start.getMonth();
    const day = start.getDate();
    const hours = start.getHours();
    const minutes = start.getMinutes();
    // Try same month: pick smallest dom > current day and valid for this month
    const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const thisMonthMax = daysInMonth(year, month);
    const sameMonthCandidate = dom.find((d) => d > day && d <= thisMonthMax);
    if (sameMonthCandidate !== undefined) {
      return new Date(year, month, sameMonthCandidate, hours, minutes, 0, 0).getTime();
    }
    // Move to next allowed month(s) until a valid day exists
    let step = intv;
    for (let tries = 0; tries < 24; tries += 1) {
      const target = new Date(year, month + step, 1, hours, minutes, 0, 0);
      const maxDay = daysInMonth(target.getFullYear(), target.getMonth());
      const cand = dom.find((d) => d <= maxDay);
      if (cand !== undefined) {
        return new Date(target.getFullYear(), target.getMonth(), cand, hours, minutes, 0, 0).getTime();
      }
      step += intv;
    }
    return null;
  };

  // Compute the first TWO weekly occurrences (inclusive of start day) respecting interval
  const getFirstTwoWeeklyOccurrencesMs = (
    startMs: number,
    daysOfWeek: string[],
    interval: number
  ): [number, number] | null => {
    if (!startMs || !daysOfWeek || daysOfWeek.length === 0) return null;
    const idxMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const selected = new Set(
      daysOfWeek
        .map((d) => idxMap[d])
        .filter((n): n is number => typeof n === 'number')
    );
    if (selected.size === 0) return null;
    const intv = Math.max(1, Number(interval) || 1);
    const base = new Date(startMs);
    const h = base.getHours(); const m = base.getMinutes(); const s = base.getSeconds(); const ms = base.getMilliseconds();

    const results: number[] = [];
    // Walk forward day-by-day; accept a day if its week offset from start is a multiple of interval
    for (let dayOffset = 0; dayOffset <= 366 && results.length < 2; dayOffset += 1) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, h, m, s, ms);
      const dow = d.getDay();
      if (!selected.has(dow)) continue;
      const weeksFromStart = Math.floor(dayOffset / 7);
      if (weeksFromStart % intv !== 0) continue;
      results.push(d.getTime());
    }
    return results.length >= 2 ? [results[0], results[1]] : null;
  };

  // Compute the first TWO monthly occurrences (inclusive of start day) respecting interval
  const getFirstTwoMonthlyOccurrencesMs = (
    startMs: number,
    daysOfMonth: string[],
    interval: number
  ): [number, number] | null => {
    if (!startMs || !daysOfMonth || daysOfMonth.length === 0) return null;
    const dom = Array.from(new Set(
      daysOfMonth.map((d) => Math.max(1, Math.min(31, parseInt(String(d).replace(/[^0-9]/g, ''), 10) || 0)))
    )).filter((n) => !isNaN(n) && n >= 1 && n <= 31).sort((a, b) => a - b);
    if (dom.length === 0) return null;
    const intv = Math.max(1, Number(interval) || 1);
    const base = new Date(startMs);
    const y = base.getFullYear(); const mo = base.getMonth(); const d0 = base.getDate();
    const h = base.getHours(); const m = base.getMinutes(); const s = base.getSeconds(); const ms = base.getMilliseconds();
    const daysInMonth = (yy: number, mm: number) => new Date(yy, mm + 1, 0).getDate();
    const make = (yy: number, mm: number, dd: number) => new Date(yy, mm, dd, h, m, s, ms).getTime();
    let occ1: number | null = null;
    if (dom.includes(d0)) {
      occ1 = startMs;
    } else {
      const max = daysInMonth(y, mo);
      const sameMonth = dom.find((d) => d > d0 && d <= max);
      if (sameMonth !== undefined) {
        occ1 = make(y, mo, sameMonth);
      } else {
        let step = intv;
        for (let tries = 0; tries < 24; tries += 1) {
          const dt = new Date(y, mo + step, 1);
          const maxDay = daysInMonth(dt.getFullYear(), dt.getMonth());
          const cand = dom.find((d) => d <= maxDay);
          if (cand !== undefined) { occ1 = make(dt.getFullYear(), dt.getMonth(), cand); break; }
          step += intv;
        }
      }
    }
    if (occ1 == null) return null;
    const d1 = new Date(occ1); const y1 = d1.getFullYear(); const m1 = d1.getMonth(); const day1 = d1.getDate();
    const max2 = daysInMonth(y1, m1);
    const sameMonthNext = dom.find((d) => d > day1 && d <= max2);
    if (sameMonthNext !== undefined) return [occ1, make(y1, m1, sameMonthNext)];
    let step2 = intv;
    for (let tries = 0; tries < 24; tries += 1) {
      const dt = new Date(y1, m1 + step2, 1);
      const maxDay = daysInMonth(dt.getFullYear(), dt.getMonth());
      const cand = dom.find((d) => d <= maxDay);
      if (cand !== undefined) return [occ1, make(dt.getFullYear(), dt.getMonth(), cand)];
      step2 += intv;
    }
    return null;
  };

  

  // Keep repeatEndDate in sync when start_at or yearlyCount changes in yearly mode
  useEffect(() => {
    if (!repeat || repeatFrequency !== "yearly") return;
    if (typeof yearlyCount === "number" && yearlyCount >= 1) {
      const base = newTask.start_at ? new Date(newTask.start_at) : new Date();
      const end = new Date(base);
      end.setFullYear(end.getFullYear() + (yearlyCount - 1));
      setRepeatEndDate(end.getTime());
    }
  }, [newTask.start_at, yearlyCount, repeat, repeatFrequency]);

  // NOTE: habit flags (auto / merge) are controlled only by their switches now.
  // Keep global transient flags in sync so add/edit handlers see latest values.
  useEffect(() => {
    try {
      (global as any).__habitFlags = {
        ...( (global as any).__habitFlags || {} ),
        merge: !!habitMergeStreak,
        auto: !!habitAutoCompleteExpired,
      };
    } catch {}
  }, [habitMergeStreak, habitAutoCompleteExpired]);

  // Helper: đồng bộ ngay trước khi gọi handleAddTask/handleEditTask để chắc chắn không bị race
  const syncHabitFlagsNow = () => {
    try {
      (global as any).__habitFlags = {
        merge: !!habitMergeStreak,
        auto: !!habitAutoCompleteExpired,
      };
    } catch {}
  };

  // When modal becomes visible, hydrate recurrence type from global (set by parent)
  useEffect(() => {
    if (visible) {
      // Only hydrate saved habit flags when editing an existing task.
      // For "add new" modal opens (editId === null) we want defaults to be OFF.
      if (editId !== null) {
        const flags = (global as any).__habitFlags as { merge?: boolean; auto?: boolean } | undefined;
        if (flags) {
          setHabitMergeStreak(!!flags.merge);
          setHabitAutoCompleteExpired(!!flags.auto);
        }
      } else {
        // Ensure defaults for a fresh "Add" modal open
        setHabitMergeStreak(false);
        setHabitAutoCompleteExpired(false);
      }
      // Capture current frequency on modal open to detect transitions later
      prevRepeatFrequencyRef.current = repeatFrequency;
      // If editing and the repeat end date is the same calendar day as the
      // start date, treat this as not repeating in the UI (hide/turn off Repeat).
      // This makes single-day stored recurrences behave like non-recurring tasks
      // from the modal perspective.
      try {
        if (editId !== null && repeatEndDate && newTask.start_at) {
          const s = new Date(newTask.start_at);
          const e = new Date(repeatEndDate);
          if (isSameCalendarDay(s, e)) {
            // Force Repeat off in the modal UI
            setRepeat(false);
            // Clear stale same-day end date to avoid misleading validations later
            try { setRepeatEndDate(undefined); } catch {}
          }
        }
      } catch {}
      // Capture original start when opening in edit mode
      if (editId !== null) {
        originalStartAtRef.current = newTask.start_at;
      }
      // If editing an existing yearly recurrence, hydrate yearlyCount from existing end date
      if (editId !== null && repeat && repeatFrequency === "yearly") {
        if (yearlyCount === "") {
          const derived = deriveYearlyCountFromDates(newTask.start_at, repeatEndDate);
          if (derived !== null) setYearlyCount(derived);
        }
      }
      // Initialize custom reminder fields on modal open to avoid leaking state from previous opens
      try {
        const presetValues = (REMINDER_OPTIONS || []).map((o: any) => Number(o.value));
        if (reminder && !presetValues.includes(Number(reminderTime))) {
          const parts = deriveCustomParts(Number(reminderTime || 0));
          setCustomReminderMode(true);
          setCustomReminderValue(parts.value);
          setCustomReminderUnit(parts.unit);
          setSavedCustomMeta({ unit: parts.unit, value: parts.value });
        } else {
          // Ensure custom mode is off for modal open when reminder is preset or disabled
          setCustomReminderMode(false);
          // Reset saved meta when opening a fresh modal so it doesn't reuse previous task's meta
          setSavedCustomMeta(null);
          if (reminder && presetValues.includes(Number(reminderTime))) {
            const parts = deriveCustomParts(Number(reminderTime || 0));
            setCustomReminderValue(parts.value);
            setCustomReminderUnit(parts.unit);
          } else {
            setCustomReminderValue("");
            setCustomReminderUnit("minutes");
          }
        }
      } catch {}
    }
    else {
      // When modal closes, reset transient custom reminder edit state to avoid leaking to next open
      try {
        setCustomReminderMode(false);
        setCustomReminderValue("");
        setCustomReminderUnit("minutes");
        setSavedCustomMeta(null);
      } catch {}
    }
  }, [visible]);

  // Reset original reference when closing modal or switching out of edit mode
  useEffect(() => {
    if (!visible || editId === null) {
      originalStartAtRef.current = undefined;
    }
  }, [visible, editId]);

  // When switching frequency inside the modal:
  // - yearly: default count to 1 (if switching into yearly), or hydrate from dates when editing
  // - weekly/monthly: on first switch, default-select based on start date if no selections yet
  useEffect(() => {
    if (!visible) return;
    if (!repeat) return;
    // Only handle when frequency actually changed
    const prev = prevRepeatFrequencyRef.current;
    if (repeatFrequency === "yearly") {
      if (prev && prev !== "yearly") {
        // Switched from another frequency to yearly -> default to 1 and sync end date to start date
        const base = newTask.start_at ? new Date(newTask.start_at) : new Date();
        setYearlyCount(2);
        setRepeatEndDate(base.getTime());
      } else {
        // Already yearly (e.g., editing existing) -> hydrate once if empty
        if (yearlyCount === "") {
          const derived = deriveYearlyCountFromDates(newTask.start_at, repeatEndDate);
          if (derived !== null) setYearlyCount(derived);
        }
      }
    } else if (repeatFrequency === "weekly") {
      if (prev && prev !== "weekly") {
        // Switching into weekly: default a single day based on start date if empty
        if (!repeatDaysOfWeek || repeatDaysOfWeek.length === 0) {
          const start = getStartDateObj();
          const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][start.getDay()];
          setRepeatDaysOfWeek([dow]);
        }
      }
    } else if (repeatFrequency === "monthly") {
      if (prev && prev !== "monthly") {
        // Switching into monthly: default a single day based on start date if empty
        if (!repeatDaysOfMonth || repeatDaysOfMonth.length === 0) {
          const start = getStartDateObj();
          setRepeatDaysOfMonth([String(start.getDate())]);
        }
      }
    }
    // Update prev reference
    prevRepeatFrequencyRef.current = repeatFrequency;
  }, [repeatFrequency, repeat, visible]);

  // When user selects weekly/monthly repeat, default a single selection based on start date
  useEffect(() => {
    if (!visible) return;
    if (!repeat) return;
    // Only auto-pick for new tasks to avoid overriding edits
    if (editId !== null) return;
    const start = getStartDateObj();
    if (repeatFrequency === "weekly") {
      if (!repeatDaysOfWeek || repeatDaysOfWeek.length === 0) {
        const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][start.getDay()];
        setRepeatDaysOfWeek([dow]);
      }
    } else if (repeatFrequency === "monthly") {
      if (!repeatDaysOfMonth || repeatDaysOfMonth.length === 0) {
        setRepeatDaysOfMonth([String(start.getDate())]);
      }
    }
  }, [visible, repeat, repeatFrequency, newTask.start_at]);

  // Initialize defaults when opening modal for creating a new task
  useEffect(() => {
    if (!visible) return;
    if (editId !== null) return; // don't override when editing
    const now = new Date();
    // Default start: now + 1h05m
    const defaultStart = new Date(now.getTime() + (120 * 60 * 1000));
    // Always set start_at when not set
    let startMs = newTask.start_at ?? defaultStart.getTime();
    let startDate = new Date(startMs);
    // Default end_at to end of day of the start date if not set
    const defaultEnd = endOfDay(startDate).getTime();
    setNewTask((prev: any) => ({
      ...prev,
      start_at: prev.start_at ?? startMs,
      end_at: prev.end_at ?? defaultEnd,
    }));
  }, [visible]);

  // Wrapper to enforce start time at least 1 hour from now when adding
  const handleAddWithConstraint = () => {
    // đảm bảo flag đã đồng bộ trước khi lưu
    syncHabitFlagsNow();
    const nowPlus1h = oneHourFromNow().getTime();
    const startMs = newTask.start_at ?? Date.now();
    if (startMs < nowPlus1h) {
      onInlineAlert?.({
        tone: 'warning',
        title: t.tasks?.modal.invalidStartTitle!,
        message: t.tasks?.modal.invalidStartMessage!
      });
      return;
    }
    // If repeating, validate selections and time windows
    if (repeat) {
      // Weekly/monthly must have at least one selection
      if (repeatFrequency === "weekly") {
        if (!repeatDaysOfWeek || repeatDaysOfWeek.length === 0) {
          onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.missingWeeklyDaysTitle!, message: t.tasks?.modal.missingWeeklyDaysMessage! });
          return;
        }
      }
      if (repeatFrequency === "monthly") {
        if (!repeatDaysOfMonth || repeatDaysOfMonth.length === 0) {
          onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.missingMonthlyDaysTitle!, message: t.tasks?.modal.missingMonthlyDaysMessage! });
          return;
        }
      }
      // Block when start is after repeat end (inclusive end-of-day)
      if (repeatEndDate) {
        const endLimit = endOfDay(new Date(repeatEndDate)).getTime();
        if (startMs > endLimit) {
          onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.startAfterEndTitle!, message: t.tasks?.modal.startAfterEndMessage! });
          return;
        }
      }
      // Ensure the recurrence yields at least 2 occurrences.
      // Yearly: require yearlyCount >= 2. Others: require repeatEndDate to be at or after the next occurrence.
      if (repeatFrequency === 'yearly') {
        if (yearlyCount === '' || typeof yearlyCount !== 'number' || yearlyCount < 2) {
          onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.yearlyCountInvalidTitle!, message: t.tasks?.modal.yearlyCountInvalidMessage! });
          return;
        }
      } else {
        // For non-yearly frequencies, require end date (treat same-day as unset)
        const endDateUnsetOrSameDay = !repeatEndDate || (newTask.start_at && repeatEndDate && isSameCalendarDay(new Date(repeatEndDate), new Date(newTask.start_at)));
        if (endDateUnsetOrSameDay) {
          onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.missingRepeatEndTitle!, message: t.tasks?.modal.missingRepeatEndMessage! });
          return;
        }
        // Enforce "at least 2 occurrences". For weekly/monthly use the actual next date from selected days.
        const needsMinTwo = (() => {
          if (repeatFrequency === 'daily') return true;
          if (repeatFrequency === 'weekly') return (repeatDaysOfWeek?.length || 0) >= 1;
          if (repeatFrequency === 'monthly') return (repeatDaysOfMonth?.length || 0) >= 1;
          return false;
        })();
        if (needsMinTwo) {
          let secondMs: number | null = null;
          if (repeatFrequency === 'daily') {
            secondMs = getNextOccurrenceMs(startMs, 'daily', repeatInterval);
          } else if (repeatFrequency === 'weekly') {
            const pair = getFirstTwoWeeklyOccurrencesMs(startMs, repeatDaysOfWeek || [], repeatInterval);
            secondMs = pair ? pair[1] : null;
          } else if (repeatFrequency === 'monthly') {
            const pair = getFirstTwoMonthlyOccurrencesMs(startMs, repeatDaysOfMonth || [], repeatInterval);
            secondMs = pair ? pair[1] : null;
          }
          const endLimit = endOfDay(new Date(repeatEndDate)).getTime();
          if (!secondMs || !endLimit || endLimit < secondMs) {
            onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.endTooEarlyTitle!, message: t.tasks?.modal.endTooEarlyMessage! });
            return;
          }
        }
      }
    }
    // Optional: ensure end_at exists and is after start
    if (!newTask.end_at || newTask.end_at <= startMs) {
      const eod = endOfDay(new Date(startMs));
      setNewTask((prev: any) => ({ ...prev, end_at: eod.getTime() }));
      // Call after state update in next tick to avoid stale state
      setTimeout(() => handleAddTask(), 0);
      return;
    }
    handleAddTask();
  };

  // Wrapper to enforce constraints when editing: only apply 1-hour rule if start time was changed
  const handleEditWithConstraint = () => {
    // đảm bảo flag đã đồng bộ trước khi lưu
    syncHabitFlagsNow();
    const nowPlus1h = oneHourFromNow().getTime();
    const startMs = newTask.start_at ?? Date.now();
    const originalStart = originalStartAtRef.current;
    const startChanged = originalStart !== undefined && startMs !== originalStart;
    if (startChanged && startMs < nowPlus1h) {
      onInlineAlert?.({
        tone: 'warning',
        title: t.tasks?.modal.invalidStartTitle!,
        message: t.tasks?.modal.invalidStartMessage!
      });
      return;
    }
    // If repeating, validate selections and time windows
    if (repeat) {
      if (repeatFrequency === "weekly") {
        if (!repeatDaysOfWeek || repeatDaysOfWeek.length === 0) {
          onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.missingWeeklyDaysTitle!, message: t.tasks?.modal.missingWeeklyDaysMessage! });
          return;
        }
      }
      if (repeatFrequency === "monthly") {
        if (!repeatDaysOfMonth || repeatDaysOfMonth.length === 0) {
          onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.missingMonthlyDaysTitle!, message: t.tasks?.modal.missingMonthlyDaysMessage! });
          return;
        }
      }
      if (repeatEndDate) {
        const endLimit = endOfDay(new Date(repeatEndDate)).getTime();
        if (startMs > endLimit) {
          onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.startAfterEndTitle!, message: t.tasks?.modal.startAfterEndMessage! });
          return;
        }
      }
      // Ensure the recurrence yields at least 2 occurrences.
      if (repeatFrequency === 'yearly') {
        if (yearlyCount === '' || typeof yearlyCount !== 'number' || yearlyCount < 2) {
          onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.yearlyCountInvalidTitle!, message: t.tasks?.modal.yearlyCountInvalidMessage! });
          return;
        }
      } else {
        const endDateUnsetOrSameDay = !repeatEndDate || (newTask.start_at && repeatEndDate && isSameCalendarDay(new Date(repeatEndDate), new Date(newTask.start_at)));
        if (endDateUnsetOrSameDay) {
          onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.missingRepeatEndTitle!, message: t.tasks?.modal.missingRepeatEndMessage! });
          return;
        }
        const needsMinTwo = (() => {
          if (repeatFrequency === 'daily') return true;
          if (repeatFrequency === 'weekly') return (repeatDaysOfWeek?.length || 0) >= 1;
          if (repeatFrequency === 'monthly') return (repeatDaysOfMonth?.length || 0) >= 1;
          return false;
        })();
        if (needsMinTwo) {
          let secondMs: number | null = null;
          if (repeatFrequency === 'daily') {
            secondMs = getNextOccurrenceMs(startMs, 'daily', repeatInterval);
          } else if (repeatFrequency === 'weekly') {
            const pair = getFirstTwoWeeklyOccurrencesMs(startMs, repeatDaysOfWeek || [], repeatInterval);
            secondMs = pair ? pair[1] : null;
          } else if (repeatFrequency === 'monthly') {
            const pair = getFirstTwoMonthlyOccurrencesMs(startMs, repeatDaysOfMonth || [], repeatInterval);
            secondMs = pair ? pair[1] : null;
          }
          const endLimit = endOfDay(new Date(repeatEndDate)).getTime();
          if (!secondMs || !endLimit || endLimit < secondMs) {
            onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.endTooEarlyTitle!, message: t.tasks?.modal.endTooEarlyMessage! });
            return;
          }
        }
      }
    }
    // Ensure end_at exists and is after start; if not, default to end of that day and save in next tick
    if (!newTask.end_at || newTask.end_at <= startMs) {
      const eod = endOfDay(new Date(startMs));
      setNewTask((prev: any) => ({ ...prev, end_at: eod.getTime() }));
      setTimeout(() => handleEditTask(), 0);
      return;
    }
    handleEditTask();
  };

  const updateYearlyCount = (text: string) => {
    const nRaw = parseInt(text.replace(/[^0-9]/g, ""), 10);
    if (isNaN(nRaw)) {
      setYearlyCount("");
      return;
    }
    const n = Math.max(1, Math.min(100, nRaw));
    setYearlyCount(n);
    const base = newTask.start_at ? new Date(newTask.start_at) : new Date();
    const end = new Date(base);
    // If count = 1, end date = base date (first occurrence)
    end.setFullYear(end.getFullYear() + (n - 1));
    setRepeatEndDate(end.getTime());
  };

  const { height: windowHeight } = Dimensions.get('window');

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <SafeAreaView className="flex-1 bg-black/40 justify-center items-center">
        <View className="bg-white w-11/12 p-4 rounded-lg" style={{ maxHeight: Math.floor(windowHeight * 0.9) }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
            <>
                <Text className="text-lg font-bold mb-3">
                  {editId === null ? t.tasks?.modal.addTitle : t.tasks?.modal.editTitle}
                </Text>
                {/* AI / Voice quick add for tasks */}
                <VoiceTaskInput onParsed={handleAIPopulate} />
                {/* Chỉ hiển thị form thêm/sửa thủ công */}
                  <>
                <FloatingLabelInput
                  label={t.tasks?.modal.titleLabel}
                  required
                  value={newTask.title}
                  onChangeText={(t) => setNewTask((prev: any) => ({ ...prev, title: t }))}
                  autoCapitalize="sentences"
                  returnKeyType="next"
                />
                <FloatingLabelInput
                  label={t.tasks?.modal.descriptionLabel}
                  value={newTask.description}
                  onChangeText={(t) => setNewTask((prev: any) => ({ ...prev, description: t }))}
                  multiline
                />
                {/* Ngày bắt đầu */}
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === "android") {
                      const currentStart = getStartDateObj();
                      DateTimePickerAndroid.open({
                        value: currentStart,
                        minimumDate: new Date(),
                        mode: "date",
                        is24Hour: true,
                        onChange: (event, pickedDate) => {
                          if (event.type === "set" && pickedDate) {
                            const preservedTime = getStartDateObj();
                            let combined = combineDateTime(pickedDate, preservedTime);
                            // When changing start date (add or edit), enforce at least 1 hour from now
                            const minStart = oneHourFromNow();
                            if (combined.getTime() < minStart.getTime()) {
                              const isSameDay =
                                pickedDate.getFullYear() === minStart.getFullYear() &&
                                pickedDate.getMonth() === minStart.getMonth() &&
                                pickedDate.getDate() === minStart.getDate();
                              if (isSameDay) {
                                combined = minStart;
                              }
                            }
                            // If repeating, start must not be after repeat end date (inclusive end-of-day)
                            if (repeat && repeatEndDate) {
                              const endLimit = endOfDay(new Date(repeatEndDate)).getTime();
                              if (combined.getTime() > endLimit) {
                                onInlineAlert?.({ tone: 'warning', title: t.tasks?.modal.startAfterEndTitle!, message: t.tasks?.modal.startAfterEndMessage! });
                                return;
                              }
                            }
                            setNewTask((prev: any) => ({
                              ...prev,
                              start_at: combined.getTime(),
                              // If end becomes invalid (<= new start), set it to end of the new start day instead of clearing
                              end_at:
                                prev.end_at && prev.end_at <= combined.getTime()
                                  ? endOfDay(combined).getTime()
                                  : prev.end_at,
                            }));
                          }
                        },
                      });
                    } else {
                      setIosShowStartDate(true);
                    }
                  }}
                  className="border p-2 rounded mb-2 bg-gray-50 flex-row items-center justify-between"
                >
                  <Text>
                    {t.tasks?.modal.startDateLabel} : {newTask.start_at ? formatDate(new Date(newTask.start_at)) : "--"}
                  </Text>
                </TouchableOpacity>
                {Platform.OS === "ios" && iosShowStartDate && (
                  <DateTimePicker
                    value={getStartDateObj()}
                    minimumDate={new Date()}
                    mode="date"
                    display="inline"
                    onChange={(event, pickedDate) => {
                      setIosShowStartDate(false);
                      if (event.type === "set" && pickedDate) {
                        const preservedTime = getStartDateObj();
                        let combined = combineDateTime(pickedDate, preservedTime);
                        // When changing start date (add or edit), enforce at least 1 hour from now
                        const minStart = oneHourFromNow();
                        if (combined.getTime() < minStart.getTime()) {
                          const isSameDay =
                            pickedDate.getFullYear() === minStart.getFullYear() &&
                            pickedDate.getMonth() === minStart.getMonth() &&
                            pickedDate.getDate() === minStart.getDate();
                          if (isSameDay) {
                            combined = minStart;
                          }
                        }
                        // If repeating, start must not be after repeat end date (inclusive end-of-day)
                        if (repeat && repeatEndDate) {
                          const endLimit = endOfDay(new Date(repeatEndDate)).getTime();
                          if (combined.getTime() > endLimit) {
                            onInlineAlert?.({ tone: 'warning', title: 'Thời gian không hợp lệ', message: 'Ngày bắt đầu không thể sau ngày kết thúc lặp!' });
                            return;
                          }
                        }
                        setNewTask((prev: any) => ({
                          ...prev,
                            start_at: combined.getTime(),
                            end_at:
                              prev.end_at && prev.end_at <= combined.getTime()
                                ? endOfDay(combined).getTime()
                                : prev.end_at,
                        }));
                      }
                    }}
                  />
                )}

                {/* Giờ bắt đầu */}
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === "android") {
                      const currentStart = getStartDateObj();
                      DateTimePickerAndroid.open({
                        value: currentStart,
                        mode: "time",
                        is24Hour: true,
                        onChange: (event, pickedTime) => {
                          if (event.type === "set" && pickedTime) {
                            const combined = combineDateTime(currentStart, pickedTime);
                            const minStart = oneHourFromNow();
                            // Disallow choosing a start earlier than minStart
                            if (combined.getTime() < minStart.getTime()) {
                              onInlineAlert?.({ tone:'warning', title: t.tasks?.modal.invalidStartTitle!, message: t.tasks?.modal.invalidStartMessage! });
                              return;
                            }
                            // If repeating, start must not be after repeat end date (inclusive end-of-day)
                            if (repeat && repeatEndDate) {
                              const endLimit = endOfDay(new Date(repeatEndDate)).getTime();
                              if (combined.getTime() > endLimit) {
                                onInlineAlert?.({ tone: 'warning', title: 'Thời gian không hợp lệ', message: 'Ngày bắt đầu không thể sau ngày kết thúc lặp!' });
                                return;
                              }
                            }
                            setNewTask((prev: any) => ({
                              ...prev,
                                start_at: combined.getTime(),
                                end_at:
                                  prev.end_at && prev.end_at <= combined.getTime()
                                    ? endOfDay(combined).getTime()
                                    : prev.end_at,
                            }));
                          }
                        },
                      });
                    } else {
                      setIosShowStartTime(true);
                    }
                  }}
                  className="border p-2 rounded mb-2 bg-gray-50 flex-row items-center justify-between"
                >
                  <Text>{t.tasks?.modal.startTimeLabel} : {newTask.start_at ? formatTime(new Date(newTask.start_at)) : "--"}</Text>
                </TouchableOpacity>
                {Platform.OS === "ios" && iosShowStartTime && (
                  <DateTimePicker
                    value={getStartDateObj()}
                    mode="time"
                    display="inline"
                    onChange={(event, pickedTime) => {
                      setIosShowStartTime(false);
                      if (event.type === "set" && pickedTime) {
                        const combined = combineDateTime(getStartDateObj(), pickedTime);
                        const minStart = oneHourFromNow();
                        if (combined.getTime() < minStart.getTime()) {
                          onInlineAlert?.({ tone:'warning', title:'Thời gian không hợp lệ', message: 'Vui lòng đặt giờ bắt đầu muộn hơn hiện tại ít nhất 1 giờ' });
                          return;
                        }
                        // If repeating, start must not be after repeat end date (inclusive end-of-day)
                        if (repeat && repeatEndDate) {
                          const endLimit = endOfDay(new Date(repeatEndDate)).getTime();
                          if (combined.getTime() > endLimit) {
                            onInlineAlert?.({ tone: 'warning', title: 'Thời gian không hợp lệ', message: 'Ngày bắt đầu không thể sau ngày kết thúc lặp!' });
                            return;
                          }
                        }
                        setNewTask((prev: any) => ({
                            ...prev,
                            start_at: combined.getTime(),
                            end_at:
                              prev.end_at && prev.end_at <= combined.getTime()
                                ? endOfDay(combined).getTime()
                                : prev.end_at,
                        }));
                      }
                    }}
                  />
                )}

                {/* Giờ kết thúc (cùng ngày với ngày bắt đầu) */}
                <TouchableOpacity
                  onPress={() => {
                    const startDate = getStartDateObj();
                    if (Platform.OS === "android") {
                      const defaultEnd = newTask.end_at
                        ? new Date(newTask.end_at)
                        : new Date(startDate.getTime() + 60 * 60 * 1000);
                      DateTimePickerAndroid.open({
                        value: defaultEnd,
                        mode: "time",
                        is24Hour: true,
                        onChange: (event, pickedTime) => {
                          if (event.type === "set" && pickedTime) {
                            const combined = combineDateTime(startDate, pickedTime);
                            const startMs = newTask.start_at || startDate.getTime();
                            if (combined.getTime() <= startMs) {
                              onInlineAlert?.({ tone:'warning', title:'Thời gian không hợp lệ', message:'Giờ kết thúc phải sau giờ bắt đầu!' });
                              return;
                            }
                            setNewTask((prev: any) => ({
                              ...prev,
                              end_at: combined.getTime(),
                            }));
                          }
                        },
                      });
                    } else {
                      setIosShowEndTime(true);
                    }
                  }}
                  className="border p-2 rounded mb-2 bg-gray-50"
                >
                  <Text>
                    {t.tasks?.modal.endTimeLabel} : {newTask.end_at ? formatTime(getEndDateObj()) : "--"}
                  </Text>
                </TouchableOpacity>
                {Platform.OS === "ios" && iosShowEndTime && (
                  <DateTimePicker
                    value={newTask.end_at ? getEndDateObj() : new Date(getStartDateObj().getTime() + 60 * 60 * 1000)}
                    mode="time"
                    display="inline"
                    onChange={(event, pickedTime) => {
                      setIosShowEndTime(false);
                      if (event.type === "set" && pickedTime) {
                        const combined = combineDateTime(getStartDateObj(), pickedTime);
                        const startMs = newTask.start_at || getStartDateObj().getTime();
                        if (combined.getTime() <= startMs) {
                          onInlineAlert?.({ tone:'warning', title: t.tasks?.modal.invalidTimeTitle!, message: t.tasks?.modal.invalidTimeMessageEndAfterStart! });
                          return;
                        }
                        setNewTask((prev: any) => ({
                          ...prev,
                          end_at: combined.getTime(),
                        }));
                      }
                    }}
                  />
                )}

                {/* Mức độ */}
                <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                  <Text className="ml-1 mt-0.5 mb-2 font-medium">{t.tasks?.modal.priorityLabel}</Text>
                  <View className="flex-row flex-wrap">
                    {PRIORITY_OPTIONS.map((o: any) => {
                      const val = o.value;
                      const active = newTask.priority === val;
                      // Base palette mapping
                      let palette = {
                        idleBg: 'bg-green-100', idleText: 'text-green-600', idleBorder: 'border-green-600', activeBg: 'bg-green-600', activeText: 'text-white', activeBorder: 'border-green-600'
                      };
                      if (val === 'medium') {
                        palette = { idleBg: 'bg-yellow-100', idleText: 'text-yellow-600', idleBorder: 'border-yellow-600', activeBg: 'bg-yellow-500', activeText: 'text-white', activeBorder: 'border-yellow-600' };
                      } else if (val === 'high') {
                        palette = { idleBg: 'bg-red-100', idleText: 'text-red-600', idleBorder: 'border-red-600', activeBg: 'bg-red-600', activeText: 'text-white', activeBorder: 'border-red-600' };
                      }
                      return (
                        <TouchableOpacity
                          key={val}
                          onPress={() => setNewTask((prev: any) => ({ ...prev, priority: val }))}
                          activeOpacity={0.75}
                          className={`px-3 py-1.5 rounded-full mr-2 mb-2 border ${active ? `${palette.activeBg} ${palette.activeBorder}` : `${palette.idleBg} ${palette.idleBorder}`}`}
                        >
                          <Text className={`text-xs font-medium ${active ? palette.activeText : palette.idleText}`}>
                            {o.label.replace('Mức độ ', '')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Nhắc nhở */}
                <View className="flex-row items-center mb-2">
                  <Switch
                    value={reminder}
                    disabled={reminderTogglePending}
                    onValueChange={async (v) => {
                      if (!v) {
                        // Turning off is immediate
                        setReminder(false);
                        return;
                      }
                      // Turning ON
                      if (notificationPermissionGranted) {
                        // Permission already granted -> instant
                        setReminder(true);
                        return;
                      }
                      // Optimistic ON while requesting permission
                      setReminder(true);
                      setReminderTogglePending(true);
                      try {
                        const { ensureNotificationPermission } = await import('../../utils/notificationScheduler');
                        const ok = await ensureNotificationPermission();
                        if (!ok) {
                          // Revert if denied
                          setReminder(false);
                          onInlineAlert?.({
                            tone: 'warning',
                            title: t.tasks?.modal.needNotificationPermissionTitle!,
                            message: t.tasks?.modal.needNotificationPermissionMsg!
                          });
                        } else {
                          setNotificationPermissionGranted(true);
                        }
                      } catch (e) {
                        // In case of error, keep it ON (best-effort) but mark permission as unknown
                      } finally {
                        setReminderTogglePending(false);
                      }
                    }}
                  />
                  <Text className="ml-2">{t.tasks?.modal.reminderToggle}</Text>
                  {reminderTogglePending ? (
                    <ActivityIndicator size="small" color="#1d4ed8" style={{ marginLeft: 8 }} />
                  ) : null}
                </View>
                {reminder ? (
                  <>
                    <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                      <Text className="ml-1 mt-0.5 mb-1 font-medium">
                        {t.tasks?.modal.reminderLeadLabel}
                      </Text>
                      <ColoredSegmentGroup
                        value={customReminderMode ? "__custom__" : reminderTime.toString()}
                        size="sm"
                        color="blue"
                        onChange={(v: string) => {
                          if (v === "__custom__") {
                            const reminderValues = REMINDER_OPTIONS.map((o: any) => Number(o.value));
                            if (reminderValues.includes(reminderTime)) {
                              const { value, unit } = deriveCustomParts(reminderTime || 10);
                              setCustomReminderValue(value);
                              setCustomReminderUnit(unit);
                              setSavedCustomMeta({ unit, value });
                            } else if (savedCustomMeta) {
                              setCustomReminderValue(savedCustomMeta.value);
                              setCustomReminderUnit(savedCustomMeta.unit);
                            }
                            setCustomReminderMode(true);
                          } else {
                            setCustomReminderMode(false);
                            setReminderTime(Number(v));
                            setSavedCustomMeta(null);
                          }
                        }}
                        options={[
                          ...REMINDER_OPTIONS.map((o: any) => ({ label: o.label, value: o.value.toString() })),
                          { label: t.tasks?.modal.reminderCustomLabel || 'Tùy chỉnh', value: '__custom__' }
                        ]}
                      />
                      {customReminderMode && (
                        <View className="mt-2 border border-gray-300 rounded bg-white p-2">
                          <Text className="text-xs text-gray-600 mb-1">
                            {t.tasks?.modal.reminderCustomHint}
                          </Text>
                          <View className="flex-row items-center">
                            <TextInput
                              className="border rounded px-2 py-1 flex-1 mr-2"
                              placeholder="Số"
                              keyboardType="number-pad"
                              value={customReminderValue}
                              onChangeText={(t) => {
                                const digits = t.replace(/[^0-9]/g, "");
                                if (!digits) {
                                  setCustomReminderValue("");
                                  return;
                                }
                                let n = parseInt(digits, 10);
                                if (isNaN(n) || n <= 0) {
                                  setCustomReminderValue("");
                                  return;
                                }
                                // Determine max per unit
                                let maxPerUnit = 10080; // minutes unit
                                if (customReminderUnit === "hours") maxPerUnit = 168; // 7*24
                                else if (customReminderUnit === "days") maxPerUnit = 7;
                                if (n > maxPerUnit) {
                                  n = maxPerUnit;
                                }
                                setCustomReminderValue(n.toString());
                                // Cập nhật metadata khi người dùng thay đổi số
                                setSavedCustomMeta({ unit: customReminderUnit, value: n.toString() });
                              }}
                            />
                            <CompactSelect
                              value={customReminderUnit}
                              onChange={(u: any) => {
                                setCustomReminderUnit(u);
                                if (customReminderValue) {
                                  setSavedCustomMeta({ unit: u, value: customReminderValue });
                                }
                              }}
                              options={[
                                { label: t.tasks?.modal.minutes || "Phút", value: "minutes" },
                                { label: t.tasks?.modal.hours || "Giờ", value: "hours" },
                                { label: t.tasks?.modal.days || "Ngày", value: "days" },
                              ]}
                              fontSizeClassName="text-sm"
                            />
                          </View>
                          <Text className="text-[10px] text-gray-400 mt-1">{t.tasks?.modal.reminderCustomLimit}</Text>
                          {newTask.start_at && reminderWarning ? (
                            <Text className="text-[10px] mt-1 text-blue-500">{reminderWarning}</Text>
                          ) : null}
                        </View>
                      )}
                    </View>
                    {!customReminderMode && reminderWarning ? (
                      <Text className="text-[10px] -mt-1 mb-2 ml-1 text-blue-500">{reminderWarning}</Text>
                    ) : null}

                    <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                      <Text className="ml-1 mt-0.5 mb-1 font-medium">
                        {t.tasks?.modal.reminderMethodLabel}
                      </Text>
                      <ColoredSegmentGroup
                        value={reminderMethod}
                        onChange={(v: string) => setReminderMethod(v)}
                        size="sm"
                        color="blue"
                        options={[
                          { label: t.tasks?.modal.methodNotification || 'Thông báo', value: 'notification' },
                          { label: t.tasks?.modal.methodAlarm || 'Chuông báo', value: 'alarm' }
                        ]}
                      />
                    </View>
                  </>
                ) : null}
                {/* Lặp lại */}
                <View className="flex-row items-center mb-2">
                  <Switch
                    value={repeat}
                    onValueChange={(v) => {
                      // propagate repeat state to parent
                      try { setRepeat(v); } catch {}
                      // If user turns repeat OFF, also disable merge (gộp)
                      if (!v) {
                        try {
                          setHabitMergeStreak(false);
                        } catch {}
                        try {
                          (global as any).__habitFlags = {
                            ...( (global as any).__habitFlags || {} ),
                            merge: false,
                          };
                        } catch {}
                      } else {
                        // Turning repeat ON: clear stale end date for non-yearly to force explicit pick
                        if (repeatFrequency !== 'yearly') {
                          try { setRepeatEndDate(undefined); } catch {}
                        }
                      }
                    }}
                  />
                  <Text className="ml-2">{t.tasks?.modal.repeatToggle}</Text>
                </View>
                {/* Tuỳ chọn hoàn thành: luôn hiển thị. Khi repeat = true sẽ cho phép cả merge; khi repeat = false chỉ cho phép auto-complete */}
                <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                  <Text className="ml-1 mt-0.5 mb-1 font-medium">{t.tasks?.modal.completionOptions}</Text>
                  <View className="mt-1 gap-2">
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center">
                        <Switch value={habitAutoCompleteExpired} onValueChange={toggleHabitAuto} />
                        <Text className="ml-2">{t.tasks?.modal.autoCompleteExpired}</Text>
                      </View>
                    </View>
                    {repeat ? (
                      <View className="flex-row items-center">
                        <Switch value={habitMergeStreak} onValueChange={(v) => { toggleHabitMerge(v); }} />
                        <Text className="ml-2">{t.tasks?.modal.mergeStreak}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {repeat ? (
                  <>
                    {/* "Tuỳ chọn hoàn thành" removed: auto-complete option deprecated.
                        The merge toggle is moved down next to the repeat end date. */}
                    <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                      <Text className="ml-1 mt-0.5 mb-1 font-medium">
                        {t.tasks?.modal.repeatFrequencyLabel}
                      </Text>
                      <ColoredSegmentGroup
                        value={repeatFrequency.toString()}
                        onChange={(v: string) => setRepeatFrequency(v)}
                        size="sm"
                        color="purple"
                        options={REPEAT_OPTIONS.map((o: any) => ({
                          label:
                            o.value === 'daily' ? (t.tasks?.modal.repeatDaily || 'Daily') :
                            o.value === 'weekly' ? (t.tasks?.modal.repeatWeekly || 'Weekly') :
                            o.value === 'monthly' ? (t.tasks?.modal.repeatMonthly || 'Monthly') :
                            (t.tasks?.modal.repeatYearly || 'Yearly'),
                          value: o.value.toString()
                        }))}
                      />
                    </View>

                    {repeatFrequency === "weekly" && (
                      <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                        <Text className="mb-1">{t.tasks?.modal.weeklyPickDays}</Text>
                        <View className="flex-row flex-wrap mt-1">
                          {(() => {
                            const weekOpts = [
                              { value: "Mon", label: "T2" },
                              { value: "Tue", label: "T3" },
                              { value: "Wed", label: "T4" },
                              { value: "Thu", label: "T5" },
                              { value: "Fri", label: "T6" },
                              { value: "Sat", label: "T7" },
                              { value: "Sun", label: "CN" },
                            ];
                            const allSelected = repeatDaysOfWeek.length === weekOpts.length;
                            return (
                              <>
                                {/* Nút chọn tất cả */}
                                <TouchableOpacity
                                  key="__all__"
                                  className={`rounded mr-1 mb-1 px-2 py-1 ${
                                    allSelected ? "bg-blue-600" : "bg-gray-300"
                                  }`}
                                  onPress={() => {
                                    setRepeatDaysOfWeek((prev: string[]) =>
                                      prev.length === weekOpts.length
                                        ? []
                                        : weekOpts.map((o) => o.value)
                                    );
                                  }}
                                >
                                  <Text className={`${allSelected ? "text-white" : "text-gray-800"}`}>
                                    {t.tasks?.modal.selectAll}
                                  </Text>
                                </TouchableOpacity>

                                {/* Các ngày trong tuần */}
                                {weekOpts.map((opt) => {
                                  const isSelected = repeatDaysOfWeek.includes(opt.value);
                                  return (
                                    <TouchableOpacity
                                      key={opt.value}
                                      className={`rounded mr-1 mb-1 px-2 py-1 ${
                                        isSelected ? "bg-blue-600" : "bg-gray-300"
                                      }`}
                                      onPress={() => {
                                        setRepeatDaysOfWeek((prev: string[]) =>
                                          prev.includes(opt.value)
                                            ? prev.filter((x) => x !== opt.value)
                                            : [...prev, opt.value]
                                        );
                                      }}
                                    >
                                      <Text className={`${isSelected ? "text-white" : "text-gray-800"}`}>
                                        {opt.label}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </View>
                      </View>
                    )}

                    {repeatFrequency === "monthly" && (
                      <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                        <Text className="mb-1">{t.tasks?.modal.monthlyPickDays}</Text>
                        <View className="flex-row flex-wrap mt-1 items-center">
                          {(() => {
                            const allDays = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
                            const allSelected = repeatDaysOfMonth.length === allDays.length;
                            return (
                              <>
                                {/* Nút chọn tất cả */}
                                <TouchableOpacity
                                  key="__all_month__"
                                  className={`rounded m-1 px-2 py-1 items-center ${
                                    allSelected ? "bg-blue-600" : "bg-gray-300"
                                  }`}
                                  onPress={() => {
                                    setRepeatDaysOfMonth((prev: string[]) =>
                                      prev.length === allDays.length ? [] : allDays
                                    );
                                  }}
                                >
                                  <Text className={`${allSelected ? "text-white" : "text-gray-800"}`}>
                                    {t.tasks?.modal.selectAll}
                                  </Text>
                                </TouchableOpacity>

                                {/* Các ngày 1..31 */}
                                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                                  const dayStr = day.toString();
                                  const selected = repeatDaysOfMonth.includes(dayStr);
                                  return (
                                    <TouchableOpacity
                                      key={day}
                                      className={`rounded m-1 px-2 py-1 min-w-[32px] items-center ${
                                        selected ? "bg-blue-600" : "bg-gray-300"
                                      }`}
                                      onPress={() => {
                                        setRepeatDaysOfMonth((prev: string[]) =>
                                          prev.includes(dayStr)
                                            ? prev.filter((d) => d !== dayStr)
                                            : [...prev, dayStr]
                                        );
                                      }}
                                    >
                                      <Text className={`${selected ? "text-white" : "text-gray-800"}`}>
                                        {day}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </View>
                      </View>
                    )}

                    {/* Kết thúc lặp: Yearly dùng số lần; các loại khác dùng ngày kết thúc */}
                    {repeatFrequency === "yearly" ? (
                      <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                        <Text className="ml-1 mt-0.5 mb-1 font-medium">{t.tasks?.modal.yearlyCountLabel}</Text>
                        <TextInput
                          className="border p-2 rounded bg-white"
                          keyboardType="number-pad"
                          value={yearlyCount === "" ? "" : String(yearlyCount)}
                          placeholder={t.tasks?.modal.yearlyCountPlaceholder}
                          onChangeText={updateYearlyCount}
                        />
                        <Text className="text-xs text-gray-500 mt-1 ml-1">
                          {t.tasks?.modal.autoEndDateLabel(repeatEndDate ? formatDate(new Date(repeatEndDate)) : "--")}
                        </Text>
                      </View>
                    ) : (
                      <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                        <Text className="ml-1 mt-0.5 mb-1 font-medium">{t.tasks?.modal.repeatEndDateLabel}</Text>
                        <TouchableOpacity
                          className="border p-2 rounded bg-white"
                          onPress={() => {
                            if (Platform.OS === "android") {
                              const base = newTask.start_at
                                ? new Date(newTask.start_at)
                                : new Date();
                              DateTimePickerAndroid.open({
                                value: repeatEndDate ? new Date(repeatEndDate) : base,
                                minimumDate: base,
                                mode: "date",
                                is24Hour: true,
                                onChange: (event, pickedDate) => {
                                  if (event.type === "set" && pickedDate) {
                                    setRepeatEndDate(pickedDate.getTime());
                                  }
                                },
                              });
                            } else {
                              setIosShowRepeatEndDate(true);
                            }
                          }}
                        >
                          <Text>
                            {repeatEndDate
                              ? formatDate(new Date(repeatEndDate))
                              : "--"}
                          </Text>
                        </TouchableOpacity>
                        {Platform.OS === "ios" && iosShowRepeatEndDate && (
                          <DateTimePicker
                            value={repeatEndDate ? new Date(repeatEndDate) : (newTask.start_at ? new Date(newTask.start_at) : new Date())}
                            minimumDate={newTask.start_at ? new Date(newTask.start_at) : new Date()}
                            mode="date"
                            display="inline"
                            onChange={(event, pickedDate) => {
                              setIosShowRepeatEndDate(false);
                              if (event.type === "set" && pickedDate) {
                                setRepeatEndDate(pickedDate.getTime());
                              }
                            }}
                          />
                        )}
                        {/* Move merge toggle next to repeat end date so user can choose to collapse cycle completion */}
                                              {/* (merge toggle removed here; rendered in the main "Tuỳ chọn hoàn thành" block) */}
                      </View>
                    )}
                  </>
                ) : null}
                {editId === null ? (
                  <TouchableOpacity
                    className={`bg-blue-600 p-3 rounded-lg mt-2 ${!newTask.title.trim() ? 'opacity-50' : ''}`}
                    onPress={() => {
                      (global as any).__habitFlags = { merge: habitMergeStreak, auto: habitAutoCompleteExpired };
                      handleAddWithConstraint();
                    }}
                    disabled={!newTask.title.trim()}
                  >
                    <Text className="text-white text-center">{t.tasks?.modal.addButton}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    className={`bg-blue-600 p-3 rounded-lg mt-2 ${!newTask.title.trim() ? 'opacity-50' : ''}`}
                    onPress={() => {
                      (global as any).__habitFlags = { merge: habitMergeStreak, auto: habitAutoCompleteExpired };
                      handleEditWithConstraint();
                    }}
                    disabled={!newTask.title.trim()}
                  >
                    <Text className="text-white text-center">{t.tasks?.modal.saveButton}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  className="bg-gray-300 p-3 rounded-lg mt-2"
                  onPress={onClose}
                >
                  <Text className="text-center">{t.tasks?.modal.cancelButton || t.tasks?.cancel}</Text>
                </TouchableOpacity>
                  </>
            </>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
