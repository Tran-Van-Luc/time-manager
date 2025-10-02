import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import type { Task } from "../../types/Task";
import type { Recurrence } from "../../types/Recurrence";

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
        {(() => {
          const toDate = (v: any) => (v ? new Date(v) : null);
          const s = toDate(item.start_at);
          const e = toDate(item.end_at);
          const pad = (n: number) => String(n).padStart(2, "0");
          const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
            const fmtDate = (d: Date) => `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
          const segments: Array<{ type: string; text: string }> = [];
          if (s && e) {
            const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
            if (sameDay) {
              // HH:MM - HH:MM  (time range)  then date
              segments.push({ type: 'time', text: fmtTime(s) });
              segments.push({ type: 'sep', text: ' - ' });
              segments.push({ type: 'time', text: fmtTime(e) });
              segments.push({ type: 'space', text: ' ' });
              segments.push({ type: 'date', text: fmtDate(s) });
            } else {
              // Start full
              segments.push({ type: 'time', text: fmtTime(s) });
              segments.push({ type: 'space', text: ' ' });
              segments.push({ type: 'date', text: fmtDate(s) });
              segments.push({ type: 'sep', text: ' — ' });
              segments.push({ type: 'time', text: fmtTime(e) });
              segments.push({ type: 'space', text: ' ' });
              segments.push({ type: 'date', text: fmtDate(e) });
            }
          } else if (s) {
            segments.push({ type: 'time', text: fmtTime(s) });
            segments.push({ type: 'space', text: ' ' });
            segments.push({ type: 'date', text: fmtDate(s) });
          }
          // Recurrence end date
          if (rec?.end_date) {
            const endRecDate = new Date(rec.end_date);
            if (segments.length) segments.push({ type: 'rec-sep', text: ' — ' });
            segments.push({ type: 'recurrenceEnd', text: fmtDate(endRecDate) });
          }

          if (!segments.length) return null;

          const renderSeg = (seg: { type: string; text: string }, idx: number) => {
            let cls = 'text-base';
            switch (seg.type) {
              case 'time':
                cls += ' text-blue-600 font-medium';
                break;
              case 'date':
                cls += ' text-gray-700';
                break;
              case 'sep':
              case 'space':
              case 'rec-sep':
                cls += ' text-gray-500';
                break;
              case 'recurrenceEnd':
                cls += ' text-purple-700 font-medium';
                break;
              default:
                cls += ' text-gray-600';
            }
            return <Text key={idx} className={cls}>{seg.text}</Text>;
          };

          return (
            <View className="flex-row items-center mb-1 flex-wrap">
              <Text className="text-gray-600 text-base mr-1">📅</Text>
              <Text className="flex-row flex-wrap">{segments.map(renderSeg)}</Text>
            </View>
          );
        })()}

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
          {item.status === 'completed' && (()=>{
            // Gọn hoá: dùng đơn vị viết tắt n (ngày), g (giờ), p (phút)
            let label = 'Hoàn thành';
            const st = item.completion_status;
            if (st) {
              const abs = Math.abs(item.completion_diff_minutes ?? 0);
              if (st === 'on_time') {
                label = 'Hoàn thành đúng hạn';
              } else {
                const d = Math.floor(abs / 1440);
                const h = Math.floor((abs % 1440) / 60);
                const m = abs % 60;
                let short = '';
                if (d) short += `${d}n`;
                if (h) short += `${h}g`;
                if (m || (!d && !h && m===0)) short += `${m}p`; // nếu chỉ có 0 phút (rất sát) vẫn hiện 0p
                if (st === 'early') label = `Hoàn thành sớm ${short}`;
                else if (st === 'late') label = `Hoàn thành trễ ${short}`;
              }
            }
            return <Text className="bg-green-100 text-green-600 rounded-full px-2 py-0.5 text-base border border-green-600">{label}</Text>;
          })()}

          {!!reminder && (
            <View className="flex-row items-center bg-blue-100 rounded-full px-2 py-0.5 border border-blue-600">
              <Text className="text-blue-600 text-base">🔔</Text>
              <Text className="text-blue-600 text-base ml-0.5">
                {formatReminder(reminder?.remind_before) || `${reminder?.remind_before} phút`}
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
            if (nextStatus === 'completed') {
              // Determine due time: recurrence end date (end of recurrence) else task end_at
              const now = Date.now();
              let dueMs: number | undefined;
              if (rec?.end_date) {
                dueMs = new Date(rec.end_date).getTime();
              } else if (item.end_at) {
                dueMs = new Date(item.end_at).getTime();
              }
              let diffMinutes: number | undefined;
              let completionStatus: 'early' | 'on_time' | 'late' | undefined;
              if (dueMs) {
                diffMinutes = Math.round((now - dueMs) / 60000); // >0 = late
                if (diffMinutes < -1) completionStatus = 'early';
                else if (diffMinutes > 1) completionStatus = 'late';
                else completionStatus = 'on_time';
              }
              await editTask(item.id!, {
                status: nextStatus,
                completed_at: new Date(now).toISOString(),
                completion_diff_minutes: diffMinutes,
                completion_status: completionStatus,
              });
            } else {
              await editTask(item.id!, { status: nextStatus });
            }
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
