import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import type { Task } from "../types/Task";
import type { Recurrence } from "../types/Recurrence";

type RepeatOption = { label: string; value: string };

interface Props {
  item: Task;
  reminders: { task_id?: number | null; remind_before?: number | null }[];
  recurrences: Recurrence[];
  REPEAT_OPTIONS: RepeatOption[];
  editTask: (id: number, data: any) => Promise<void> | void;
  openEditModal: (task: Task) => void;
  handleDeleteTask: (id: number) => void;
}

export default function TaskItem({
  item,
  reminders,
  recurrences,
  REPEAT_OPTIONS,
  editTask,
  openEditModal,
  handleDeleteTask,
}: Props) {
  const reminder = reminders.find((r) => r.task_id === item.id);
  const rec = item.recurrence_id
    ? recurrences.find((r) => r.id === item.recurrence_id)
    : undefined;
  const repeatLabel = rec
    ? REPEAT_OPTIONS.find((o) => o.value === (rec as any).type)?.label ||
      (rec as any).type
    : "";

  return (
    <View className="flex-row mb-3 bg-gray-50 rounded-xl">
      {/* Border-left màu theo priority */}
      <View
        className={`w-1 rounded-l-xl ${
          item.priority === "high"
            ? "bg-red-600"
            : item.priority === "medium"
            ? "bg-yellow-400"
            : "bg-green-500"
        }`}
        style={{ height: "100%" }}
      />

      {/* Nội dung task */}
      <View className="flex-1 p-3">
        <Text className="font-bold text-lg mb-1">{item.title}</Text>
        {!!item.description && (
          <Text className="text-gray-600 text-base mb-1">
            {item.description}
          </Text>
        )}

        {/* Thời gian */}
        <View className="flex-row items-center mb-1">
          <Text className="text-gray-600 text-base">📅</Text>
          <Text className="text-gray-600 text-base ml-1">
            {item.start_at
              ? `${new Date(item.start_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })} ${new Date(item.start_at).getDate()}-${
                  new Date(item.start_at).getMonth() + 1
                }-${new Date(item.start_at).getFullYear()}`
              : ""}
            {item.end_at
              ? ` - ${new Date(item.end_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })} ${new Date(item.end_at).getDate()}-${
                  new Date(item.end_at).getMonth() + 1
                }-${new Date(item.end_at).getFullYear()}`
              : ""}
          </Text>
        </View>

        {/* Badge mức độ, trạng thái, nhắc nhở, lặp lại */}
        <View className="flex-row flex-wrap items-center gap-1 mb-1">
          {item.priority === "high" && (
            <Text className="bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-base border border-red-600">
              Cao
            </Text>
          )}
          {item.priority === "medium" && (
            <Text className="bg-yellow-100 text-yellow-600 rounded-full px-2 py-0.5 text-base border border-yellow-600">
              Trung bình
            </Text>
          )}
          {item.priority === "low" && (
            <Text className="bg-green-100 text-green-600 rounded-full px-2 py-0.5 text-base border border-green-600">
              Thấp
            </Text>
          )}

          {item.status === "pending" && (
            <Text className="bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 text-base border border-gray-600">
              Chờ thực hiện
            </Text>
          )}
          {item.status === "in-progress" && (
            <Text className="bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 text-base border border-blue-600">
              Đang thực hiện
            </Text>
          )}
          {item.status === "completed" && (
            <Text className="bg-green-100 text-green-600 rounded-full px-2 py-0.5 text-base border border-green-600">
              Hoàn thành
            </Text>
          )}

          {!!reminder && (
            <View className="flex-row items-center bg-blue-100 rounded-full px-2 py-0.5 border border-blue-600">
              <Text className="text-blue-600 text-base">🔔</Text>
              <Text className="text-blue-600 text-base ml-0.5">
                {reminder?.remind_before}p
              </Text>
            </View>
          )}

          {!!item.recurrence_id && !!rec && (
            <View className="flex-row items-center bg-purple-100 rounded-full px-2 py-0.5 border border-purple-700">
              <Text className="text-base">🔄</Text>
              <Text className="text-purple-700 text-base ml-1">{repeatLabel}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Cột icon thao tác */}
      <View className="flex-col items-center justify-center gap-2 ml-2 min-w-[36px]">
        <TouchableOpacity
          onPress={async () => {
            let nextStatus: Task["status"] = "pending";
            if (item.status === "pending") nextStatus = "in-progress";
            else if (item.status === "in-progress") nextStatus = "completed";
            else if (item.status === "completed") nextStatus = "pending";
            await editTask(item.id!, { status: nextStatus });
          }}
        >
          {item.status === "completed" ? (
            <Text className="text-green-500 text-xl">✅</Text>
          ) : item.status === "in-progress" ? (
            <Text className="text-yellow-400 text-xl">🟡</Text>
          ) : (
            <Text className="text-red-500 text-xl">⭕</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => openEditModal(item)}>
          <Text className="text-lg">✏️</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => handleDeleteTask(item.id!)}>
          <Text className="text-lg">🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
