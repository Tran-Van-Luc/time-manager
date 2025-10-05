import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Switch,
  Platform as RNPlatform,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import FilterPicker from "./SelectBox"; 
import CompactSelect from "./CompactSelect";
import SegmentedOptions from "./SegmentedOptions"; 
import FloatingLabelInput from "./FloatingLabelInput";
import ColoredSegmentGroup from "./ColoredSegmentGroup";

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
  // Local iOS picker visibility state (avoid changing parent props)
  const [iosShowStartDate, setIosShowStartDate] = useState(false);
  const [iosShowStartTime, setIosShowStartTime] = useState(false);
  const [iosShowEndTime, setIosShowEndTime] = useState(false);
  const [iosShowRepeatEndDate, setIosShowRepeatEndDate] = useState(false);
  // Yearly: number of occurrences (1-100)
  const [yearlyCount, setYearlyCount] = useState<number | "">("");

  // Removed 5-minute constraint per request
  // Custom reminder state
  const [customReminderMode, setCustomReminderMode] = useState(false);
  const [customReminderValue, setCustomReminderValue] = useState<string>("");
  const [customReminderUnit, setCustomReminderUnit] = useState<string>("minutes");
  // Lưu metadata để khi mở lại sửa vẫn giữ đơn vị người dùng đã chọn (ví dụ 2 ngày)
  const [savedCustomMeta, setSavedCustomMeta] = useState<null | { unit: string; value: string }>(null);
  const MAX_CUSTOM_MINUTES = 7 * 24 * 60; // 7 days
  const [reminderWarning, setReminderWarning] = useState<string>("");

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

  const formatDate = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
  const oneHourFromNow = () => new Date(Date.now() + 60 * 60 * 1000);

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

  // When switching to yearly, initialize count if empty
  useEffect(() => {
    if (repeat && repeatFrequency === "yearly") {
      if (yearlyCount === "" || yearlyCount < 1) {
        const base = newTask.start_at ? new Date(newTask.start_at) : new Date();
        setYearlyCount(1);
        setRepeatEndDate(base.getTime());
      }
    }
  }, [repeat, repeatFrequency]);

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
    const nowPlus1h = oneHourFromNow().getTime();
    const startMs = newTask.start_at ?? Date.now();
    if (startMs < nowPlus1h) {
      onInlineAlert?.({
        tone: 'warning',
        title: 'Giờ bắt đầu chưa hợp lệ',
        message: 'Vui lòng đặt giờ bắt đầu muộn hơn hiện tại ít nhất 1 giờ.'
      });
      return;
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

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/40 justify-center items-center">
        <View className="bg-white w-11/12 p-4 rounded-lg">
          <ScrollView>
            <>
                <Text className="text-lg font-bold mb-3">
                  {editId === null ? "Thêm công việc mới" : "Sửa công việc"}
                </Text>
                <FloatingLabelInput
                  label="Tiêu đề"
                  required
                  value={newTask.title}
                  onChangeText={(t) => setNewTask((prev: any) => ({ ...prev, title: t }))}
                  autoCapitalize="sentences"
                  returnKeyType="next"
                />
                <FloatingLabelInput
                  label="Mô tả"
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
                            // For new task, ensure at least 1h from now
                            const now = new Date();
                            const minStart = editId === null ? oneHourFromNow() : now;
                            if (combined.getTime() < minStart.getTime()) {
                              const isSameDay =
                                pickedDate.getFullYear() === minStart.getFullYear() &&
                                pickedDate.getMonth() === minStart.getMonth() &&
                                pickedDate.getDate() === minStart.getDate();
                              if (isSameDay) {
                                combined = minStart;
                              }
                            }
                            setNewTask((prev: any) => ({
                              ...prev,
                              start_at: combined.getTime(),
                              // If end becomes invalid, clear it
                              end_at:
                                prev.end_at && prev.end_at <= combined.getTime()
                                  ? undefined
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
                    Ngày bắt đầu: {newTask.start_at ? formatDate(new Date(newTask.start_at)) : "--"}
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
                        const now = new Date();
                        const minStart = editId === null ? oneHourFromNow() : now;
                        if (combined.getTime() < minStart.getTime()) {
                          const isSameDay =
                            pickedDate.getFullYear() === minStart.getFullYear() &&
                            pickedDate.getMonth() === minStart.getMonth() &&
                            pickedDate.getDate() === minStart.getDate();
                          if (isSameDay) {
                            combined = minStart;
                          }
                        }
                        setNewTask((prev: any) => ({
                          ...prev,
                          start_at: combined.getTime(),
                          end_at:
                            prev.end_at && prev.end_at <= combined.getTime()
                              ? undefined
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
                            const now = new Date();
                            const minStart = editId === null ? oneHourFromNow() : now;
                            // Disallow choosing a start earlier than minStart
                            if (combined.getTime() < minStart.getTime()) {
                              onInlineAlert?.({ tone:'warning', title:'Thời gian không hợp lệ', message: editId === null ? 'Giờ bắt đầu phải muộn hơn hiện tại ít nhất 1 giờ!' : 'Giờ bắt đầu không thể trước thời điểm hiện tại!' });
                              return;
                            }
                            setNewTask((prev: any) => ({
                              ...prev,
                              start_at: combined.getTime(),
                              end_at:
                                prev.end_at && prev.end_at <= combined.getTime()
                                  ? undefined
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
                  <Text>Giờ bắt đầu: {newTask.start_at ? formatTime(new Date(newTask.start_at)) : "--"}</Text>
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
                        const now = new Date();
                        const minStart = editId === null ? oneHourFromNow() : now;
                        if (combined.getTime() < minStart.getTime()) {
                          onInlineAlert?.({ tone:'warning', title:'Thời gian không hợp lệ', message: editId === null ? 'Giờ bắt đầu phải muộn hơn hiện tại ít nhất 1 giờ!' : 'Giờ bắt đầu không thể trước thời điểm hiện tại!' });
                          return;
                        }
                        setNewTask((prev: any) => ({
                          ...prev,
                          start_at: combined.getTime(),
                          end_at:
                            prev.end_at && prev.end_at <= combined.getTime()
                              ? undefined
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
                    Giờ kết thúc: {newTask.end_at ? formatTime(getEndDateObj()) : "--"}
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
                          onInlineAlert?.({ tone:'warning', title:'Thời gian không hợp lệ', message:'Giờ kết thúc phải sau giờ bắt đầu!' });
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
                  <Text className="ml-1 mt-0.5 mb-2 font-medium">Mức độ</Text>
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
                  <Switch value={reminder} onValueChange={setReminder} />
                  <Text className="ml-2">Bật nhắc nhở</Text>
                </View>
                {reminder ? (
                  <>
                    <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                      <Text className="ml-1 mt-0.5 mb-1 font-medium">
                        Nhắc trước
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
                          { label: 'Tùy chỉnh', value: '__custom__' }
                        ]}
                      />
                      {customReminderMode && (
                        <View className="mt-2 border border-gray-300 rounded bg-white p-2">
                          <Text className="text-xs text-gray-600 mb-1">
                            Nhập giá trị nhắc tùy chỉnh
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
                                { label: "Phút", value: "minutes" },
                                { label: "Giờ", value: "hours" },
                                { label: "Ngày", value: "days" },
                              ]}
                              fontSizeClassName="text-sm"
                            />
                          </View>
                          <Text className="text-[10px] text-gray-400 mt-1">Giới hạn tối đa: 7 ngày (10080 phút).</Text>
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
                        Phương thức nhắc
                      </Text>
                      <ColoredSegmentGroup
                        value={reminderMethod}
                        onChange={(v: string) => setReminderMethod(v)}
                        size="sm"
                        color="blue"
                        options={[
                          { label: 'Thông báo', value: 'notification' },
                          { label: 'Chuông báo', value: 'alarm' }
                        ]}
                      />
                    </View>
                  </>
                ) : null}
                {/* Lặp lại */}
                <View className="flex-row items-center mb-2">
                  <Switch value={repeat} onValueChange={setRepeat} />
                  <Text className="ml-2">Lặp lại</Text>
                </View>
                {repeat ? (
                  <>
                    <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                      <Text className="ml-1 mt-0.5 mb-1 font-medium">
                        Lặp theo
                      </Text>
                      <ColoredSegmentGroup
                        value={repeatFrequency.toString()}
                        onChange={(v: string) => setRepeatFrequency(v)}
                        size="sm"
                        color="purple"
                        options={REPEAT_OPTIONS.map((o: any) => ({ label: o.label.replace('Hàng ', ''), value: o.value.toString() }))}
                      />
                    </View>

                    {repeatFrequency === "weekly" && (
                      <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                        <Text className="mb-1">Chọn các ngày trong tuần</Text>
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
                                    Tất cả
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
                        <Text className="mb-1">Chọn các ngày trong tháng</Text>
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
                                    Tất cả
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
                        <Text className="ml-1 mt-0.5 mb-1 font-medium">Số lần lặp (1-100) *</Text>
                        <TextInput
                          className="border p-2 rounded bg-white"
                          keyboardType="number-pad"
                          value={yearlyCount === "" ? "" : String(yearlyCount)}
                          placeholder="Nếu không nhập mặc định là 1"
                          onChangeText={updateYearlyCount}
                        />
                        <Text className="text-xs text-gray-500 mt-1 ml-1">
                          Tự tính ngày kết thúc: {repeatEndDate ? formatDate(new Date(repeatEndDate)) : "--"}
                        </Text>
                      </View>
                    ) : (
                      <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                        <Text className="ml-1 mt-0.5 mb-1 font-medium">Ngày kết thúc lặp *</Text>
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
                      </View>
                    )}
                  </>
                ) : null}
                {editId === null ? (
                  <TouchableOpacity
                    className={`bg-blue-600 p-3 rounded-lg mt-2 ${!newTask.title.trim() ? 'opacity-50' : ''}`}
                    onPress={handleAddWithConstraint}
                    disabled={!newTask.title.trim()}
                  >
                    <Text className="text-white text-center">Thêm công việc</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    className={`bg-blue-600 p-3 rounded-lg mt-2 ${!newTask.title.trim() ? 'opacity-50' : ''}`}
                    onPress={handleEditTask}
                    disabled={!newTask.title.trim()}
                  >
                    <Text className="text-white text-center">Lưu</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  className="bg-gray-300 p-3 rounded-lg mt-2"
                  onPress={onClose}
                >
                  <Text className="text-center">Hủy</Text>
                </TouchableOpacity>
            </>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
