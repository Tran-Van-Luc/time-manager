import React, { useEffect, useState } from "react";
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
import ConflictModal from "../components/tasks/ConflictModal";
import TaskAlertModal from "../components/tasks/TaskAlertModal";
import FilterPicker from "../components/tasks/SelectBox";
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
// Đã loại bỏ chức năng nhập/xuất file nên bỏ import template & parse

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
  const [conflictModal, setConflictModal] = useState<{ visible: boolean; raw: string; blocks: any[]; resolver?: (v:boolean)=>void }>({ visible:false, raw:'', blocks:[] });
  const [alertState, setAlertState] = useState<{ visible:boolean; tone:'error'|'warning'|'success'|'info'; title:string; message:string; buttons:{ text:string; onPress:()=>void; tone?:any }[] }>({ visible:false, tone:'info', title:'', message:'', buttons:[] });
  const { handleAddTask, handleEditTask, handleDeleteTask } = useTaskOperations(
    tasks,
    schedules,
    {
      onConflict: ({ raw, blocks, resolve }) => {
        setConflictModal({ visible:true, raw, blocks, resolver: resolve });
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
    }
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
      const aStart = a.start_at
        ? typeof a.start_at === "string"
          ? new Date(a.start_at).getTime()
          : a.start_at
        : 0;
      const bStart = b.start_at
        ? typeof b.start_at === "string"
          ? new Date(b.start_at).getTime()
          : b.start_at
        : 0;
      return aStart - bStart;
    });

  const openAddModal = () => {
    setShowModal(true);
    setEditId(null);
  // inputMode removed
    setNewTask({
      title: "",
      priority: "medium",
      status: "pending",
      // start_at left undefined; will default to now on save
    });
    setReminder(false);
  setReminderTime(REMINDER_OPTIONS[0].value);
    setReminderMethod('notification');
    setRepeat(false);
    setRepeatFrequency("daily");
    setRepeatInterval(1);
    setRepeatDaysOfWeek([]);
    setRepeatDaysOfMonth([]);
    setRepeatStartDate(undefined);
    setRepeatEndDate(undefined);
    setAddTaskStartTime(Date.now());
  };

  const openEditModal = (item: Task) => {
    setEditId(item.id!);
    setShowModal(true);
  // inputMode removed
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
  setReminderTime(taskReminder.remind_before ?? REMINDER_OPTIONS[0].value);
      setReminderMethod(taskReminder.method ?? "notification");
    } else {
      setReminder(false);
  setReminderTime(REMINDER_OPTIONS[0].value);
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

  // Đã loại bỏ import từ file nên các hàm hỗ trợ parse/firstValue cũng bỏ

  return (
    <View className="flex-1 p-4 bg-white">
      <ConflictModal
        visible={conflictModal.visible}
        raw={conflictModal.raw}
        blocks={conflictModal.blocks}
        onCancel={() => { conflictModal.resolver?.(false); setConflictModal(c=>({...c, visible:false})); }}
        onContinue={() => { conflictModal.resolver?.(true); setConflictModal(c=>({...c, visible:false})); }}
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
