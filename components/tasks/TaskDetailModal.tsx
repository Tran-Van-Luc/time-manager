import React from "react";
import { View, Text, TouchableOpacity, Modal, ScrollView } from "react-native";
import type { Task } from "../../types/Task";
import { REPEAT_OPTIONS } from "../../constants/taskConstants";

interface TaskDetailModalProps {
  visible: boolean;
  task: Task | null;
  reminders: any[];
  recurrences: any[];
  onClose: () => void;
  onStatusChange: (taskId: number, status: Task["status"]) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
}

export default function TaskDetailModal({
  visible,
  task,
  reminders,
  recurrences,
  onClose,
  onStatusChange,
  onEdit,
  onDelete,
}: TaskDetailModalProps) {
  if (!task) return null;

  const handleStatusToggle = () => {
    let nextStatus: Task["status"] = "pending";
    if (task.status === "pending") nextStatus = "in-progress";
    else if (task.status === "in-progress") nextStatus = "completed";
    else if (task.status === "completed") nextStatus = "pending";
    
    onStatusChange(task.id!, nextStatus);
  };

  // Align with TaskItem: compute helper values once
  const reminder = reminders.find((r) => r.task_id === task.id);
  const rec = task.recurrence_id
    ? recurrences.find((r) => r.id === task.recurrence_id)
    : undefined;
  const repeatLabel = rec
    ? REPEAT_OPTIONS.find((o) => o.value === (rec as any).type)?.label ||
      (rec as any).type
    : "";

  const formatReminder = (mins?: number | null) => {
    if (!mins || mins <= 0) return '';
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    const parts: string[] = [];
    if (d) parts.push(`${d} ngày`);
    if (h) parts.push(`${h} giờ`);
    if (m) parts.push(`${m} phút`);
    return parts.join(' ');
  };

  const priorityStripClass =
    task.priority === "high"
      ? "bg-red-600"
      : task.priority === "medium"
      ? "bg-yellow-400"
      : "bg-green-500";

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 bg-black/40 justify-center items-center">
        <View className="bg-white w-11/12 p-4 rounded-lg max-h-[80%]">
          <View className="absolute right-2 top-2 z-10">
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text className="text-xl">✖️</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView>
            {/* Align visual layout with TaskItem */}
            <View className="flex-row mb-1 bg-gray-50 rounded-xl">
              {/* Left priority strip */}
              <View
                className={`w-1 rounded-l-xl ${priorityStripClass}`}
                style={{ height: "100%" }}
              />

              {/* Content */}
              <View className="flex-1 p-3">
                <Text className="font-bold text-lg mb-1">{task.title}</Text>
                {!!task.description && (
                  <Text className="text-gray-600 text-base mb-1">
                    {task.description}
                  </Text>
                )}

                {/* Time */}
                <View className="flex-row items-center mb-1">
                  <Text className="text-gray-600 text-base">📅</Text>
                  <Text className="text-gray-600 text-base ml-1">
                    {task.start_at
                      ? `${new Date(task.start_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} ${new Date(task.start_at).getDate()}-${
                          new Date(task.start_at).getMonth() + 1
                        }-${new Date(task.start_at).getFullYear()}`
                      : ""}
                    {task.end_at
                      ? ` - ${new Date(task.end_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} ${new Date(task.end_at).getDate()}-${
                          new Date(task.end_at).getMonth() + 1
                        }-${new Date(task.end_at).getFullYear()}`
                      : ""}
                  </Text>
                </View>

                {/* Badges: priority, status, reminder, recurrence */}
                <View className="flex-row flex-wrap items-center gap-1 mb-1">
                  {task.priority === "high" && (
                    <Text className="bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-base border border-red-600">
                      Cao
                    </Text>
                  )}
                  {task.priority === "medium" && (
                    <Text className="bg-yellow-100 text-yellow-600 rounded-full px-2 py-0.5 text-base border border-yellow-600">
                      Trung bình
                    </Text>
                  )}
                  {task.priority === "low" && (
                    <Text className="bg-green-100 text-green-600 rounded-full px-2 py-0.5 text-base border border-green-600">
                      Thấp
                    </Text>
                  )}

                  {task.status === "pending" && (
                    <Text className="bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 text-base border border-gray-600">
                      Chờ thực hiện
                    </Text>
                  )}
                  {task.status === "in-progress" && (
                    <Text className="bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 text-base border border-blue-600">
                      Đang thực hiện
                    </Text>
                  )}
                  {task.status === "completed" && (
                    <Text className="bg-green-100 text-green-600 rounded-full px-2 py-0.5 text-base border border-green-600">
                      Hoàn thành
                    </Text>
                  )}

                  {!!reminder && (
                    <View className="flex-row items-center bg-blue-100 rounded-full px-2 py-0.5 border border-blue-600">
                      <Text className="text-blue-600 text-base">🔔</Text>
                      <Text className="text-blue-600 text-base ml-0.5">
                        {formatReminder(reminder?.remind_before) || `${reminder?.remind_before} phút`}
                      </Text>
                    </View>
                  )}

                  {!!task.recurrence_id && !!rec && (
                    <View className="flex-row items-center bg-purple-100 rounded-full px-2 py-0.5 border border-purple-700">
                      <Text className="text-base">🔄</Text>
                      <Text className="text-purple-700 text-base ml-1">{repeatLabel}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Right action icons column */}
              <View className="flex-col items-center justify-center gap-2 ml-2 min-w-[36px] mr-2 my-2">
                <TouchableOpacity onPress={handleStatusToggle}>
                  {task.status === "completed" ? (
                    <Text className="text-green-500 text-xl">✅</Text>
                  ) : task.status === "in-progress" ? (
                    <Text className="text-yellow-400 text-xl">🟡</Text>
                  ) : (
                    <Text className="text-red-500 text-xl">⭕</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onEdit(task);
                  }}
                >
                  <Text className="text-lg">✏️</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    onDelete(task.id!);
                    onClose();
                  }}
                >
                  <Text className="text-lg">🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}