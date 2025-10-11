import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import { useTasks } from "../hooks/useTasks";
import { useReminders } from "../hooks/useReminders";
import { useRecurrences } from "../hooks/useRecurrences";
import { useSchedules } from "../hooks/useSchedules";
import { useTaskOperations } from "../hooks/useTaskOperations";
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import * as Sharing from 'expo-sharing';
import { Buffer } from 'buffer';
import { checkRecurringConflicts, checkTimeConflicts } from "../utils/taskValidation";
import ConflictModal from "../components/tasks/ConflictModal";
import TaskAlertModal from "../components/tasks/TaskAlertModal";
import CompactSelect from "../components/tasks/CompactSelect";
import TaskModal from "../components/tasks/TaskModal";
import TaskDetailModal from "../components/tasks/TaskDetailModal";
import TaskListView from "../components/tasks/TaskListView";
import TaskWeekView from "../components/tasks/TaskWeekView";
import type { Task } from "../types/Task";
import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  REMINDER_OPTIONS,
  REPEAT_OPTIONS,
} from "../constants/taskConstants";
// Hỗ trợ nhập/xuất Excel

export default function TasksScreen() {
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
  const [conflictModal, setConflictModal] = useState<{ visible: boolean; raw: string; blocks: any[] }>({ visible:false, raw:'', blocks:[] });
  const [alertState, setAlertState] = useState<{ visible:boolean; tone:'error'|'warning'|'success'|'info'; title:string; message:string; buttons:{ text:string; onPress:()=>void; tone?:any }[] }>({ visible:false, tone:'info', title:'', message:'', buttons:[] });
  const { handleAddTask, handleEditTask, handleDeleteTask } = useTaskOperations(
    tasks,
    schedules,
    {
      onConflict: ({ raw, blocks, resolve }) => {
        setConflictModal({ visible:true, raw, blocks });
        resolve(false);
      },
      onNotify: ({ tone, title, message }) => {
        setAlertState({ visible:true, tone, title, message, buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel'}] });
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
          setReminderTime(REMINDER_OPTIONS[0].value);
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
        setReminderTime(REMINDER_OPTIONS[0].value);
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
  setReminderTime(REMINDER_OPTIONS[0].value);
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
  const PRIORITY_OPTIONS_FILTER = useMemo(() => ([{ label: "Tất cả mức độ", value: "" }, ...PRIORITY_OPTIONS]), []);
  const STATUS_OPTIONS_FILTER = useMemo(() => ([{ label: "Tất cả trạng thái", value: "" }, ...STATUS_OPTIONS]), []);
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
    setReminderTime(REMINDER_OPTIONS[0].value);
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
      setReminderTime(taskReminder.remind_before ?? REMINDER_OPTIONS[0].value);
      setReminderMethod(taskReminder.method ?? 'notification');
    } else {
      setReminder(false);
      setReminderTime(REMINDER_OPTIONS[0].value);
      setReminderMethod('notification');
    }

    // Tìm recurrence của task này
    if (item.recurrence_id) {
      const rec = recurrences.find((r) => r.id === item.recurrence_id);
      if (rec) {
        setRepeat(true);
        setRepeatFrequency(rec.type ?? 'daily');
        setRepeatInterval(rec.interval ?? 1);
        setRepeatDaysOfWeek(rec.days_of_week ? JSON.parse(rec.days_of_week) : []);
        setRepeatDaysOfMonth(rec.day_of_month ? JSON.parse(rec.day_of_month) : []);
        setRepeatStartDate(rec.start_date ? new Date(rec.start_date).getTime() : undefined);
        setRepeatEndDate(rec.end_date ? new Date(rec.end_date).getTime() : undefined);
        // Prefill habit flags for TaskModal switches
        // If merge is enabled, force auto to false and prevent user from enabling it
        const mergeFlag = rec.merge_streak === 1;
        (global as any).__habitFlags = {
          auto: mergeFlag ? false : rec.auto_complete_expired === 1,
          merge: mergeFlag,
        };
      } else {
        setRepeat(false);
        setRepeatFrequency('daily');
        setRepeatInterval(1);
        setRepeatDaysOfWeek([]);
        setRepeatDaysOfMonth([]);
        setRepeatStartDate(undefined);
        setRepeatEndDate(undefined);
      }
    } else {
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

  // Helpers for import/export template (Vietnamese time format)
  const parseViDateTime = (s: string): number => {
    if (!s) return NaN;
    const m = s.trim().match(/^(\d{1,2}):(\d{2})-(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return NaN;
    const [, hh, mm, dd, MM, yyyy] = m;
    const d = new Date(
      Number(yyyy),
      Number(MM) - 1,
      Number(dd),
      Number(hh),
      Number(mm),
      0,
      0
    );
    return d.getTime();
  };

  // ===== Excel import/export state & helpers =====
  type ParsedRow = {
    title: string;
    description?: string;
    start_at?: number;
    end_at?: number;
    priority?: 'low'|'medium'|'high';
    status?: 'pending'|'in-progress'|'completed';
    reminderEnabled?: boolean;
    reminderTime?: number;
    reminderMethod?: 'notification'|'alarm';
    repeatEnabled?: boolean;
    repeatFrequency?: 'daily'|'weekly'|'monthly'|'yearly';
    repeatInterval?: number;
    repeatDaysOfWeek?: string[];
    repeatDaysOfMonth?: string[];
    repeatEndDate?: number;
    yearlyCount?: number;
    habitAuto?: boolean;
    habitMerge?: boolean;
    meta?: {
      usedCombined?: boolean;
      validStartDate?: boolean;
      validStartTime?: boolean;
      validEndTime?: boolean;
    };
  };

  const [importMode, setImportMode] = useState(false);
  const [importRows, setImportRows] = useState<ParsedRow[]>([]);
  const [importIndex, setImportIndex] = useState(0);

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

  const combineDateTimeMs = (dateMs?: number, time?: { h: number; m: number }): number | undefined => {
    if (dateMs == null || !time) return undefined;
    const d = new Date(dateMs);
    d.setHours(time.h, time.m, 0, 0);
    return d.getTime();
  };
  const mapDowVi = (token: string): string | null => {
    const t = token.trim().toLowerCase();
    if (t === 't2' || t.includes('thứ 2') || t.includes('thu 2')) return 'Mon';
    if (t === 't3' || t.includes('thứ 3') || t.includes('thu 3')) return 'Tue';
    if (t === 't4' || t.includes('thứ 4') || t.includes('thu 4')) return 'Wed';
    if (t === 't5' || t.includes('thứ 5') || t.includes('thu 5')) return 'Thu';
    if (t === 't6' || t.includes('thứ 6') || t.includes('thu 6')) return 'Fri';
    if (t === 't7' || t.includes('thứ 7') || t.includes('thu 7')) return 'Sat';
    if (t === 'cn' || t.includes('chủ nhật') || t.includes('chu nhat')) return 'Sun';
    return null;
  };
  const parseDowsVi = (s: any): string[] => {
    if (!s) return [];
    return String(s).split(',').map(x=>mapDowVi(x)).filter((x): x is string => !!x);
  };
  const parseDomList = (s: any): string[] => {
    if (!s) return [];
    return String(s).split(',').map(t=> t.trim()).filter(Boolean);
  };

  // Normalize header: remove diacritics & parentheses notes
  const normalize = (s: string) => s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const getCell = (row: any, primary: string, aliases: string[] = []): any => {
    const target = normalize(primary);
    const keys = Object.keys(row);
    for (const k of keys) {
      const nk = normalize(String(k));
      if (nk === target || aliases.some(a => normalize(a) === nk)) return row[k];
    }
    return undefined;
  };

  const mapRow = (row: any): ParsedRow => {
    const title = getCell(row, 'Tiêu đề', ['Tieu de','Title']) || '';
    const description = getCell(row, 'Mô tả', ['Mo ta','Description']) || '';
    // New columns
    const startDateMs = parseDateOnlyVi(getCell(row, 'Ngày bắt đầu', ['Ngay bat dau']));
    const startTimeObj = parseTimeVi(getCell(row, 'Giờ bắt đầu', ['Gio bat dau']));
    const endTimeObj = parseTimeVi(getCell(row, 'Giờ kết thúc', ['Gio ket thuc']));
  let start_at = combineDateTimeMs(startDateMs, startTimeObj);
  let end_at = combineDateTimeMs(startDateMs, endTimeObj);
    const meta = {
      hasStartDate: getCell(row, 'Ngày bắt đầu', ['Ngay bat dau']) != null && String(getCell(row, 'Ngày bắt đầu', ['Ngay bat dau']) || '').trim() !== '',
      hasStartTime: getCell(row, 'Giờ bắt đầu', ['Gio bat dau']) != null && String(getCell(row, 'Giờ bắt đầu', ['Gio bat dau']) || '').trim() !== '',
      hasEndTime: getCell(row, 'Giờ kết thúc', ['Gio ket thuc']) != null && String(getCell(row, 'Giờ kết thúc', ['Gio ket thuc']) || '').trim() !== '',
      validStartDate: startDateMs != null,
      validStartTime: !!startTimeObj,
      validEndTime: !!endTimeObj,
      usedCombined: false,
    };
    // Fallback to old combined columns if new ones missing/invalid
    if ((start_at == null || end_at == null) && (!meta.hasStartDate || !meta.hasStartTime || !meta.hasEndTime)) {
      const combinedStart = getCell(row, 'Bắt đầu', ['Bat dau','Start']);
      const combinedEnd = getCell(row, 'Kết thúc', ['Ket thuc','End']);
      const s = parseViDateTime(String(combinedStart || ''));
      const e = parseViDateTime(String(combinedEnd || ''));
      if (!isNaN(s)) start_at = s;
      if (!isNaN(e)) end_at = e;
      if (!isNaN(s) || !isNaN(e)) meta.usedCombined = true;
    }
  const priority = mapPriorityVi(getCell(row, 'Mức độ', ['Muc do','Priority']));
    const reminderEnabled = parseBooleanVi(getCell(row, 'Bật nhắc nhở', ['Bat nhac nho','Reminder']));
    const reminderTime = parseLeadVi(getCell(row, 'Nhắc trước', ['Nhac truoc','Reminder time']));
    const reminderMethod = ((): 'notification'|'alarm' => {
      const v = String(getCell(row, 'Phương thức nhắc', ['Phuong thuc nhac','Reminder method']) || '').toLowerCase();
      if (v.includes('chuông') || v.includes('chuong') || v.includes('alarm')) return 'alarm';
      return 'notification';
    })();
    const repeatEnabled = parseBooleanVi(getCell(row, 'Bật lặp lại', ['Lap lai','Repeat']));
    const repeatFrequency = mapFrequencyVi(getCell(row, 'Lặp theo', ['Lap theo','Frequency']));
  const repeatInterval = 1; // fixed default, no column needed
    const repeatDaysOfWeek = parseDowsVi(getCell(row, 'Ngày trong tuần', ['Ngay trong tuan','DOW']));
    const repeatDaysOfMonth = parseDomList(getCell(row, 'Ngày trong tháng', ['Ngay trong thang','DOM']));
    const yearlyCountRaw = getCell(row, 'Số lần lặp', ['So lan lap','Yearly count']);
    const yearlyCount = yearlyCountRaw ? Math.max(1, Math.min(100, parseInt(String(yearlyCountRaw),10) || 1)) : undefined;
    const repeatEndDate = parseDateOnlyVi(getCell(row, 'Ngày kết thúc lặp', ['Ngay ket thuc lap','Repeat end']));
    const habitAuto = parseBooleanVi(getCell(row, 'Tự động hoàn thành khi hết hạn', ['Tu dong hoan thanh khi het han','Auto complete expired']));
    const habitMerge = parseBooleanVi(getCell(row, 'Gộp nhiều ngày', ['Gop nhieu ngay','Merge streak']));

    const startNum = typeof start_at === 'number' ? start_at : undefined;
    const endNum = typeof end_at === 'number' ? end_at : undefined;
    return {
      title: String(title),
      description: String(description),
      start_at: startNum,
      end_at: endNum,
  priority,
      reminderEnabled,
      reminderTime,
      reminderMethod,
      repeatEnabled,
      repeatFrequency,
      repeatInterval,
      repeatDaysOfWeek,
      repeatDaysOfMonth,
      repeatEndDate,
      yearlyCount,
      habitAuto,
      habitMerge,
      meta,
    };
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
    setReminderTime(r.reminderTime ?? REMINDER_OPTIONS[0].value);
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
    (global as any).__habitFlags = { auto: !!r.habitAuto, merge: !!r.habitMerge };
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
        const tasksForCheck = [...tasks, ...syntheticTasks];
        if (rec && rec.enabled && rec.endDate) {
          const { hasConflict, conflictMessage } = checkRecurringConflicts(r.start_at, r.end_at, tasksForCheck as any, schedules as any, rec);
          if (hasConflict) errs.push(`Xung đột với lịch/công việc khác:\n${conflictMessage}`);
        } else {
          const { hasConflict, conflictMessage } = checkTimeConflicts(r.start_at, r.end_at, tasksForCheck as any, schedules as any);
          if (hasConflict) errs.push(`Xung đột với lịch/công việc khác:\n${conflictMessage}`);
        }
      }
    } catch {}
    return errs;
  };

  const handlePickExcel = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'] });
      if (res.canceled) return;
      const file = res.assets[0];
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' as any });
      const wb = XLSX.read(base64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const mapped = (rows as any[]).map(mapRow);
      if (!mapped.length) {
        setAlertState({ visible:true, tone:'warning', title:'Tệp rỗng', message:'Không tìm thấy dữ liệu trong file Excel.', buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
        return;
      }
      setImportRows(mapped);
      setImportIndex(0);
      setImportMode(true);
      hydrateFromRow(mapped[0]);
      setShowModal(true);
    } catch (e) {
      setAlertState({ visible:true, tone:'error', title:'Lỗi nhập tệp', message: 'Không thể đọc tệp Excel. Vui lòng kiểm tra định dạng.', buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel' }] });
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
      const headers = [
        'Tiêu đề',
        'Mô tả',
        'Ngày bắt đầu (dd/MM/yyyy)',
        'Giờ bắt đầu (HH:MM)',
        'Giờ kết thúc (HH:MM)',
        'Mức độ (Thấp/Trung bình/Cao)',
        'Bật nhắc nhở (Có/Không)',
        'Nhắc trước (vd: 15 phút, 2 giờ, 1 ngày)',
        'Phương thức nhắc (Thông báo/Chuông báo)',
        'Bật lặp lại (Có/Không)',
        'Lặp theo (Ngày/Tuần/Tháng/Năm)',
        'Ngày trong tuần (T2,T3,...,CN)',
        'Ngày trong tháng (1..31)',
        'Ngày kết thúc lặp (dd/MM/yyyy)',
        'Số lần lặp (1..100, dùng khi Lặp theo=Năm)',
        'Tự động hoàn thành khi hết hạn (Có/Không)',
        'Gộp nhiều ngày (Có/Không)',
      ];
      // Create Excel workbook with headers only (no sample rows)
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      (ws as any)['!cols'] = headers.map(() => ({ wch: 28 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Mau');
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      // Prepare an HTML-backed .doc (Word can open HTML files) with UTF-8 encoding to avoid RTF encoding issues
      const htmlParts: string[] = [];
      htmlParts.push('<!doctype html>');
      htmlParts.push('<html><head><meta charset="utf-8"><title>Hướng dẫn nhập file Excel</title>');
      htmlParts.push('<style>body{font-family:Arial,helvetica,sans-serif;font-size:14px;line-height:1.4;color:#111}</style>');
      htmlParts.push('</head><body>');
      htmlParts.push('<h1>Hướng dẫn sử dụng file Excel - Mẫu nhập công việc</h1>');
      htmlParts.push('<h2>Các cột (vui lòng giữ nguyên tiêu đề cột)</h2>');
      htmlParts.push('<ul>');
      headers.forEach(h => {
        htmlParts.push(`<li><strong>${h}</strong><br/>`);
        switch (h) {
          case 'Tiêu đề':
            htmlParts.push('Bắt buộc. Chuỗi text, mô tả ngắn cho công việc.');
            break;
          case 'Mô tả':
            htmlParts.push('Tùy chọn. Mô tả chi tiết hơn.');
            break;
          case 'Ngày bắt đầu (dd/MM/yyyy)':
            htmlParts.push('Bắt buộc khi có giờ bắt đầu; định dạng dd/MM/yyyy, ví dụ: 10/10/2025.');
            break;
          case 'Giờ bắt đầu (HH:MM)':
            htmlParts.push('Định dạng 24h HH:MM, ví dụ: 08:00. Nếu không có giờ, để trống.');
            break;
          case 'Giờ kết thúc (HH:MM)':
            htmlParts.push('Định dạng 24h HH:MM, phải lớn hơn giờ bắt đầu cùng ngày.');
            break;
          case 'Mức độ (Thấp/Trung bình/Cao)':
            htmlParts.push('Giá trị: Thấp, Trung bình hoặc Cao (không phân biệt hoa thường).');
            break;
          case 'Bật nhắc nhở (Có/Không)':
            htmlParts.push('Có hoặc Không. Nếu Có, hãy chỉ định cột "Nhắc trước".');
            break;
          case 'Nhắc trước (vd: 15 phút, 2 giờ, 1 ngày)':
            htmlParts.push('Khoảng cách trước thời gian bắt đầu. Hỗ trợ đơn vị: phút, giờ, ngày. Ví dụ: "15 phút", "2 giờ", "1 ngày".');
            break;
          case 'Phương thức nhắc (Thông báo/Chuông báo)':
            htmlParts.push('Chọn "Thông báo" hoặc "Chuông báo".');
            break;
          case 'Bật lặp lại (Có/Không)':
            htmlParts.push('Có hoặc Không. Nếu Có, vui lòng cung cấp các cột lặp theo bên dưới.');
            break;
          case 'Lặp theo (Ngày/Tuần/Tháng/Năm)':
            htmlParts.push('Giá trị: Ngày, Tuần, Tháng hoặc Năm.');
            break;
          case 'Ngày trong tuần (T2,T3,...,CN)':
            htmlParts.push('Dùng khi lặp theo Tuần. Liệt kê các ngày, ví dụ: T2,T4,T6.');
            break;
          case 'Ngày trong tháng (1..31)':
            htmlParts.push('Dùng khi lặp theo Tháng. Liệt kê các ngày ví dụ: 1,15,28.');
            break;
          case 'Ngày kết thúc lặp (dd/MM/yyyy)':
            htmlParts.push('Không được để trống');
            break;
          case 'Số lần lặp (1..100, dùng khi Lặp theo=Năm)':
            htmlParts.push('Chỉ dùng khi Lặp theo = Năm. Số nguyên 1..100.');
            break;
          case 'Tự động hoàn thành khi hết hạn (Có/Không)':
            htmlParts.push('Có: khoá hoàn thành tự động khi chu kỳ kết thúc. Không: người dùng phải đánh dấu thủ công. Không thể bật cùng lúc với gộp nhiều ngảy');
            break;
          case 'Gộp nhiều ngày (Có/Không)':
            htmlParts.push('Có: các ngày lặp trong một công việc tính là 1 đơn vị hoàn thành (merge streak).');
            break;
          default:
            htmlParts.push('');
        }
        htmlParts.push('</li>');
      });
      htmlParts.push('</ul>');
      htmlParts.push('<h3>Một số lưu ý và quy tắc</h3>');
      htmlParts.push('<ul>');
      htmlParts.push('<li>Nếu dùng cột Ngày bắt đầu, hãy chắc chắn định dạng dd/MM/yyyy.</li>');
      htmlParts.push('<li>Giờ kết thúc phải sau giờ bắt đầu; nếu không, hệ thống sẽ báo lỗi khi nhập.</li>');
      htmlParts.push('<li>Giá trị lặp hàng năm phải nhập Số lần lặp thay vì ngày kết thúc.</li>');
      htmlParts.push('<li>Ngày kết thúc lặp không được trước ngày bắt đầu.</li>');
      htmlParts.push('<li>Trường Tiêu đề là bắt buộc; những dòng thiếu tiêu đề sẽ bị xem là lỗi.</li>');
      htmlParts.push('<li>Để không tạo nhắc, đặt Bật nhắc nhở = Không.</li>');
      htmlParts.push('</ul>');
      htmlParts.push('<h3>Ví dụ hợp lệ</h3>');
      // Render examples as two stacked HTML tables. Ensure the split happens so that
      // the 'Lặp theo' column starts the second table (so it "xuống hàng tiếp").
      // Fallback to splitting at 'Mức độ' or in half if neither is found.
      const idxRepeat = headers.findIndex(h => String(h).toLowerCase().includes('lặp theo') || String(h).toLowerCase().includes('lap theo'));
      let leftHeaders: string[] = [];
      let rightHeaders: string[] = [];
      if (idxRepeat > 0) {
        // put columns before 'Lặp theo' on the left; 'Lặp theo' and after on the right
        leftHeaders = headers.slice(0, idxRepeat);
        rightHeaders = headers.slice(idxRepeat);
      } else {
        // fallback: look for 'Mức độ' split point
        const splitIndex = Math.max(0, headers.findIndex(h => String(h).toLowerCase().includes('mức độ') || String(h).toLowerCase().includes('muc do')));
        const mid = splitIndex > 0 ? splitIndex : Math.floor(headers.length / 2);
        leftHeaders = headers.slice(0, mid + 1); // include the 'Mức độ' column on the left table
        rightHeaders = headers.slice(mid + 1);
      }

      const sample1 = ['Ôn tập Toán','Chương 1: Hàm số','10/10/2025','08:00','09:00','Trung bình','Có','15 phút','Thông báo','Có','Ngày','','','31/10/2025','','Có','Không'];
      const sample2 = ['Chạy bộ buổi sáng','5km trong khuôn viên','11/10/2025','06:00','06:45','Cao','Có','10 phút','Chuông báo','Có','Tuần','T2,T4,T6','','30/11/2025','','Không','Có'];
      const rows = [sample1, sample2];

      const renderTable = (tblHeaders: string[], tblRows: any[][]) => {
        const cnt = tblHeaders.length || 1;
        const w = Math.floor(100 / cnt);
  // center table within Word margins and leave small side gutters
  htmlParts.push('<div style="max-width:100%;overflow:hidden;margin:8px auto">');
  htmlParts.push('<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:95%;margin:0 auto;table-layout:fixed">');
        htmlParts.push('<thead style="background:#f3f4f6"><tr>');
  tblHeaders.forEach(h => htmlParts.push(`<th style="text-align:center;padding:6px;vertical-align:middle;width:${w}%;word-wrap:break-word;overflow-wrap:break-word;white-space:normal">${h}</th>`));
        htmlParts.push('</tr></thead>');
        htmlParts.push('<tbody>');
        tblRows.forEach((r: any[]) => {
          htmlParts.push('<tr>');
          r.forEach((cell: any) => htmlParts.push(`<td style="padding:6px;vertical-align:middle;text-align:center;word-wrap:break-word;overflow-wrap:break-word;white-space:normal">${cell || ''}</td>`));
          htmlParts.push('</tr>');
        });
        htmlParts.push('</tbody></table></div>');
      };

      // Build left table rows (first N columns)
      const leftRows = rows.map(r => r.slice(0, leftHeaders.length));
      renderTable(leftHeaders, leftRows);
      // If right side exists, render a second stacked table with remaining columns
      if (rightHeaders.length > 0) {
        const rightRows = rows.map(r => r.slice(leftHeaders.length));
        renderTable(rightHeaders, rightRows);
      }
      htmlParts.push('</body></html>');
      const htmlContent = htmlParts.join('\n');

      const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
      const excelUri = dir + 'mau-cong-viec.xlsx';
      const instrUri = dir + 'huongDanNhap.doc';

      await FileSystem.writeAsStringAsync(excelUri, wbout, { encoding: (FileSystem as any).EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(instrUri, htmlContent, { encoding: (FileSystem as any).EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        // Try sharing Excel first, then instructions. The share UI will appear twice.
        await Sharing.shareAsync(excelUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Chia sẻ mẫu Excel',
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
        } as any);
        // Small delay to ensure share sheet finishes on some platforms
        await new Promise((res) => setTimeout(res, 400));
        await Sharing.shareAsync(instrUri, {
          mimeType: 'application/msword',
          dialogTitle: 'Chia sẻ hướng dẫn (Word)',
          UTI: 'com.microsoft.word.doc',
        } as any);
      } else {
        setAlertState({
          visible: true,
          tone: 'info',
          title: 'Đã tạo file mẫu và hướng dẫn',
          message: `Files đã được lưu tại:\nExcel: ${excelUri}\nHướng dẫn: ${instrUri}`,
          buttons: [{ text: 'Đóng', onPress: () => {}, tone: 'cancel' }],
        });
      }
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
    <View className="flex-1 p-4 bg-white">
      <ConflictModal
        visible={conflictModal.visible}
        raw={conflictModal.raw}
        blocks={conflictModal.blocks}
        onClose={() => setConflictModal(c=>({...c, visible:false}))}
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
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-bold">Công việc của tôi</Text>
        <View className="flex-row items-center">
          <TouchableOpacity onPress={handleExportTemplate} className="px-3 py-2 bg-blue-200 rounded mr-2">
            <Text>Xuất mẫu</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePickExcel} className="px-3 py-2 bg-green-200 rounded mr-2">
            <Text>Nhập Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode(viewMode === "list" ? "week" : "list")}
            className="px-3 py-2 bg-gray-200 rounded"
          >
            <Text>{viewMode === "list" ? "Dạng lịch" : "Dạng danh sách"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Ô tìm kiếm + lọc */}
      <View className="mb-4">
        <TextInput
          placeholder="Tìm kiếm công việc theo tiêu đề hoặc mô tả..."
          value={search}
          onChangeText={setSearch}
          className="border p-2 rounded mb-2"
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
          reminders={reminders}
          recurrences={recurrences}
          REPEAT_OPTIONS={REPEAT_OPTIONS}
          editTask={editTask}
          openEditModal={openEditModal}
          handleDeleteTask={onDeleteTask}
          loading={loading}
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
        onInlineAlert={({ tone, title, message }: any)=> setAlertState({ visible:true, tone, title, message, buttons:[{ text:'Đóng', onPress:()=>{}, tone:'cancel'}] })}
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
        PRIORITY_OPTIONS={PRIORITY_OPTIONS}
        REMINDER_OPTIONS={REMINDER_OPTIONS}
        REPEAT_OPTIONS={REPEAT_OPTIONS}
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
        reminders={reminders}
        recurrences={recurrences}
        onClose={() => setShowDetail(false)}
        onStatusChange={async (taskId, status) => {
          await editTask(taskId, { status });
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

      {/* Nút thêm nhanh */}
      <View className="absolute bottom-10 right-12 z-10">
        <TouchableOpacity
          onPress={openAddModal}
          className="bg-blue-600 w-14 h-14 rounded-full items-center justify-center shadow-lg"
          activeOpacity={0.7}
        >
          <Text className="text-white text-3xl">+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
