import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { useTasks } from "../hooks/useTasks";
import type { Task } from "../types/Task";
import { useReminders } from "../hooks/useReminders";
import { useRecurrences } from "../hooks/useRecurrences";
import FilterPicker from "../components/SelectBox";
import TaskModal from "../components/TaskModal";
import TaskItem from "../components/TaskItem";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";

const PRIORITY_OPTIONS = [
  { label: "Mức độ thấp", value: "low" },
  { label: "Mức độ trung bình", value: "medium" },
  { label: "Mức độ cao", value: "high" },
];
const STATUS_OPTIONS = [
  { label: "Chờ thực hiện", value: "pending" },
  { label: "Đang thực hiện", value: "in-progress" },
  { label: "Hoàn thành", value: "completed" },
];
const REMINDER_OPTIONS = [
  { label: "5 phút", value: 5 },
  { label: "10 phút", value: 10 },
  { label: "15 phút", value: 15 },
  { label: "30 phút", value: 30 },
  { label: "1 giờ", value: 60 },
  { label: "2 giờ", value: 120 },
  { label: "1 ngày", value: 1440 },
];
const REPEAT_OPTIONS = [
  { label: "Hàng ngày", value: "daily" },
  { label: "Hàng tuần", value: "weekly" },
  { label: "Hàng tháng", value: "monthly" },
  { label: "Hàng năm", value: "yearly" },
];

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

  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("in-progress");
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
  const [reminderTime, setReminderTime] = useState(15);
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
  const [inputMode, setInputMode] = useState<"manual" | "file">("manual");
  const [importing, setImporting] = useState(false);

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

  useEffect(() => {
    loadTasks();
    loadReminders();
    loadRecurrences();
  }, []);

  // Lọc task theo search, priority, status
  const filteredTasks = tasks
    .filter((t) => {
      const matchSearch =
        !search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || "").toLowerCase().includes(search.toLowerCase());
      const matchPriority = !priority || t.priority === priority;
      const matchStatus = !status || t.status === status;
      return matchSearch && matchPriority && matchStatus;
    })
    .sort((a, b) => {
      const aStart = a.start_at ? (typeof a.start_at === "string" ? new Date(a.start_at).getTime() : a.start_at) : 0;
      const bStart = b.start_at ? (typeof b.start_at === "string" ? new Date(b.start_at).getTime() : b.start_at) : 0;
      return aStart - bStart;
    });

  const handleAddTask = async () => {
  if (!newTask.title.trim()) return Alert.alert("Vui lòng nhập tiêu đề!");

    // Xử lý ngày giờ bắt đầu/kết thúc
    let now = Date.now();
    let startAt = newTask.start_at;
    let endAt = newTask.end_at;

    // Nếu không nhập ngày giờ bắt đầu
    if (!startAt && !endAt) {
      startAt = now;
    }
    // Nếu không nhập ngày giờ bắt đầu nhưng có nhập ngày giờ kết thúc
    if (!startAt && endAt) {
      startAt = now;
    }

    // Chỉ cho phép chọn thời gian bắt đầu sớm hơn hiện tại tối đa 5 phút
    const FIVE_MINUTES = 5 * 60 * 1000;
    let startAtMs = startAt;
    if (typeof startAt === "string") {
      startAtMs = new Date(startAt).getTime();
    }
    if (startAtMs && startAtMs < now - FIVE_MINUTES) {
      Alert.alert(
        "Chỉ được chọn thời gian bắt đầu sớm hơn hiện tại tối đa 5 phút!"
      );
      return;
    }
    // Nếu có ngày giờ kết thúc và kết thúc <= bắt đầu thì báo lỗi
    if (endAt && startAt && endAt <= startAt) {
      Alert.alert("Ngày giờ kết thúc phải sau ngày giờ bắt đầu!");
      return;
    }

    // Kiểm tra trùng thời gian với các task khác (từ hiện tại trở về sau)
    // Chỉ kiểm tra nếu có startAt và endAt
    if (startAt && endAt) {
      const overlaps = tasks.filter((t) => {
        // Bỏ qua các task đã kết thúc trước hiện tại
        const tStart = t.start_at ? new Date(t.start_at).getTime() : null;
        const tEnd = t.end_at ? new Date(t.end_at).getTime() : null;
        if (tEnd && tEnd < now) return false;
        if (!tStart || !tEnd) return false;
        // Kiểm tra giao nhau
        return startAt! < tEnd && endAt! > tStart;
      });
      if (overlaps.length > 0) {
        let shouldContinue = false;
        await new Promise((resolve) => {
          const f = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
          const msg = overlaps.map((o, idx) => {
            const oTitle = o.title || "(Không tiêu đề)";
            const oStart = o.start_at ? new Date(o.start_at) : null;
            const oEnd = o.end_at ? new Date(o.end_at) : null;
            return `• ${oTitle}\n${oStart ? `  Bắt đầu: ${f(oStart)}\n` : ""}${oEnd ? `  Kết thúc: ${f(oEnd)}\n` : ""}`;
          }).join("\n");
          Alert.alert(
            "Trùng thời gian với công việc khác ⛔",
            `${msg}\nBạn có muốn tiếp tục lưu không?`,
            [
              {
                text: "Hủy",
                style: "cancel",
                onPress: () => {
                  shouldContinue = false;
                  resolve(undefined);
                },
              },
              {
                text: "Tiếp tục",
                style: "destructive",
                onPress: () => {
                  shouldContinue = true;
                  resolve(undefined);
                },
              },
            ]
          );
        });
        if (!shouldContinue) return;
      }
    }

    // Nếu ngày giờ bắt đầu nằm trong khoảng 5 phút trước/sau hiện tại thì set trạng thái in-progress
    let status = newTask.status;
    if (startAtMs && Math.abs(startAtMs - now) <= FIVE_MINUTES) {
      status = "in-progress";
    }

    let recurrence_id: number | undefined = undefined;

    // 1. Nếu có lặp lại, tạo recurrence trước
    if (repeat) {
      recurrence_id = await addRecurrence({
        type: repeatFrequency,
        interval: repeatInterval,
        days_of_week:
          repeatFrequency === "weekly" && repeatDaysOfWeek.length > 0
            ? JSON.stringify(repeatDaysOfWeek)
            : undefined,
        day_of_month:
          repeatFrequency === "monthly" && repeatDaysOfMonth.length > 0
            ? JSON.stringify(repeatDaysOfMonth)
            : undefined,
        start_date: startAt,
        end_date: endAt,
      });
    }

    // 2. Thêm task và lấy id
    const taskId = await addTask({
      ...newTask,
      status,
      start_at: startAt ? new Date(startAt).toISOString() : undefined,
      end_at: endAt ? new Date(endAt).toISOString() : undefined,
      is_deleted: 0,
      user_id: 1,
      recurrence_id,
    } as any);

    // 3. Nếu có nhắc nhở thì thêm reminder
    if (reminder && taskId) {
      await addReminder({
        task_id: taskId,
        remind_before: reminderTime,
        method: reminderMethod,
        repeat_count: 1,
        is_active: 1,
      });
      await loadReminders();
    }

    await loadTasks();

  // 4. Reset form
  Alert.alert("Thành công", "Đã thêm công việc!");
  setShowModal(false);
  setNewTask({ title: "", priority: "medium", status: "pending" });
  setReminder(false);
  setReminderTime(15);
  setReminderMethod("notification");
  setRepeat(false);
  setRepeatFrequency("daily");
  setRepeatInterval(1);
  setRepeatDaysOfWeek([]);
  setRepeatDaysOfMonth([]);
  setRepeatStartDate(undefined);
  setRepeatEndDate(undefined);
  };

  const handleEditTask = async () => {
    if (!newTask.title.trim() || editId === null) return;
    const task = tasks.find((t) => t.id === editId);
    let recurrence_id = task?.recurrence_id;

    // Ràng buộc ngày giờ và trạng thái giống thêm task
    let now = Date.now();
    let startAt = newTask.start_at;
    let endAt = newTask.end_at;
    const FIVE_MINUTES = 5 * 60 * 1000;
    let startAtMs = startAt;
    if (typeof startAt === "string") {
      startAtMs = new Date(startAt).getTime();
    }
    // So sánh với giá trị cũ, chỉ kiểm tra nếu có thay đổi
    const startAtChanged =
      startAt !==
      (task?.start_at ? new Date(task.start_at).getTime() : undefined);
    const endAtChanged =
      endAt !== (task?.end_at ? new Date(task.end_at).getTime() : undefined);

    if (startAtChanged && startAtMs && startAtMs < now - FIVE_MINUTES) {
      Alert.alert(
        "Chỉ được chọn thời gian bắt đầu sớm hơn hiện tại tối đa 5 phút!"
      );
      return;
    }
    if (
      (startAtChanged || endAtChanged) &&
      endAt &&
      startAt &&
      endAt <= startAt
    ) {
      Alert.alert("Ngày giờ kết thúc phải sau ngày giờ bắt đầu!");
      return;
    }

    // Kiểm tra trùng thời gian với các task khác (từ hiện tại trở về sau, trừ chính nó)
    if ((startAtChanged || endAtChanged) && startAt && endAt) {
      const overlaps = tasks.filter((t) => {
        if (t.id === editId) return false;
        const tStart = t.start_at ? new Date(t.start_at).getTime() : null;
        const tEnd = t.end_at ? new Date(t.end_at).getTime() : null;
        if (tEnd && tEnd < now) return false;
        if (!tStart || !tEnd) return false;
        return startAt! < tEnd && endAt! > tStart;
      });
      if (overlaps.length > 0) {
        let shouldContinue = false;
        await new Promise((resolve) => {
          const f = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
          const msg = overlaps.map((o, idx) => {
            const oTitle = o.title || "(Không tiêu đề)";
            const oStart = o.start_at ? new Date(o.start_at) : null;
            const oEnd = o.end_at ? new Date(o.end_at) : null;
            return `• ${oTitle}\n${oStart ? `  Bắt đầu: ${f(oStart)}\n` : ""}${oEnd ? `  Kết thúc: ${f(oEnd)}\n` : ""}`;
          }).join("\n");
          Alert.alert(
            "Trùng thời gian với công việc khác ⛔",
            `${msg}\nBạn có muốn tiếp tục lưu không?`,
            [
              {
                text: "Hủy",
                style: "cancel",
                onPress: () => {
                  shouldContinue = false;
                  resolve(undefined);
                },
              },
              {
                text: "Tiếp tục",
                style: "destructive",
                onPress: () => {
                  shouldContinue = true;
                  resolve(undefined);
                },
              },
            ]
          );
        });
        if (!shouldContinue) return;
      }
    }

    // Lặp lại
    if (repeat) {
      if (recurrence_id) {
        await editRecurrence(recurrence_id, {
          type: repeatFrequency,
          interval: repeatInterval,
          days_of_week:
            repeatFrequency === "weekly" && repeatDaysOfWeek.length > 0
              ? JSON.stringify(repeatDaysOfWeek)
              : undefined,
          day_of_month:
            repeatFrequency === "monthly" && repeatDaysOfMonth.length > 0
              ? JSON.stringify(repeatDaysOfMonth)
              : undefined,
          start_date: startAt,
          end_date: endAt,
        });
      } else {
        recurrence_id = await addRecurrence({
          type: repeatFrequency,
          interval: repeatInterval,
          days_of_week:
            repeatFrequency === "weekly" && repeatDaysOfWeek.length > 0
              ? JSON.stringify(repeatDaysOfWeek)
              : undefined,
          day_of_month:
            repeatFrequency === "monthly" && repeatDaysOfMonth.length > 0
              ? JSON.stringify(repeatDaysOfMonth)
              : undefined,
          start_date: startAt,
          end_date: endAt,
        });
      }
    } else if (recurrence_id) {
      await removeRecurrence(recurrence_id);
      recurrence_id = undefined;
    }

    // Giữ nguyên trạng thái cũ nếu không thay đổi tr   ng thái
    let status = newTask.status;
    if (task && (!newTask.status || newTask.status === task.status)) {
      status = task.status || "pending";
    }

    // Sửa task
    await editTask(editId, {
      ...newTask,
      status,
      start_at: startAt ? new Date(startAt).toISOString() : undefined,
      end_at: endAt ? new Date(endAt).toISOString() : undefined,
      recurrence_id,
    });

    // Nhắc nhở
    const taskReminder = reminders.find((r) => r.task_id === editId);
    if (reminder) {
      if (taskReminder) {
        await editReminder(taskReminder.id!, {
          remind_before: reminderTime,
          method: reminderMethod,
          repeat_count: 1,
          is_active: 1,
        });
      } else {
        await addReminder({
          task_id: editId,
          remind_before: reminderTime,
          method: reminderMethod,
          repeat_count: 1,
          is_active: 1,
        });
      }
      await loadReminders();
    } else if (taskReminder) {
      await removeReminder(taskReminder.id!);
      await loadReminders();
    }
  Alert.alert("Thành công", "Đã cập nhật công việc!");
  setEditId(null);
  setShowModal(false);
  setNewTask({ title: "", priority: "medium", status: "pending" });
  setReminder(false);
  setRepeat(false);
  setReminderTime(15);
  setRepeatFrequency("daily");
  };

  const handleDeleteTask = (id: number) => {
    Alert.alert("Xác nhận", "Bạn có chắc muốn xóa công việc này?", [
      { text: "Hủy" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: async () => {
          const task = tasks.find((t) => t.id === id);
          if (task?.recurrence_id) {
            await removeRecurrence(task.recurrence_id);
          }
          const taskReminder = reminders.find((r) => r.task_id === id);
          if (taskReminder) {
            await removeReminder(taskReminder.id!);
          }
          await removeTask(id);
          Alert.alert("Thành công", "Đã xóa công việc!");
        },
      },
    ]);
  };

  const openAddModal = () => {
    setShowModal(true);
    setEditId(null);
    const now = Date.now();
    setNewTask({
      title: "",
      priority: "medium",
      status: "pending",
      start_at: now,
    });
    setReminder(false);
    setRepeat(false);
    setReminderTime(15);
    setRepeatFrequency("daily");
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
      priority: item.priority || "medium",
      status: item.status || "pending",
    });

    // Tìm reminder của task này
    const taskReminder = reminders.find((r) => r.task_id === item.id);
    if (taskReminder) {
      setReminder(true);
      setReminderTime(taskReminder.remind_before ?? 15);
      setReminderMethod(taskReminder.method ?? "notification");
    } else {
      setReminder(false);
      setReminderTime(15);
      setReminderMethod("notification");
    }

    // Tìm recurrence của task này
    if (item.recurrence_id) {
      const rec = recurrences.find((r) => r.id === item.recurrence_id);
      if (rec) {
        setRepeat(true);
        setRepeatFrequency(rec.type ?? "daily");
        setRepeatInterval(rec.interval ?? 1);
        setRepeatDaysOfWeek(
          rec.days_of_week ? JSON.parse(rec.days_of_week) : []
        );
        setRepeatDaysOfMonth(
          rec.day_of_month ? JSON.parse(rec.day_of_month) : []
        );
        setRepeatStartDate(
          rec.start_date ? new Date(rec.start_date).getTime() : undefined
        );
        setRepeatEndDate(
          rec.end_date ? new Date(rec.end_date).getTime() : undefined
        );
      } else {
        setRepeat(false);
        setRepeatFrequency("daily");
        setRepeatInterval(1);
        setRepeatDaysOfWeek([]);
        setRepeatDaysOfMonth([]);
        setRepeatStartDate(undefined);
        setRepeatEndDate(undefined);
      }
    } else {
      setRepeat(false);
      setRepeatFrequency("daily");
      setRepeatInterval(1);
      setRepeatDaysOfWeek([]);
      setRepeatDaysOfMonth([]);
      setRepeatStartDate(undefined);
      setRepeatEndDate(undefined);
    }
  };

  useEffect(() => {
    const now = Date.now();
    // Lọc các task đang chờ thực hiện và đã đến giờ bắt đầu
    const needUpdate = tasks.filter(
      (t) =>
        t.status === "pending" &&
        t.start_at &&
        new Date(t.start_at).getTime() <= now
    );
    // Chuyển trạng thái cho các task này
    needUpdate.forEach((t) => {
      editTask(t.id!, { status: "in-progress" });
    });
    // Lặp lại mỗi phút để kiểm tra
    const interval = setInterval(() => {
      const now2 = Date.now();
      tasks.forEach((t) => {
        if (
          t.status === "pending" &&
          t.start_at &&
          new Date(t.start_at).getTime() <= now2
        ) {
          editTask(t.id!, { status: "in-progress" });
        }
      });
    }, 60000);
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

  const firstValue = (row: any, keys: string[]) => {
    for (const k of keys) {
      const v = row[k];
      if (v !== undefined && v !== null && `${v}`.trim() !== "") return v;
    }
    return undefined;
  };

  // Hàm tạo file excel mẫu và cho phép tải về
  const handleDownloadTemplate = async () => {
    // Tạo dữ liệu mẫu
    const wsData = [
      [
        "tiêu đề",
        "mô tả",
        "bắt đầu (HH:mm-dd/MM/yyyy)",
        "kết thúc (HH:mm-dd/MM/yyyy)",
        "mức độ (low|medium|high)",
        "trạng thái (pending|in-progress|completed)",
        "nhắc nhở (0|1)",
        "thời gian nhắc (phút)",
        "phương thức nhắc (notification|email)",
        "lặp lại (0|1)",
        "kiểu lặp (daily|weekly|monthly|yearly)",
        "khoảng lặp",
        "các ngày trong tuần (Mon,Tue,...)",
        "các ngày trong tháng (1,2,...)",
      ],
      [
        "Học React Native",
        "Xem tài liệu chính thức",
        "08:00-01/06/2024",
        "10:00-01/06/2024",
        "medium",
        "pending",
        1,
        15,
        "notification",
        1,
        "weekly",
        1,
        "Mon,Wed,Fri",
        "",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const uri = FileSystem.cacheDirectory + "tasks_template.xlsx";
    await FileSystem.writeAsStringAsync(uri, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await Sharing.shareAsync(uri, {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: "Tải file mẫu",
    });
  };

  // Hàm xử lý import file
  const handleImportFile = async () => {
    setImporting(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) {
        setImporting(false);
        return;
      }
      const fileUri = res.assets[0].uri;
      const b64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = XLSX.read(b64, { type: "base64" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      // Validate từng dòng như thêm thủ công
      let errorRows: number[] = [];
      for (let i = 0; i < data.length; ++i) {
        const row = data[i];
        const titleVal = firstValue(row, ["tiêu đề", "title"]);
        const startStr = firstValue(row, [
          "bắt đầu (HH:mm-dd/MM/yyyy)",
          "start_at (yyyy-mm-dd HH:mm)",
        ]);
        const endStr = firstValue(row, [
          "kết thúc (HH:mm-dd/MM/yyyy)",
          "end_at (yyyy-mm-dd HH:mm)",
        ]);

        if (!titleVal || !startStr) {
          errorRows.push(i + 2);
          continue;
        }

        // Parse ngày giờ theo định dạng mới, fallback định dạng cũ
        let startAt: number = NaN;
        if (typeof startStr === "string") {
          const s = startStr.toString();
          if (/^\d{1,2}:\d{2}-\d{2}\/\d{2}\/\d{4}$/.test(s.trim()))
            startAt = parseViDateTime(s);
          else startAt = Date.parse(s.replace(/-/g, "/").replace(" ", "T"));
        } else {
          startAt = Number(startStr);
        }

        let endAt: number | undefined = undefined;
        if (endStr !== undefined) {
          if (typeof endStr === "string") {
            const e = endStr.toString();
            if (/^\d{1,2}:\d{2}-\d{2}\/\d{2}\/\d{4}$/.test(e.trim()))
              endAt = parseViDateTime(e);
            else {
              const parsed = Date.parse(e.replace(/-/g, "/").replace(" ", "T"));
              endAt = isNaN(parsed) ? undefined : parsed;
            }
          } else {
            const num = Number(endStr);
            endAt = isNaN(num) ? undefined : num;
          }
        }

        if (isNaN(startAt)) {
          errorRows.push(i + 2);
          continue;
        }
        if (endAt && endAt <= startAt) {
          errorRows.push(i + 2);
          continue;
        }
        // Chỉ cho phép chọn thời gian bắt đầu sớm hơn hiện tại tối đa 5 phút
        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;
        if (startAt < now - FIVE_MINUTES) {
          errorRows.push(i + 2);
          continue;
        }
        // Kiểm tra trùng thời gian với các task khác (từ hiện tại trở về sau)
        if (startAt && endAt) {
          const overlap = tasks.find((t) => {
            const tStart = t.start_at ? new Date(t.start_at).getTime() : null;
            const tEnd = t.end_at ? new Date(t.end_at).getTime() : null;
            if (tEnd && tEnd < now) return false;
            if (!tStart || !tEnd) return false;
            return startAt < tEnd && endAt > tStart;
          });
          if (overlap) {
            errorRows.push(i + 2);
            continue;
          }
        }
      }
      if (errorRows.length > 0) {
        Alert.alert(
          "Lỗi nhập file",
          `Các dòng sau có lỗi: ${errorRows.join(", ")}. Vui lòng kiểm tra lại file.`
        );
        setImporting(false);
        return;
      }

      // Nếu không lỗi, thêm từng task
      for (let i = 0; i < data.length; ++i) {
        const row = data[i];

        const titleVal = firstValue(row, ["tiêu đề", "title"]);
        const descVal = firstValue(row, ["mô tả", "description"]);
        const startStr = firstValue(row, [
          "bắt đầu (HH:mm-dd/MM/yyyy)",
          "start_at (yyyy-mm-dd HH:mm)",
        ]);
        const endStr = firstValue(row, [
          "kết thúc (HH:mm-dd/MM/yyyy)",
          "end_at (yyyy-mm-dd HH:mm)",
        ]);

        let startAt: number = NaN;
        if (typeof startStr === "string") {
          const s = startStr.toString();
          if (/^\d{1,2}:\d{2}-\d{2}\/\d{2}\/\d{4}$/.test(s.trim()))
            startAt = parseViDateTime(s);
          else startAt = Date.parse(s.replace(/-/g, "/").replace(" ", "T"));
        } else {
          startAt = Number(startStr);
        }

        let endAt: number | undefined = undefined;
        if (endStr !== undefined) {
          if (typeof endStr === "string") {
            const e = endStr.toString();
            if (/^\d{1,2}:\d{2}-\d{2}\/\d{2}\/\d{4}$/.test(e.trim()))
              endAt = parseViDateTime(e);
            else {
              const parsed = Date.parse(e.replace(/-/g, "/").replace(" ", "T"));
              endAt = isNaN(parsed) ? undefined : parsed;
            }
          } else {
            const num = Number(endStr);
            endAt = isNaN(num) ? undefined : num;
          }
        }

        let status =
          (firstValue(row, [
            "trạng thái (pending|in-progress|completed)",
            "status (pending|in-progress|completed)",
          ]) as string) || "pending";
        const now = Date.now();
        const FIVE_MINUTES = 5 * 60 * 1000;
        if (Math.abs(startAt - now) <= FIVE_MINUTES) status = "in-progress";

        let recurrence_id: number | undefined = undefined;
        const repeatFlag = firstValue(row, ["lặp lại (0|1)", "repeat (0|1)"]);
        if (repeatFlag == 1 || repeatFlag === "1") {
          const daysOfWeek = firstValue(row, [
            "các ngày trong tuần (Mon,Tue,...)",
            "repeat_days_of_week (Mon,Tue,...)",
          ]);
          const daysOfMonth = firstValue(row, [
            "các ngày trong tháng (1,2,...)",
            "repeat_days_of_month (1,2,...)",
          ]);
          recurrence_id = await addRecurrence({
            type:
              (firstValue(row, [
                "kiểu lặp (daily|weekly|monthly|yearly)",
                "repeat_type (daily|weekly|monthly|yearly)",
              ]) as string) || "daily",
            interval:
              Number(firstValue(row, ["khoảng lặp", "repeat_interval"])) || 1,
            days_of_week: daysOfWeek
              ? JSON.stringify(
                  String(daysOfWeek)
                    .split(",")
                    .map((d: string) => d.trim())
                    .filter(Boolean)
                )
              : undefined,
            day_of_month: daysOfMonth
              ? JSON.stringify(
                  String(daysOfMonth)
                    .split(",")
                    .map((d: string) => d.trim())
                    .filter(Boolean)
                )
              : undefined,
            start_date: startAt,
            end_date: endAt,
          });
        }
        // Thêm task
        const taskId = await addTask({
          title: titleVal as string,
          description: (descVal as string) || undefined,
          start_at: new Date(startAt).toISOString(),
          end_at: endAt ? new Date(endAt).toISOString() : undefined,
          priority:
            (firstValue(row, [
              "mức độ (low|medium|high)",
              "priority (low|medium|high)",
            ]) as string) || "medium",
          status,
          is_deleted: 0,
          user_id: 1,
          recurrence_id,
        } as any);
        // Nhắc nhở
        const reminderFlag = firstValue(row, [
          "nhắc nhở (0|1)",
          "reminder (0|1)",
        ]);
        if (reminderFlag == 1 || reminderFlag === "1") {
          await addReminder({
            task_id: taskId,
            remind_before:
              Number(
                firstValue(row, [
                  "thời gian nhắc (phút)",
                  "reminder_time (phút)",
                ])
              ) || 15,
            method:
              (firstValue(row, [
                "phương thức nhắc (notification|email)",
                "reminder_method (notification|email)",
              ]) as string) || "notification",
            repeat_count: 1,
            is_active: 1,
          });
        }
      }
      await loadTasks();
      await loadReminders();
      Alert.alert("Thành công", "Đã nhập công việc từ file!");
      setShowModal(false);
    } catch (e) {
      Alert.alert("Lỗi", "Không thể đọc file. Vui lòng thử lại.");
    }
    setImporting(false);
  };

  return (
    <View className="flex-1 p-4 bg-white">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-bold">Công việc của tôi</Text>
        <TouchableOpacity
          onPress={() => setViewMode(viewMode === "list" ? "week" : "list")}
          className="px-3 py-2 bg-gray-200 rounded"
        >
          <Text>{viewMode === "list" ? "Dạng lịch" : "Dạng danh sách"}</Text>
        </TouchableOpacity>
      </View>

      {/* Ô tìm kiếm + lọc */}
      <View className="mb-4">
        <TextInput
          placeholder="Tìm kiếm công việc..."
          value={search}
          onChangeText={setSearch}
          className="border p-2 rounded mb-2"
        />
        <View className="flex-row gap-2">
          <FilterPicker
            value={priority}
            onChange={setPriority}
            options={PRIORITY_OPTIONS}
            placeholder="Tất cả mức độ"
          />
          <FilterPicker
            value={status}
            onChange={setStatus}
            options={STATUS_OPTIONS}
            placeholder="Tất cả trạng thái"
          />
        </View>
      </View>

      {viewMode === "week" && (
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
                className="px-3 py-1 bg-blue-500 rounded"
                onPress={() => {
                  const today = new Date();
                  const dayOfWeek = today.getDay() || 7;
                  const monday = new Date(today);
                  monday.setDate(today.getDate() - (dayOfWeek - 1));
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

          {/* Bảng tuần */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="mt-3 border border-gray-300 rounded bg-white">
              {/* Header hàng ngày */}
              <View className="flex-row">
                {/* Ô góc trái */}
                <View className="w-20 h-10 bg-gray-200 justify-center items-center border-r border-b border-gray-300">
                  <Text className="text-xs font-bold">Khung giờ</Text>
                </View>

                {/* Header cho từng ngày */}
                {weekDays.map((day, idx) => (
                  <View
                    key={day}
                    className="w-40 h-10 bg-blue-500 justify-center items-center border-r border-b border-gray-300"
                  >
                    <Text className="text-xs font-bold text-white">
                      {["T2", "T3", "T4", "T5", "T6", "T7", "CN"][idx]}{" "}
                      {formatDDMMYYYY(day)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Các hàng Sáng / Chiều / Tối */}
              {["Sáng", "Chiều", "Tối"].map((period, pIdx) => (
                <View key={period} className="flex-row">
                  {/* Cột đầu tiên (label) */}
                  <View className="w-20 justify-center items-center border-r border-b border-gray-300 bg-gray-100">
                    <Text className="text-xs font-medium">
                      {pIdx === 0
                        ? "🌞 Sáng"
                        : pIdx === 1
                          ? "🌇 Chiều"
                          : "🌙 Tối"}
                    </Text>
                  </View>

                  {/* Các ô ngày */}
                  {weekDays.map((day) => {
                    const tasks = filteredTasks
                      .filter((t) =>
                        t.start_at
                          ? (() => {
                              const ts = new Date(t.start_at!);
                              const inDay =
                                ts.getTime() >= startOfDay(day) && ts.getTime() <= endOfDay(day);
                              if (!inDay) return false;
                              const hour = ts.getHours();
                              if (pIdx === 0) return hour < 12;
                              if (pIdx === 1) return hour >= 12 && hour < 18;
                              return hour >= 18;
                            })()
                          : false
                      )
                      .sort(
                        (a, b) =>
                          (typeof a.start_at === "string"
                            ? new Date(a.start_at).getTime()
                            : a.start_at ?? 0) -
                          (typeof b.start_at === "string"
                            ? new Date(b.start_at).getTime()
                            : b.start_at ?? 0)
                      );

                    return (
                      <View
                        key={day + period}
                        className="w-40 p-1 border-r border-b border-gray-300"
                      >
                        {tasks.map((t) => (
                          <TouchableOpacity
                            key={t.id}
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
                              {t.title}
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
      )}

      {/* Modal thêm/sửa */}
      <TaskModal
        visible={showModal}
        onClose={() => {
          setShowModal(false);
          setEditId(null);
          setAddTaskStartTime(null);
        }}
        inputMode={inputMode}
        setInputMode={setInputMode}
        importing={importing}
        setImporting={setImporting}
        editId={editId}
        setEditId={setEditId}
        newTask={newTask}
        setNewTask={setNewTask}
        handleAddTask={handleAddTask}
        handleEditTask={handleEditTask}
        handleDownloadTemplate={handleDownloadTemplate}
        handleImportFile={handleImportFile}
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
      />

      {/* Modal chi tiết công việc (khi bấm trong lịch) */}
      <Modal visible={showDetail} animationType="fade" transparent>
        <View className="flex-1 bg-black/40 justify-center items-center">
          <View className="bg-white w-11/12 p-4 rounded-lg max-h-[80%]">
            <View className="absolute right-2 top-2 z-10">
              <TouchableOpacity
                onPress={() => setShowDetail(false)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text className="text-xl">✖️</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {detailTask ? (
                <View>
                  <Text className="text-lg font-bold mb-2">
                    {detailTask.title}
                  </Text>
                  {detailTask.description ? (
                    <Text className="text-gray-700 mb-2">
                      {detailTask.description}
                    </Text>
                  ) : null}

                  <View className="flex-row items-center mb-2">
                    <Text className="text-gray-600">📅</Text>
                    <Text className="text-gray-700 ml-1">
                      {detailTask.start_at
                        ? `${new Date(detailTask.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ${new Date(detailTask.start_at).getDate()}-${new Date(detailTask.start_at).getMonth() + 1}-${new Date(detailTask.start_at).getFullYear()}`
                        : ""}
                      {detailTask.end_at
                        ? ` - ${new Date(detailTask.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ${new Date(detailTask.end_at).getDate()}-${new Date(detailTask.end_at).getMonth() + 1}-${new Date(detailTask.end_at).getFullYear()}`
                        : ""}
                    </Text>
                  </View>

                  <View className="flex-row flex-wrap items-center gap-1 mb-3">
                    {detailTask.priority === "high" && (
                      <Text className="bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-base border border-red-600">
                        Cao
                      </Text>
                    )}
                    {detailTask.priority === "medium" && (
                      <Text className="bg-yellow-100 text-yellow-600 rounded-full px-2 py-0.5 text-base border border-yellow-600">
                        Trung bình
                      </Text>
                    )}
                    {detailTask.priority === "low" && (
                      <Text className="bg-green-100 text-green-600 rounded-full px-2 py-0.5 text-base border border-green-600">
                        Thấp
                      </Text>
                    )}

                    {detailTask.status === "pending" && (
                      <Text className="bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 text-base border border-gray-600">
                        Chờ thực hiện
                      </Text>
                    )}
                    {detailTask.status === "in-progress" && (
                      <Text className="bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 text-base border border-blue-600">
                        Đang thực hiện
                      </Text>
                    )}
                    {detailTask.status === "completed" && (
                      <Text className="bg-green-100 text-green-600 rounded-full px-2 py-0.5 text-base border border-green-600">
                        Hoàn thành
                      </Text>
                    )}
                  </View>

                  {/* Nhắc nhở và lặp lại */}
                  <View className="flex-row flex-wrap items-center gap-1 mb-3">
                    {reminders.find((r) => r.task_id === detailTask.id) && (
                      <View className="flex-row items-center bg-blue-100 rounded-full px-2 py-0.5 border border-blue-600">
                        <Text className="text-blue-600 text-base">🔔</Text>
                        <Text className="text-blue-600 text-base ml-0.5">
                          {
                            reminders.find((r) => r.task_id === detailTask.id)
                              ?.remind_before
                          }
                          p
                        </Text>
                      </View>
                    )}
                    {detailTask.recurrence_id &&
                      (() => {
                        const rec = recurrences.find(
                          (r) => r.id === detailTask.recurrence_id
                        );
                        if (!rec) return null;
                        const opt = REPEAT_OPTIONS.find(
                          (o) => o.value === rec.type
                        );
                        return (
                          <View className="flex-row items-center bg-purple-100 rounded-full px-2 py-0.5 border border-purple-700">
                            <Text className="text-base">🔄</Text>
                            <Text className="text-purple-700 text-base ml-1">
                              {opt ? opt.label : rec.type}
                            </Text>
                          </View>
                        );
                      })()}
                  </View>

                  <View className="flex-row justify-end gap-3">
                    <TouchableOpacity
                      onPress={async () => {
                        if (!detailTask?.id) return;
                        let nextStatus: Task["status"] = "pending";
                        if (detailTask.status === "pending")
                          nextStatus = "in-progress";
                        else if (detailTask.status === "in-progress")
                          nextStatus = "completed";
                        else if (detailTask.status === "completed")
                          nextStatus = "pending";
                        await editTask(detailTask.id, { status: nextStatus });
                        setDetailTask({ ...detailTask, status: nextStatus });
                      }}
                    >
                      <Text className="text-xl">
                        {detailTask.status === "completed"
                          ? "✅"
                          : detailTask.status === "in-progress"
                            ? "🟡"
                            : "⭕"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setShowDetail(false);
                        if (detailTask) openEditModal(detailTask);
                      }}
                    >
                      <Text className="text-lg">✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (detailTask?.id) handleDeleteTask(detailTask.id);
                        setShowDetail(false);
                      }}
                    >
                      <Text className="text-lg">🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Danh sách task */}
      {loading && <Text>Đang tải...</Text>}
      {viewMode === "list" ? (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id?.toString() || ""}
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
        />
      ) : null}

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
