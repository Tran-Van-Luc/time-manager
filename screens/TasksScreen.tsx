import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator, // Thêm ActivityIndicator
} from "react-native";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
const CUT_OFF_KEY = 'endOfDayCutoff';
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const isSameLocalDate = (msA?: number | null, msB?: number | null) => {
  if (msA == null || msB == null) return false;
  const a = new Date(msA);
  const b = new Date(msB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const cutoffForDateFromString = (cutoffStr: string | null | undefined, date: Date) => {
  if (!cutoffStr) return null;
  const parts = String(cutoffStr).split(':');
  const h = parseInt(parts[0] || '23', 10);
  const m = parseInt(parts[1] || '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).getTime();
};
import { useTasks } from "../hooks/useTasks";
import { useReminders } from "../hooks/useReminders";
import { useRecurrences } from "../hooks/useRecurrences";
import { useSchedules } from "../hooks/useSchedules";
import { useTaskOperations } from "../hooks/useTaskOperations";
import * as DocumentPicker from 'expo-document-picker';
import { parseFile, exportTemplate, ParsedRow, ParseResult } from '../components/tasks/importHelpers';
import { checkRecurringConflicts, checkTimeConflicts } from "../utils/taskValidation";
import ConflictModal from "../components/tasks/ConflictModal";
import TaskAlertModal from "../components/tasks/TaskAlertModal";
import CompactSelect from "../components/tasks/CompactSelect";
import TaskModal from "../components/tasks/TaskModal";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import TaskListView from "../components/tasks/TaskListView";
import TaskWeekView from "../components/tasks/TaskWeekView";
import ImportDialog from "../components/tasks/ImportDialog"; // Tách dialog ra riêng
import type { Task } from "../types/Task";
import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  REMINDER_OPTIONS,
  REPEAT_OPTIONS,
  getPriorityOptions,
  getStatusOptions,
  getReminderOptions,
  getRepeatOptions,
} from "../constants/taskConstants";
// Hỗ trợ nhập/xuất Excel

export default function TasksScreen() {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = {
    background: isDark ? "#071226" : "#ffffff",
    surface: isDark ? "#0b1220" : "#F8FAFF",
    cardBorder: isDark ? "#223049" : "#EFF6FF",
    text: isDark ? "#E6EEF8" : "#111827",
    muted: isDark ? "#9AA4B2" : "#374151",
    inputBg: isDark ? "#071226" : "#ffffff",
    inputBorder: isDark ? "#223049" : "#D1D5DB",
    buttonBg: isDark ? "#374151" : "#e5e7eb",
    overlay: "rgba(0,0,0,0.4)",
    primary: "#60a5fa",
    danger: "#ef4444",
  };
  const { tasks, loadTasks, addTask, removeTask, editTask, loading } =
    useTasks();
  const {
    reminders,
    addReminder,
    editReminder,
    removeReminder,
    loadReminders,
  } = useReminders();
  const {
    recurrences,
    addRecurrence,
    editRecurrence,
    removeRecurrence,
    loadRecurrences,
  } = useRecurrences();
  const { schedules, loadSchedules } = useSchedules();
  const [conflictModal, setConflictModal] = useState<{ visible: boolean; raw: string; blocks: any[]; resolver?: (proceed: boolean)=>void }>({ visible:false, raw:'', blocks:[], resolver: undefined });
  const [alertState, setAlertState] = useState<{ visible:boolean; tone:'error'|'warning'|'success'|'info'; title:string; message:string; buttons:{ text:string; onPress:()=>void; tone?:any }[] }>({ visible:false, tone:'info', title:'', message:'', buttons:[] });
  const { handleAddTask, handleEditTask, handleDeleteTask } = useTaskOperations(
    tasks,
    schedules,
    {
      onConflict: ({ raw, blocks, resolve }) => {
        // Hiển thị modal với lựa chọn Tiếp tục hoặc Đóng
        setConflictModal({ visible:true, raw, blocks, resolver: resolve });
      },
      onNotify: ({ tone, title, message }) => {
        setAlertState({ visible:true, tone, title, message, buttons:[{ text: t.settings.close, onPress:()=>{}, tone:'cancel'}] });
      },
      onConfirm: ({ tone='info', title, message, buttons }) => {
        setAlertState({
          visible:true,
          tone: tone as any,
          title,
          message,
          buttons: buttons.map(b=>({ text:b.text, onPress:b.onPress, tone:b.style==='destructive'?'destructive': b.style==='cancel'?'cancel':'info' }))
        });
      }
    },
    { reminders, addReminder, editReminder, removeReminder, loadReminders }
  );
  
  // Wrap task-operation handlers to pass current UI state and handle UI resets
  const onAddTask = async () => {
    const success = await handleAddTask(
      newTask,
      reminder
        ? { enabled: true, time: reminderTime, method: reminderMethod }
        : { enabled: false, time: 0, method: "notification" },
      repeat
        ? {
            enabled: true,
            frequency: repeatFrequency,
            interval: 1,
            daysOfWeek: repeatDaysOfWeek,
            daysOfMonth: repeatDaysOfMonth,
            endDate: repeatEndDate,
          }
        : { enabled: false, frequency: "daily", interval: 1 }
    );
    if (success) {
      if (importMode && importRows.length > 0) {
        // Advance to next row if importing
        const next = importIndex + 1;
        await loadTasks();
        await loadReminders();
        await loadRecurrences();
        if (next < importRows.length) {
          setImportIndex(next);
          hydrateFromRow(importRows[next]);
        } else {
          // Finish import
          setImportMode(false);
          setImportRows([]);
          setImportIndex(0);
          setShowModal(false);
          setNewTask({ title: "", priority: "medium", status: "pending" });
          setReminder(false);
          setReminderTime((REMINDER_LOCALIZED[0]?.value ?? REMINDER_OPTIONS[0].value));
          setReminderMethod("notification");
          setRepeat(false);
          setRepeatFrequency("daily");
          setRepeatInterval(1);
          setRepeatDaysOfWeek([]);
          setRepeatDaysOfMonth([]);
          setRepeatStartDate(undefined);
          setRepeatEndDate(undefined);
        }
      } else {
        setShowModal(false);
        setNewTask({ title: "", priority: "medium", status: "pending" });
        setReminder(false);
        setReminderTime((REMINDER_LOCALIZED[0]?.value ?? REMINDER_OPTIONS[0].value));
        setReminderMethod("notification");
        setRepeat(false);
        setRepeatFrequency("daily");
        setRepeatInterval(1);
        setRepeatDaysOfWeek([]);
        setRepeatDaysOfMonth([]);
        setRepeatStartDate(undefined);
        setRepeatEndDate(undefined);
        await loadTasks();
        await loadReminders();
        await loadRecurrences();
      }
    }
  };

  const onEditTask = async () => {
    if (editId === null) return;
    const success = await handleEditTask(
      editId,
      newTask,
      reminder
        ? { enabled: true, time: reminderTime, method: reminderMethod }
        : { enabled: false, time: 0, method: "notification" },
      repeat
        ? {
            enabled: true,
            frequency: repeatFrequency,
            interval: 1,
            daysOfWeek: repeatDaysOfWeek,
            daysOfMonth: repeatDaysOfMonth,
            endDate: repeatEndDate,
          }
        : { enabled: false, frequency: "daily", interval: 1 }
    );
    if (success) {
      setEditId(null);
      setShowModal(false);
      setNewTask({ title: "", priority: "medium", status: "pending" });
      setReminder(false);
      setRepeat(false);
  setReminderTime((REMINDER_LOCALIZED[0]?.value ?? REMINDER_OPTIONS[0].value));
      setRepeatFrequency("daily");
      await loadTasks();
      await loadReminders();
      await loadRecurrences();
    }
  };

  const onDeleteTask = async (id: number) => {
    const ok = await handleDeleteTask(id);
    if (ok) {
      await loadTasks();
      await loadReminders();
      await loadRecurrences();
    }
  };

  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [filtersWidth, setFiltersWidth] = useState<number | undefined>(undefined);
  // Options for filters with an explicit "All" entry so users can clear selection
  const PRIORITY_LOCALIZED = useMemo(() => getPriorityOptions(t), [t]);
  const STATUS_LOCALIZED = useMemo(() => getStatusOptions(t), [t]);
  const REMINDER_LOCALIZED = useMemo(() => getReminderOptions(t), [t]);
  const REPEAT_LOCALIZED = useMemo(() => getRepeatOptions(t), [t]);
  const PRIORITY_OPTIONS_FILTER = useMemo(() => ([{ label: (t.tasks?.allPriorities ?? "All priorities"), value: "" }, ...PRIORITY_LOCALIZED]), [t, PRIORITY_LOCALIZED]);
  const STATUS_OPTIONS_FILTER = useMemo(() => ([{ label: (t.tasks?.allStatuses ?? "All statuses"), value: "" }, ...STATUS_LOCALIZED]), [t, STATUS_LOCALIZED]);
  const [showModal, setShowModal] = useState(false);
  // Lưu thời điểm bắt đầu nhập task
  const [addTaskStartTime, setAddTaskStartTime] = useState<number | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // newTask chỉ giữ field editable
  const [newTask, setNewTask] = useState<{
    title: string;
    description?: string;
    start_at?: number; // timestamp ms
    end_at?: number; // timestamp ms
    priority: string;
    status: string;
  }>({ title: "", priority: "medium", status: "pending" });

  // UI state cho nhắc nhở/lặp lại (chưa lưu vào DB)
  const [reminder, setReminder] = useState(false);
  const [reminderTime, setReminderTime] = useState(REMINDER_OPTIONS[0].value);
  const [reminderMethod, setReminderMethod] = useState("notification");

  const [repeat, setRepeat] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState("daily");
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatDaysOfWeek, setRepeatDaysOfWeek] = useState<string[]>([]);
  const [repeatDaysOfMonth, setRepeatDaysOfMonth] = useState<string[]>([]);
  const [repeatStartDate, setRepeatStartDate] = useState<number | undefined>(
    undefined
  );
  const [repeatEndDate, setRepeatEndDate] = useState<number | undefined>(
    undefined
  );
  const [showRepeatStartPicker, setShowRepeatStartPicker] = useState(false);
  const [showRepeatEndPicker, setShowRepeatEndPicker] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);

  // Thêm state cho chế độ nhập
  // Đã bỏ chế độ nhập file nên không cần inputMode

  // Chi tiết công việc từ lịch
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // View mode: list or weekly calendar
  const [viewMode, setViewMode] = useState<"list" | "week">("list");
  const [currentWeekStart, setCurrentWeekStart] = useState<number>(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = d.getDay(); // 0=Sun, 1=Mon, ...
    const diff = (day + 6) % 7; // days since Monday
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });

  useEffect(() => {
    loadTasks();
    loadReminders();
    loadRecurrences();
    loadSchedules();
    // Expose reload helpers so background timers/scanners can request a UI refresh
    try {
      (global as any).__reloadTasks = loadTasks;
      (global as any).__reloadRecurrences = loadRecurrences;
    } catch {}
    return () => {
      try { delete (global as any).__reloadTasks; } catch {}
      try { delete (global as any).__reloadRecurrences; } catch {}
    };
  }, []);

  // Lọc task theo search, priority, status và sắp xếp theo thời gian bắt đầu
  const filteredTasks = useMemo(() => {
    const searchLower = (search || '').toLowerCase();
    const filtered = tasks.filter((t) => {
      const matchSearch =
        !searchLower ||
        t.title.toLowerCase().includes(searchLower) ||
        (t.description || '').toLowerCase().includes(searchLower);
      const matchPriority = !priority || t.priority === priority;
      const matchStatus = !status || t.status === status;
      return matchSearch && matchPriority && matchStatus;
    });
    return filtered.sort((a, b) => {
      const aStart = a.start_at
        ? typeof a.start_at === 'string'
          ? new Date(a.start_at).getTime()
          : a.start_at
        : 0;
      const bStart = b.start_at
        ? typeof b.start_at === 'string'
          ? new Date(b.start_at).getTime()
          : b.start_at
        : 0;
      return aStart - bStart;
    });
  }, [tasks, search, priority, status]);

  // Mở modal thêm mới
  const openAddModal = () => {
    setEditId(null);
    setShowModal(true);
    setNewTask({ title: '', priority: 'medium', status: 'pending' });
    setReminder(false);
    setReminderTime(REMINDER_LOCALIZED[0]?.value ?? REMINDER_OPTIONS[0].value);
    setReminderMethod('notification');
    setRepeat(false);
    setRepeatFrequency('daily');
    setRepeatInterval(1);
    setRepeatDaysOfWeek([]);
    setRepeatDaysOfMonth([]);
    setRepeatStartDate(undefined);
    setRepeatEndDate(undefined);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setShowRepeatStartPicker(false);
    setShowRepeatEndPicker(false);
    setAddTaskStartTime(Date.now());
    // Reset habit flags when starting a fresh add
    try { (global as any).__habitFlags = { merge: false, auto: false }; } catch {}
  };

  const openEditModal = (item: Task) => {
    setEditId(item.id!);
    setShowModal(true);
    setNewTask({
      title: item.title,
      description: item.description,
      start_at: item.start_at ? new Date(item.start_at).getTime() : undefined,
      end_at: item.end_at ? new Date(item.end_at).getTime() : undefined,
      priority: item.priority || 'medium',
      status: item.status || 'pending',
    });

    // Tìm reminder của task này
    const taskReminder = reminders.find((r) => r.task_id === item.id);
    if (taskReminder) {
      setReminder(true);
      setReminderTime(taskReminder.remind_before ?? (REMINDER_LOCALIZED[0]?.value ?? REMINDER_OPTIONS[0].value));
      setReminderMethod(taskReminder.method ?? 'notification');
    } else {
      setReminder(false);
      setReminderTime((REMINDER_LOCALIZED[0]?.value ?? REMINDER_OPTIONS[0].value));
      setReminderMethod('notification');
    }

    // Tìm recurrence của task này
    if (item.recurrence_id) {
      const rec = recurrences.find((r) => r.id === item.recurrence_id);
      if (rec) {
        // Detect single-day auto-only recurrence (persisted to store auto flag).
        const isAutoOnlySingle = rec.auto_complete_expired === 1 && rec.start_date && rec.end_date && rec.start_date === rec.end_date;
        // Prefill habit flags for TaskModal switches (merge/auto) - override any previous flags
        const mergeFlag = rec.merge_streak === 1;
        const autoFlag = rec.auto_complete_expired === 1;
        (global as any).__habitFlags = { merge: mergeFlag, auto: autoFlag };

        if (isAutoOnlySingle) {
          // Keep Repeat UI off but hydrate internal recurrence values
          setRepeat(false);
          setRepeatFrequency(rec.type ?? 'daily');
          setRepeatInterval(rec.interval ?? 1);
          setRepeatDaysOfWeek(rec.days_of_week ? JSON.parse(rec.days_of_week) : []);
          setRepeatDaysOfMonth(rec.day_of_month ? JSON.parse(rec.day_of_month) : []);
          setRepeatStartDate(rec.start_date ? new Date(rec.start_date).getTime() : undefined);
          setRepeatEndDate(rec.end_date ? new Date(rec.end_date).getTime() : undefined);
        } else {
          setRepeat(true);
          setRepeatFrequency(rec.type ?? 'daily');
          setRepeatInterval(rec.interval ?? 1);
          setRepeatDaysOfWeek(rec.days_of_week ? JSON.parse(rec.days_of_week) : []);
          setRepeatDaysOfMonth(rec.day_of_month ? JSON.parse(rec.day_of_month) : []);
          setRepeatStartDate(rec.start_date ? new Date(rec.start_date).getTime() : undefined);
          setRepeatEndDate(rec.end_date ? new Date(rec.end_date).getTime() : undefined);
        }
      } else {
        // Recurrence id tồn tại nhưng không có bản ghi -> reset flags
        (global as any).__habitFlags = { merge: false, auto: false };
        setRepeat(false);
        setRepeatFrequency('daily');
        setRepeatInterval(1);
        setRepeatDaysOfWeek([]);
        setRepeatDaysOfMonth([]);
        setRepeatStartDate(undefined);
        setRepeatEndDate(undefined);
      }
    } else {
      // Không có recurrence -> reset flags để tránh leak từ task trước
      (global as any).__habitFlags = { merge: false, auto: false };
      setRepeat(false);
      setRepeatFrequency('daily');
      setRepeatInterval(1);
      setRepeatDaysOfWeek([]);
      setRepeatDaysOfMonth([]);
      setRepeatStartDate(undefined);
      setRepeatEndDate(undefined);
    }
  };

  useEffect(() => {
    const runOnce = () => {
      const now = Date.now();
      tasks.forEach((t) => {
        const start = t.start_at ? new Date(t.start_at).getTime() : undefined;
        if (t.status === "pending" && start !== undefined && start <= now) {
          editTask(t.id!, { status: "in-progress" });
        }
      });
    };

    // Run immediately
    runOnce();
    // Then check frequently (every 5s) to flip status as soon as start time arrives
    const interval = setInterval(runOnce, 5000);
    return () => clearInterval(interval);
  }, [tasks]);

  const [importMode, setImportMode] = useState(false);
  const [importRows, setImportRows] = useState<ParsedRow[]>([]);
  const [importIndex, setImportIndex] = useState(0);
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importDialogPath, setImportDialogPath] = useState<string>('');
  const [importCandidateUri, setImportCandidateUri] = useState<string | null>(null);

  const parseBooleanVi = (s: any): boolean => {
    if (typeof s === 'boolean') return s;
    if (s == null) return false;
    const v = String(s).trim().toLowerCase();
    return ['có','co','true','1','x','yes','y'].includes(v);
  };
  const mapPriorityVi = (s: any): 'low'|'medium'|'high' => {
    const v = String(s || '').trim().toLowerCase();
    if (v.includes('cao')) return 'high';
    if (v.includes('trung')) return 'medium';
    if (v.includes('thấp') || v.includes('thap')) return 'low';
    return 'medium';
  };
  // Không cần parse trạng thái từ Excel nữa; mặc định sẽ là 'pending'
  const mapFrequencyVi = (s: any): 'daily'|'weekly'|'monthly'|'yearly' => {
    const v = String(s || '').trim().toLowerCase();
    if (v.includes('tuần') || v.includes('tuan') || v.includes('weekly')) return 'weekly';
    if (v.includes('tháng') || v.includes('thang') || v.includes('monthly')) return 'monthly';
    if (v.includes('năm') || v.includes('nam') || v.includes('year')) return 'yearly';
    return 'daily';
  };
  const parseLeadVi = (s: any): number => {
    if (s == null) return 0;
    const v = String(s).trim().toLowerCase();
    const m = v.match(/^(\d+)\s*(phút|phut|p|giờ|gio|g|ngày|ngay|n)?/);
    if (!m) return 0;
    const num = parseInt(m[1],10);
    const unit = m[2] || 'phút';
    if (['giờ','gio','g'].includes(unit)) return num*60;
    if (['ngày','ngay','n'].includes(unit)) return num*1440;
    return num;
  };
  const parseDateOnlyVi = (s: any): number | undefined => {
    if (!s) return undefined;
    const v = String(s).trim();
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return undefined;
    const dd = parseInt(m[1],10), MM = parseInt(m[2],10), yyyy = parseInt(m[3],10);
    const d = new Date(yyyy, MM-1, dd, 23, 59, 0, 0);
    return d.getTime();
  };
  const parseTimeVi = (s: any): { h: number; m: number } | undefined => {
    if (!s) return undefined;
    const v = String(s).trim();
    const m = v.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return undefined;
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (isNaN(h) || isNaN(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return undefined;
    return { h, m: mm };
  };

  const hydrateFromRow = (r: ParsedRow) => {
    setNewTask({
      title: r.title || '',
      description: r.description || '',
      start_at: r.start_at,
      end_at: r.end_at,
      priority: r.priority || 'medium',
      status: r.status || 'pending',
    });
    setReminder(!!r.reminderEnabled);
    setReminderTime(r.reminderTime ?? (REMINDER_LOCALIZED[0]?.value ?? REMINDER_OPTIONS[0].value));
    setReminderMethod(r.reminderMethod || 'notification');
    setRepeat(!!r.repeatEnabled);
    setRepeatFrequency(r.repeatFrequency || 'daily');
    setRepeatInterval(r.repeatInterval || 1);
    setRepeatDaysOfWeek(r.repeatDaysOfWeek || []);
    setRepeatDaysOfMonth(r.repeatDaysOfMonth || []);
    setRepeatEndDate((() => {
      if (r.repeatFrequency === 'yearly' && r.yearlyCount && r.start_at) {
        const base = new Date(r.start_at);
        const end = new Date(base);
        end.setFullYear(end.getFullYear() + (r.yearlyCount - 1));
        end.setHours(23,59,0,0);
        return end.getTime();
      }
      return r.repeatEndDate;
    })());
  // Đồng bộ cờ thói quen từ dữ liệu import: luôn set merge; nếu có cung cấp habitAuto thì set, nếu không thì giữ nguyên
  {
    const prev = (global as any).__habitFlags || {};
    const next: any = { ...prev, merge: !!r.habitMerge };
    if (typeof r.habitAuto === 'boolean') next.auto = r.habitAuto;
    (global as any).__habitFlags = next;
  }
  };
  // Helper formatters for import conflict messages (used by computeImportErrors and import flow)
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const formatDate = (ms: number) => {
    const d = new Date(ms);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  const formatTime = (ms: number) => {
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  const formatRepeatTextRow = (row: ParsedRow) => {
    if (!row.repeatEnabled || !row.repeatFrequency) return '(Không lặp)';
    const f = row.repeatFrequency;
    const dowToVi = (dow: string) => {
      if (!dow) return dow;
      const map: Record<string, string> = { Mon: 'Thứ 2', Tue: 'Thứ 3', Wed: 'Thứ 4', Thu: 'Thứ 5', Fri: 'Thứ 6', Sat: 'Thứ 7', Sun: 'CN' };
      return map[dow] || dow;
    };
    if (f === 'daily') return '(Lặp: Hằng ngày)';
    if (f === 'weekly') return (row.repeatDaysOfWeek && row.repeatDaysOfWeek.length) ? `(Lặp: Hằng tuần - ${row.repeatDaysOfWeek.map(dowToVi).join(', ')})` : '(Lặp: Hằng tuần)';
    if (f === 'monthly') return (row.repeatDaysOfMonth && row.repeatDaysOfMonth.length) ? `(Lặp: Hằng tháng - ngày ${row.repeatDaysOfMonth.join(', ')})` : '(Lặp: Hằng tháng)';
    if (f === 'yearly') return row.yearlyCount ? `(Lặp: Hằng năm - ${row.yearlyCount} lần)` : '(Lặp: Hằng năm)';
    return '';
  };
  const briefForExistingTask = (t: Task) => {
    try {
      const tStart = t.start_at ? (typeof t.start_at === 'string' ? Date.parse(t.start_at) : t.start_at) : undefined;
      const tEnd = t.end_at ? (typeof t.end_at === 'string' ? Date.parse(t.end_at) : t.end_at) : undefined;
      if (!tStart || !tEnd) return `• ${(t.title||'(Không tiêu đề)')}`;
      const s = new Date(tStart); const e = new Date(tEnd);
      const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
      if (sameDay) {
        return `• ${(t.title||'(Không tiêu đề)')}${t.recurrence_id ? ' (lặp)' : ''}\n  Thời gian: ${pad2(s.getHours())}:${pad2(s.getMinutes())} - ${pad2(e.getHours())}:${pad2(e.getMinutes())} ${pad2(s.getDate())}/${pad2(s.getMonth() + 1)}/${s.getFullYear()}`;
      }
      const fmt = (ms: number) => `${pad2(new Date(ms).getHours())}:${pad2(new Date(ms).getMinutes())} ${formatDate(ms)}`;
      return `• ${(t.title||'(Không tiêu đề)')}${t.recurrence_id ? ' (lặp)' : ''}\n  Bắt đầu: ${fmt(tStart)}\n  Kết thúc: ${fmt(tEnd)}`;
    } catch { return `• ${(t.title||'(Không tiêu đề)')}`; }
  };

  const computeImportErrors = (r: ParsedRow): string[] => {
    const errs: string[] = [];
    if (!r.title || !r.title.trim()) errs.push('Thiếu tiêu đề công việc');
    const usedCombined = (r as any).meta?.usedCombined;
    const validStartDate = (r as any).meta?.validStartDate;
    const validStartTime = (r as any).meta?.validStartTime;
    const validEndTime = (r as any).meta?.validEndTime;
    if (usedCombined) {
      if (!r.start_at) errs.push('Thiếu hoặc sai định dạng thời gian bắt đầu (HH:MM-dd/MM/yyyy)');
      if (!r.end_at) errs.push('Thiếu hoặc sai định dạng thời gian kết thúc (HH:MM-dd/MM/yyyy)');
    } else {
      if (!validStartDate) errs.push('Thiếu hoặc sai định dạng Ngày bắt đầu (dd/MM/yyyy)');
      if (!validStartTime) errs.push('Thiếu hoặc sai định dạng Giờ bắt đầu (HH:MM)');
      if (!validEndTime) errs.push('Thiếu hoặc sai định dạng Giờ kết thúc (HH:MM)');
    }
    if (r.start_at && r.end_at && r.end_at <= r.start_at) errs.push('Ngày giờ kết thúc phải sau ngày giờ bắt đầu!');
    if (r.repeatEnabled) {
      if (r.repeatFrequency === 'weekly' && (!r.repeatDaysOfWeek || r.repeatDaysOfWeek.length === 0) && r.start_at) {
        const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(r.start_at).getDay()];
        r.repeatDaysOfWeek = [dow];
      }
      if (r.repeatFrequency === 'monthly' && (!r.repeatDaysOfMonth || r.repeatDaysOfMonth.length === 0) && r.start_at) {
        r.repeatDaysOfMonth = [String(new Date(r.start_at).getDate())];
      }
      const endBoundary = ((): number | undefined => {
        if (r.repeatFrequency === 'yearly' && r.yearlyCount && r.start_at) {
          const base = new Date(r.start_at);
          const end = new Date(base); end.setFullYear(end.getFullYear() + (r.yearlyCount - 1)); end.setHours(23,59,0,0); return end.getTime();
        }
        return r.repeatEndDate;
      })();
      if (r.start_at && endBoundary && r.start_at > endBoundary) errs.push('Ngày bắt đầu không thể sau ngày kết thúc lặp!');
    }
    try {
      if (r.start_at && r.end_at) {
        const rec = r.repeatEnabled ? {
          enabled: true,
          frequency: r.repeatFrequency,
          interval: r.repeatInterval || 1,
          daysOfWeek: r.repeatDaysOfWeek,
          daysOfMonth: r.repeatDaysOfMonth,
          endDate: ((): number | undefined => {
            if (r.repeatFrequency === 'yearly' && r.yearlyCount && r.start_at) {
              const base = new Date(r.start_at); const end = new Date(base); end.setFullYear(end.getFullYear() + (r.yearlyCount - 1)); end.setHours(23,59,0,0); return end.getTime();
            }
            return r.repeatEndDate;
          })(),
        } as any : null;
        const earlierRows = importRows.slice(0, importIndex).filter(x=> x.start_at && x.end_at) as ParsedRow[];
        const syntheticTasks = earlierRows.map((er, idx) => ({
          id: -1000 - idx,
          title: er.title,
          start_at: er.start_at,
          end_at: er.end_at,
          priority: er.priority || 'medium',
          status: er.status || 'pending',
          recurrence_id: undefined,
        })) as any[];
        // Exclude completed tasks from conflict/duplicate checks
        const activeTasks = tasks.filter(t => t.status !== 'completed');
        // Duplicate detection: same title + identical start/end timestamps
        let duplicateDetected = false;
        for (const t of activeTasks) {
          try {
            const tStart = t.start_at ? (typeof t.start_at === 'string' ? Date.parse(t.start_at) : t.start_at) : undefined;
            const tEnd = t.end_at ? (typeof t.end_at === 'string' ? Date.parse(t.end_at) : t.end_at) : undefined;
              if (tStart && tEnd && Math.abs(tStart - r.start_at) < 1000 && Math.abs(tEnd - r.end_at) < 1000) {
                const tTitle = (t.title || '').toString().trim().toLowerCase();
                const rTitle = (r.title || '').toString().trim().toLowerCase();
                if (tTitle && rTitle && tTitle === rTitle) {
                  // Provide detailed conflict description like manual add
                  errs.push(`Trùng với công việc đã tồn tại:\n${briefForExistingTask(t)} ${formatRepeatTextRow(r)}`);
                  duplicateDetected = true;
                  break;
                }
              }
          } catch {}
        }
        const tasksForCheck = [...activeTasks, ...syntheticTasks];
        if (!duplicateDetected) {
          if (rec && rec.enabled && rec.endDate) {
            const { hasConflict, conflictMessage } = checkRecurringConflicts(r.start_at, r.end_at, tasksForCheck as any, schedules as any, rec);
            if (hasConflict) errs.push(`Xung đột với lịch/công việc khác:\n${conflictMessage}`);
          } else {
            const { hasConflict, conflictMessage } = checkTimeConflicts(r.start_at, r.end_at, tasksForCheck as any, schedules as any);
            if (hasConflict) errs.push(`Xung đột với lịch/công việc khác:\n${conflictMessage}`);
          }
        }
      }
    } catch {}
    return errs;
  };
  const handlePickExcel = async () => {
    // Open document picker and import selected file
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'] });
      if (res.canceled) return;
      const file = res.assets[0];
      await handleImportFromUri(file.uri);
    } catch (e) {
      setAlertState({ visible:true, tone:'error', title:'Lỗi nhập tệp', message: 'Không thể đọc tệp Excel. Vui lòng kiểm tra định dạng.', buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
    }
  };

  const handleImportFromUri = async (uri: string) => {
    try {
      const parsed = await parseFile(uri);
      if (!parsed) {
        setAlertState({ visible:true, tone:'warning', title:'Tệp rỗng', message:'Không tìm thấy dữ liệu trong file Excel.', buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
        return;
      }
      if (parsed.errors && parsed.errors.length > 0) {
        setAlertState({ visible:true, tone:'error', title:'Lỗi nhập tệp', message: parsed.errors.join('\n'), buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
        return;
      }
      const mapped = parsed.rows;
      if (!mapped || mapped.length === 0) {
        setAlertState({ visible:true, tone:'warning', title:'Tệp rỗng', message:'Không tìm thấy dữ liệu trong file Excel.', buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
        return;
      }

      // Do import for a given set of rows (run validation + add)
      const doImport = async (rowsToImport: ParsedRow[]) => {
        // Batch-validate rows first (no partial adds). Collect per-row errors keyed by original Excel row number.
        const rowErrors: { row: number; errors: string[] }[] = [];
        const syntheticTasks: any[] = [];
        // Set global flag so handleAddTask runs in non-interactive (batch) mode
        (global as any).__skipTaskPrompts = true;
        for (const r of rowsToImport) {
          const errs: string[] = [];
          if (!r.title || !r.title.trim()) errs.push('Thiếu tiêu đề công việc');
          // basic time checks
          if (!r.start_at) errs.push('Thiếu hoặc sai định dạng Ngày/Giờ bắt đầu');
          if (!r.end_at) errs.push('Thiếu hoặc sai định dạng Giờ kết thúc');
          if (r.start_at && r.end_at && r.end_at <= r.start_at) errs.push('Ngày giờ kết thúc phải sau ngày giờ bắt đầu');

          // Repeat adjustments and checks similar to computeImportErrors
          if (r.repeatEnabled) {
            if (r.repeatFrequency === 'weekly' && (!r.repeatDaysOfWeek || r.repeatDaysOfWeek.length === 0) && r.start_at) {
              const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(r.start_at).getDay()];
              r.repeatDaysOfWeek = [dow];
            }
            if (r.repeatFrequency === 'monthly' && (!r.repeatDaysOfMonth || r.repeatDaysOfMonth.length === 0) && r.start_at) {
              r.repeatDaysOfMonth = [String(new Date(r.start_at).getDate())];
            }
            const endBoundary = ((): number | undefined => {
              if (r.repeatFrequency === 'yearly' && r.yearlyCount && r.start_at) {
                const base = new Date(r.start_at);
                const end = new Date(base);
                end.setFullYear(end.getFullYear() + (r.yearlyCount - 1));
                end.setHours(23,59,0,0);
                return end.getTime();
              }
              return r.repeatEndDate;
            })();
            if (r.start_at && endBoundary && r.start_at > endBoundary) errs.push('Ngày bắt đầu không thể sau ngày kết thúc lặp');
          }

          // Conflict checks against existing tasks + already-validated new rows
          try {
            if (r.start_at && r.end_at) {
              // Exclude completed tasks from checks and detect duplicates (same title + same times)
              const activeTasks = tasks.filter(t => t.status !== 'completed');
              let duplicateDetected = false;
              for (const t of activeTasks) {
                try {
                  const tStart = t.start_at ? (typeof t.start_at === 'string' ? Date.parse(t.start_at) : t.start_at) : undefined;
                  const tEnd = t.end_at ? (typeof t.end_at === 'string' ? Date.parse(t.end_at) : t.end_at) : undefined;
                  if (tStart && tEnd && Math.abs(tStart - r.start_at) < 1000 && Math.abs(tEnd - r.end_at) < 1000) {
                    const tTitle = (t.title || '').toString().trim().toLowerCase();
                    const rTitle = (r.title || '').toString().trim().toLowerCase();
                    if (tTitle && rTitle && tTitle === rTitle) {
                      errs.push(`Trùng với công việc đã tồn tại:\n${briefForExistingTask(t)} ${formatRepeatTextRow(r)}`);
                      duplicateDetected = true;
                      break;
                    }
                  }
                } catch {}
              }
              const tasksForCheck = [...activeTasks, ...syntheticTasks];
              if (!duplicateDetected) {
                if (r.repeatEnabled) {
                  const rec = {
                  enabled: true,
                  frequency: r.repeatFrequency,
                  interval: r.repeatInterval || 1,
                  daysOfWeek: r.repeatDaysOfWeek,
                  daysOfMonth: r.repeatDaysOfMonth,
                  endDate: ((): number | undefined => {
                    if (r.repeatFrequency === 'yearly' && r.yearlyCount && r.start_at) {
                      const base = new Date(r.start_at); const end = new Date(base); end.setFullYear(end.getFullYear() + (r.yearlyCount - 1)); end.setHours(23,59,0,0); return end.getTime();
                    }
                    return r.repeatEndDate;
                  })(),
                } as any;
                  const { hasConflict, conflictMessage } = checkRecurringConflicts(r.start_at, r.end_at, tasksForCheck as any, schedules as any, rec as any);
                  if (hasConflict) errs.push(`Xung đột: ${conflictMessage}`);
                } else {
                  const { hasConflict, conflictMessage } = checkTimeConflicts(r.start_at, r.end_at, tasksForCheck as any, schedules as any);
                  if (hasConflict) errs.push(`Xung đột: ${conflictMessage}`);
                }
              }
            }
          } catch (err) {
            // ignore check errors
          }

          if (errs.length) {
            rowErrors.push({ row: (r.meta && (r.meta as any).originalRow) || 0, errors: errs });
          } else {
            // add synthetic task for future conflict checks
            syntheticTasks.push({ id: -1000 - syntheticTasks.length, title: r.title, start_at: r.start_at, end_at: r.end_at, priority: r.priority || 'medium', status: r.status || 'pending' });
          }
        }

        if (rowErrors.length) {
          // Separate pure time-conflict rows from fatal rows
          const isConflictMsg = (msg: string) => msg.startsWith('Xung đột:') || msg.startsWith('Trùng với công việc đã tồn tại');
          const conflictOnly = rowErrors.filter(re => re.errors.length > 0 && re.errors.every(isConflictMsg));
          const fatalRows = rowErrors.filter(re => !(re.errors.length > 0 && re.errors.every(isConflictMsg)));

          if (fatalRows.length > 0) {
            // Show fatal issues and abort
            const lines = fatalRows.map(re => `Dòng ${re.row}: ${re.errors.join('; ')}`);
            setAlertState({ visible:true, tone:'error', title:'Lỗi nhập từng dòng', message: lines.join('\n'), buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
            delete (global as any).__skipTaskPrompts;
            return;
          }

          if (conflictOnly.length > 0) {
            // Offer to continue by skipping conflicting rows
            const setRows = new Set(conflictOnly.map(re => re.row));
            const msg = `Có ${conflictOnly.length} dòng bị trùng thời gian. Bạn muốn tiếp tục thêm các dòng còn lại không?\n\n` +
              conflictOnly.map(re => `• Dòng ${re.row}`).join('\n');
            setAlertState({
              visible: true,
              tone: 'warning',
              title: 'Xung đột thời gian',
              message: msg,
              buttons: [
                { text: 'Tiếp tục', onPress: () => {
                  const filtered = rowsToImport.filter(r => {
                    const rowNo = (r.meta && (r.meta as any).originalRow) || 0;
                    return !setRows.has(rowNo);
                  });
                  doImport(filtered);
                } },
                { text: 'Đóng', onPress: () => {}, tone: 'cancel' }
              ]
            });
            delete (global as any).__skipTaskPrompts;
            return;
          }
        }

        // All rows validated -> add them sequentially (no per-row modal). If any add fails, stop and report.
        const failedAdds: { row: number; reason: string }[] = [];
        for (const r of rowsToImport) {
          // set habit flags for recurrence creation (preserve any existing auto flag)
          {
            const prevFlags = (global as any).__habitFlags || {};
            (global as any).__habitFlags = {
              ...prevFlags,
              merge: !!r.habitMerge,
              ...(typeof r.habitAuto === 'boolean' ? { auto: r.habitAuto } : {}),
            };
          }
          const newTaskPayload: any = {
            title: r.title,
            description: r.description || '',
            start_at: r.start_at,
            end_at: r.end_at,
            priority: r.priority || 'medium',
            status: r.status || 'pending',
          };
          const reminderCfg = r.reminderEnabled
            ? { enabled: true, time: r.reminderTime || 0, method: r.reminderMethod || 'notification' }
            : { enabled: false, time: 0, method: 'notification' };
          const recurCfg = r.repeatEnabled
            ? { enabled: true, frequency: r.repeatFrequency || 'daily', interval: r.repeatInterval || 1, daysOfWeek: r.repeatDaysOfWeek || [], daysOfMonth: r.repeatDaysOfMonth || [], endDate: r.repeatEndDate }
            : { enabled: false, frequency: 'daily', interval: 1 };

          const ok = await handleAddTask(newTaskPayload, reminderCfg as any, recurCfg as any);
          if (!ok) {
            failedAdds.push({ row: (r.meta && (r.meta as any).originalRow) || 0, reason: `Không thể thêm dòng` });
            break;
          }
        }

        // Clear global flag
        delete (global as any).__skipTaskPrompts;

        if (failedAdds.length) {
          const lines = failedAdds.map(f => `Dòng ${f.row}: ${f.reason}`);
          setAlertState({ visible:true, tone:'error', title:'Lỗi khi thêm', message: lines.join('\n'), buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
          return;
        }

        // Success: reload data
        await loadTasks();
        await loadReminders();
        await loadRecurrences();
        setAlertState({ visible:true, tone:'success', title:'Hoàn tất', message:`Đã thêm ${rowsToImport.length} công việc.`, buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
        setShowImportDialog(false);
        setImportDialogPath('');
        setImportCandidateUri(null);
      };

      // Enforce: do not add rows with start_at < now + 1 hour. If such rows exist, ask user to continue (which will only import future rows) or cancel.
      const threshold = Date.now() + 60 * 60 * 1000;
      const earlyRows = mapped.filter(r => r.start_at && r.start_at < threshold);
      if (earlyRows.length > 0) {
        const count = earlyRows.length;
        const thresholdStr = new Date(threshold).toLocaleString();
        setAlertState({
          visible: true,
          tone: 'warning',
          title: 'Có công việc sớm hơn thời điểm cho phép',
          message: `Có ${count} công việc có 'Ngày bắt đầu' trước ${thresholdStr}. Những công việc này sẽ không được thêm. Bạn có muốn tiếp tục và chỉ lưu những công việc sau thời điểm này không?`,
          buttons: [
            { text: 'Tiếp tục', onPress: () => {
              const keep = mapped.filter(r => r.start_at && r.start_at >= threshold);
              if (keep.length === 0) {
                setAlertState({ visible:true, tone:'warning', title:'Không có hàng hợp lệ', message: `Không có công việc nào sau thời điểm ${thresholdStr} để thêm.`
, buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
                return;
              }
              doImport(keep);
            } },
            { text: 'Hủy', onPress: () => {}, tone: 'cancel' }
          ]
        });
        return;
      }

      // No early rows -> import all
      await doImport(mapped);
    } catch (e: any) {
      console.warn('importFromUri failed', e);
      const message = e && e.message ? String(e.message) : 'Không thể đọc tệp Excel. Vui lòng kiểm tra định dạng.';
      setAlertState({ visible:true, tone:'error', title:'Lỗi nhập tệp', message, buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
    }
  };

  const gotoImportIndex = (idx: number) => {
    if (idx < 0 || idx >= importRows.length) return;
    setImportIndex(idx);
    hydrateFromRow(importRows[idx]);
  };
  const onImportPrev = () => gotoImportIndex(importIndex - 1);
  const onImportNext = () => gotoImportIndex(importIndex + 1);

  const handleExportTemplate = async () => {
    try {
      await exportTemplate();
    } catch (e) {
      setAlertState({
        visible: true,
        tone: 'error',
        title: 'Lỗi xuất mẫu',
        message: 'Không thể tạo file mẫu Excel. Vui lòng thử lại.',
        buttons: [{ text: 'Đóng', onPress: () => {}, tone: 'cancel' }],
      });
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.background }}>
      <ConflictModal
        visible={conflictModal.visible}
        raw={conflictModal.raw}
        blocks={conflictModal.blocks}
        onProceed={() => {
          const r = conflictModal.resolver; 
          setConflictModal(c=>({...c, visible:false, resolver: undefined}));
          try { r && r(true); } catch {}
        }}
        onClose={() => {
          const r = conflictModal.resolver;
          setConflictModal(c=>({...c, visible:false, resolver: undefined}));
          try { r && r(false); } catch {}
        }}
      />
      <TaskAlertModal
        visible={alertState.visible}
        tone={alertState.tone}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onClose={()=> setAlertState(a=>({...a, visible:false}))}
      />
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{t.tasks?.title ?? 'My Tasks'}</Text>
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => setViewMode(viewMode === "list" ? "week" : "list")}
            style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.buttonBg, borderRadius: 6 }}
          >
            <Text style={{ color: colors.text }}>{viewMode === "list" ? (t.tasks?.viewCalendar ?? 'Calendar view') : (t.tasks?.viewList ?? 'List view')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Ô tìm kiếm + lọc */}
      <View style={{ marginBottom: 16 }}>
        <TextInput
          placeholder={t.tasks?.searchPlaceholder ?? 'Search tasks by title or description...'}
          value={search}
          onChangeText={setSearch}
          style={{ borderWidth: 1, borderColor: colors.inputBorder, padding: 8, borderRadius: 8, marginBottom: 8, backgroundColor: colors.surface, color: colors.text }}
          placeholderTextColor={colors.muted}
        />
        <View style={{ flexDirection: 'row', width: '100%' }} onLayout={(e)=> setFiltersWidth(e.nativeEvent.layout.width)}>
          <View style={{ width: filtersWidth ? (filtersWidth - 8) / 2 : undefined, marginRight: 8 }}>
            <CompactSelect
              value={priority}
              onChange={setPriority}
              options={PRIORITY_OPTIONS_FILTER}
              placeholder="Tất cả mức độ"
              fontSizeClassName="text-sm"
              buttonStyle={{ width: '100%' }}
              menuWidth={filtersWidth ? (filtersWidth - 8) / 2 : undefined}
            />
          </View>
          <View style={{ width: filtersWidth ? (filtersWidth - 8) / 2 : undefined }}>
            <CompactSelect
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS_FILTER}
              placeholder="Tất cả trạng thái"
              fontSizeClassName="text-sm"
              buttonStyle={{ width: '100%' }}
              menuWidth={filtersWidth ? (filtersWidth - 8) / 2 : undefined}
            />
          </View>
        </View>
      </View>

      {/* Hiển thị theo view mode */}
      {viewMode === "week" ? (
        <TaskWeekView
          filteredTasks={filteredTasks}
          currentWeekStart={currentWeekStart}
          setCurrentWeekStart={setCurrentWeekStart}
          setDetailTask={setDetailTask}
          setShowDetail={setShowDetail}
          recurrences={recurrences}
        />
      ) : (
        <TaskListView
          filteredTasks={filteredTasks}
          search={search}
          reminders={reminders}
          recurrences={recurrences}
          REPEAT_OPTIONS={REPEAT_LOCALIZED.length ? REPEAT_LOCALIZED : REPEAT_OPTIONS}
          editTask={editTask}
          openEditModal={openEditModal}
          handleDeleteTask={onDeleteTask}
          loading={loading}
          onInlineAlert={({ tone, title, message }) =>
            setAlertState({
              visible: true,
              tone,
              title,
              message,
              buttons: [{ text: t.settings.close, onPress: () => {}, tone: 'cancel' }],
            })
          }
        />
      )}

      {/* Modal thêm/sửa */}
      <TaskModal
        visible={showModal}
        onClose={() => {
          setShowModal(false);
          setEditId(null);
          setAddTaskStartTime(null);
          // inputMode removed
          setImportMode(false);
          setImportRows([]);
          setImportIndex(0);
        }}
        onInlineAlert={({ tone, title, message }: any)=> setAlertState({ visible:true, tone, title, message, buttons:[{ text: t.settings.close, onPress:()=>{}, tone:'cancel'}] })}
  // inputMode props removed
        editId={editId}
        setEditId={setEditId}
        newTask={newTask}
        setNewTask={setNewTask}
        handleAddTask={onAddTask}
        handleEditTask={onEditTask}
        reminder={reminder}
        setReminder={setReminder}
        reminderTime={reminderTime}
        setReminderTime={setReminderTime}
        reminderMethod={reminderMethod}
        setReminderMethod={setReminderMethod}
        repeat={repeat}
        setRepeat={setRepeat}
        repeatFrequency={repeatFrequency}
        setRepeatFrequency={setRepeatFrequency}
        repeatInterval={repeatInterval}
        setRepeatInterval={setRepeatInterval}
        repeatDaysOfWeek={repeatDaysOfWeek}
        setRepeatDaysOfWeek={setRepeatDaysOfWeek}
        repeatDaysOfMonth={repeatDaysOfMonth}
        setRepeatDaysOfMonth={setRepeatDaysOfMonth}
        repeatEndDate={repeatEndDate}
        setRepeatEndDate={setRepeatEndDate}
        showStartPicker={showStartPicker}
        setShowStartPicker={setShowStartPicker}
        showEndPicker={showEndPicker}
        setShowEndPicker={setShowEndPicker}
        showRepeatStartPicker={showRepeatStartPicker}
        setShowRepeatStartPicker={setShowRepeatStartPicker}
        showRepeatEndPicker={showRepeatEndPicker}
        setShowRepeatEndPicker={setShowRepeatEndPicker}
        PRIORITY_OPTIONS={PRIORITY_LOCALIZED}
        REMINDER_OPTIONS={REMINDER_LOCALIZED}
        REPEAT_OPTIONS={REPEAT_LOCALIZED}
        onPickExcel={handlePickExcel}
        importMode={importMode}
        importIndex={importIndex}
        importTotal={importRows.length}
        importErrors={importMode ? computeImportErrors(importRows[importIndex] || {}) : []}
        onImportPrev={onImportPrev}
        onImportNext={onImportNext}
      />

      {/* Modal chi tiết công việc: dùng component TaskDetailModal để tránh trùng lặp UI */}
      <TaskDetailModal
        visible={showDetail}
        task={detailTask}
        allTasks={tasks}
        reminders={reminders}
        recurrences={recurrences}
        onClose={() => setShowDetail(false)}
        onInlineAlert={({ tone, title, message }) =>
          setAlertState({
            visible: true,
            tone,
            title,
            message,
            buttons: [{ text: t.settings.close, onPress: () => {}, tone: 'cancel' }],
          })
        }
        onStatusChange={async (taskId, status) => {
          // compute cutoff-aware metadata when marking completed
          const extra: any = { status };
          if (status === 'completed') {
            const now = Date.now();
            extra.completed_at = new Date(now).toISOString();
            try {
              const task = tasks.find(t => t.id === taskId);
              if (task) {
                const dateMs = task.start_at ? (typeof task.start_at === 'string' ? Date.parse(task.start_at) : task.start_at) : (task.end_at ? (typeof task.end_at === 'string' ? Date.parse(task.end_at) : task.end_at) : null);
                if (dateMs != null && isSameLocalDate(dateMs, now)) {
                  const cutoffStr = await AsyncStorage.getItem(CUT_OFF_KEY);
                  const cutoffMs = cutoffForDateFromString(cutoffStr, new Date(dateMs));
                  const effective = cutoffMs != null ? Math.max(dateMs, cutoffMs) : dateMs;
                  const diffMinutes = Math.round((now - effective) / 60000);
                  const completion_status = diffMinutes <= 0 ? 'on_time' : 'late';
                  extra.completion_diff_minutes = diffMinutes;
                  extra.completion_status = completion_status;
                }
              }
            } catch (e) {
              // ignore
            }
          } else {
            // clearing completion metadata when switching away from completed
            extra.completed_at = undefined;
            extra.completion_diff_minutes = undefined;
            extra.completion_status = undefined;
          }
          await editTask(taskId, extra);
          setDetailTask((prev) => (prev && prev.id === taskId ? { ...prev, status } : prev));
          await loadTasks();
        }}
        onEdit={(task) => {
          setShowDetail(false);
          openEditModal(task);
        }}
        onDelete={async (taskId) => {
          await onDeleteTask(taskId);
          setShowDetail(false);
        }}
      />

      {/* Add choice modal (thêm thủ công / nhập bằng file) */}
      <Modal visible={showAddChoice} transparent animationType="fade">
        <View style={{ flex:1, backgroundColor:colors.overlay, justifyContent:'center', alignItems:'center' }}>
          <View style={{ width:320, backgroundColor:colors.surface, borderRadius:8, padding:16, borderWidth:1, borderColor:colors.cardBorder }}>
            <Text style={{ fontSize:18, fontWeight:'600', marginBottom:12, color: colors.text }}>{t.tasks?.addTask ?? 'Add Task'}</Text>
            <TouchableOpacity onPress={() => { setShowAddChoice(false); openAddModal(); }} style={{ padding:12, backgroundColor:colors.buttonBg, borderRadius:6, marginBottom:8 }}>
              <Text style={{ color: colors.text }}>{t.tasks?.addManual ?? 'Add manually'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowAddChoice(false); setShowImportDialog(true); }} style={{ padding:12, backgroundColor:colors.buttonBg, borderRadius:6, marginBottom:8 }}>
              <Text style={{ color: colors.text }}>{t.tasks?.addFromFile ?? 'Import from file'}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop:8 }}>
              <TouchableOpacity onPress={() => setShowAddChoice(false)} style={{ padding:8 }}>
                <Text style={{ color: colors.text }}>{t.settings.close}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import dialog modal (path + browse + actions) */}
      <Modal visible={showImportDialog} transparent animationType="fade">
        <View style={{ flex:1, backgroundColor:colors.overlay, justifyContent:'center', alignItems:'center' }}>
          <View style={{ width:680, maxWidth:'95%', backgroundColor:colors.surface, borderRadius:8, padding:18, borderWidth:1, borderColor:colors.cardBorder }}>
            <Text style={{ fontSize:18, fontWeight:'600', marginBottom:12, color: colors.text }}>{t.tasks?.importFromExcel ?? 'Import data from Excel'}</Text>
            <Text style={{ marginBottom:6, color: colors.text }}>{t.tasks?.pathLabel ?? 'Path'}</Text>
            <View style={{ flexDirection:'row', alignItems:'center', marginBottom:12 }}>
              <TextInput value={importDialogPath} onChangeText={setImportDialogPath} placeholder={t.tasks?.filePathPlaceholder ?? 'File path'} style={{ flex:1, borderWidth:1, borderColor:colors.inputBorder, padding:8, borderRadius:4, marginRight:8, backgroundColor: colors.inputBg, color: colors.text }} />
              <TouchableOpacity onPress={async ()=>{
                try {
                  const res = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'] });
                  if (!res.canceled) {
                    const file = res.assets[0];
                    setImportDialogPath(file.uri);
                    setImportCandidateUri(file.uri);
                  }
                } catch (e) {
                  console.warn('picker fail', e);
                }
              }} style={{ width:44, height:44, backgroundColor:colors.buttonBg, borderRadius:4, alignItems:'center', justifyContent:'center' }}>
                <Text>...</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height:1, backgroundColor:colors.cardBorder, marginVertical:8 }} />
            <View style={{ flexDirection:'row', justifyContent:'flex-end' }}>
              <TouchableOpacity onPress={handleExportTemplate} style={{ paddingVertical:10, paddingHorizontal:14, marginRight:8, backgroundColor:colors.buttonBg, borderRadius:6 }}>
                <Text style={{ color: colors.text }}>{t.tasks?.downloadTemplate ?? 'Download template'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async ()=>{
                // If user picked a file via browse, prefer that; otherwise use typed path
                const uri = importCandidateUri || importDialogPath;
                if (!uri) {
                  setAlertState({ visible:true, tone:'warning', title: (t.tasks?.noFile ?? 'No file'), message: (t.tasks?.chooseFileMsg ?? 'Please choose a file to import.'), buttons:[{ text: t.settings.close, onPress:()=>{}, tone:'cancel' }] });
                  return;
                }
                await handleImportFromUri(uri);
              }} style={{ paddingVertical:10, paddingHorizontal:14, marginRight:8, backgroundColor:colors.primary, borderRadius:6 }}>
                <Text style={{ color:'#fff' }}>{t.tasks?.confirm ?? 'Confirm'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowImportDialog(false); setImportDialogPath(''); setImportCandidateUri(null); }} style={{ paddingVertical:10, paddingHorizontal:14, backgroundColor:colors.danger, borderRadius:6 }}>
                <Text style={{ color:'#fff' }}>{t.tasks?.cancel ?? 'Cancel'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Nút thêm nhanh */}
      <View style={{ position: 'absolute', bottom: 40, right: 48, zIndex: 10 }}>
        <TouchableOpacity
          onPress={() => setShowAddChoice(true)}
          style={{ backgroundColor: '#2563eb', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
          activeOpacity={0.7}
        >
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
