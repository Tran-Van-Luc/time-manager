import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Switch,
  Platform as RNPlatform,
  Alert,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import FilterPicker from "./SelectBox";

export default function TaskModal({
  visible,
  onClose,
  inputMode,
  setInputMode,
  importing,
  setImporting,
  editId,
  setEditId,
  newTask,
  setNewTask,
  handleAddTask,
  handleEditTask,
  handleDownloadTemplate,
  handleImportFile,
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
}: any) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/40 justify-center items-center">
        <View className="bg-white w-11/12 p-4 rounded-lg">
          <ScrollView>
            {/* Nút chuyển đổi chế độ nhập */}
            <View className="flex-row justify-center mb-3">
              <TouchableOpacity
                className={`px-4 py-2 rounded-l-lg border ${
                  inputMode === "manual"
                    ? "bg-blue-600 border-blue-600"
                    : "bg-gray-200 border-gray-400"
                }`}
                onPress={() => setInputMode("manual")}
                disabled={inputMode === "manual"}
              >
                <Text
                  className={`${
                    inputMode === "manual" ? "text-white" : "text-black"
                  }`}
                >
                  Thêm thủ công
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`px-4 py-2 rounded-r-lg border ${
                  inputMode === "file"
                    ? "bg-blue-600 border-blue-600"
                    : "bg-gray-200 border-gray-400"
                }`}
                onPress={() => setInputMode("file")}
                disabled={inputMode === "file"}
              >
                <Text
                  className={`${
                    inputMode === "file" ? "text-white" : "text-black"
                  }`}
                >
                  Nhập từ file
                </Text>
              </TouchableOpacity>
            </View>

            {/* Nếu nhập file */}
            {inputMode === "file" ? (
              <>
                <Text className="text-lg font-bold mb-3">
                  Nhập công việc từ file Excel
                </Text>
                <TouchableOpacity
                  className="bg-green-600 p-3 rounded-lg mb-3"
                  onPress={handleDownloadTemplate}
                >
                  <Text className="text-white text-center">
                    Tải file mẫu Excel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-blue-600 p-3 rounded-lg mb-3"
                  onPress={handleImportFile}
                  disabled={importing}
                >
                  <Text className="text-white text-center">
                    {importing ? "Đang nhập..." : "Chọn file để nhập"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-gray-300 p-3 rounded-lg mt-2"
                  onPress={onClose}
                >
                  <Text className="text-center">Hủy</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text className="text-lg font-bold mb-3">
                  {editId === null ? "Thêm công việc mới" : "Sửa công việc"}
                </Text>
                <TextInput
                  placeholder="Tiêu đề công việc (bắt buộc)"
                  value={newTask.title}
                  onChangeText={(t) =>
                    setNewTask((prev: any) => ({ ...prev, title: t }))
                  }
                  className="border p-2 rounded mb-2"
                />
                <TextInput
                  placeholder="Mô tả (tùy chọn)"
                  value={newTask.description}
                  onChangeText={(t) =>
                    setNewTask((prev: any) => ({ ...prev, description: t }))
                  }
                  className="border p-2 rounded mb-2"
                />
                {/* Ngày giờ bắt đầu */}
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === "android") {
                      DateTimePickerAndroid.open({
                        value: newTask.start_at
                          ? new Date(newTask.start_at)
                          : new Date(),
                        minimumDate: new Date(),
                        mode: "date",
                        is24Hour: true,
                        onChange: (event, date) => {
                          if (event.type === "set" && date) {
                            DateTimePickerAndroid.open({
                              value: date,
                              mode: "time",
                              is24Hour: true,
                              onChange: (event2, time) => {
                                if (event2.type === "set" && time) {
                                  const combined = new Date(
                                    date.getFullYear(),
                                    date.getMonth(),
                                    date.getDate(),
                                    time.getHours(),
                                    time.getMinutes()
                                  );
                                  const now = Date.now();
                                  const FIVE_MINUTES = 5 * 60 * 1000;
                                  if (combined.getTime() < now - FIVE_MINUTES) {
                                    Alert.alert(
                                      "Chỉ được chọn thời gian bắt đầu sớm hơn hiện tại tối đa 5 phút!"
                                    );
                                    return;
                                  }
                                  setNewTask((prev: any) => ({
                                    ...prev,
                                    start_at: combined.getTime(),
                                  }));
                                }
                              },
                            });
                          }
                        },
                      });
                    } else {
                      setShowStartPicker(true);
                    }
                  }}
                  className="border p-2 rounded mb-2 bg-gray-50"
                >
                  <Text>
                    Ngày giờ bắt đầu:{" "}
                    {newTask.start_at
                      ? new Date(newTask.start_at).toLocaleString()
                      : "--"}
                  </Text>
                </TouchableOpacity>
                {Platform.OS === "ios" && showStartPicker && (
                  <DateTimePicker
                    value={
                      newTask.start_at ? new Date(newTask.start_at) : new Date()
                    }
                    minimumDate={new Date()}
                    mode="datetime"
                    display="inline"
                    onChange={(event, date) => {
                      setShowStartPicker(false);
                      if (event.type === "set" && date) {
                        const now = Date.now();
                        const FIVE_MINUTES = 5 * 60 * 1000;
                        if (date.getTime() < now - FIVE_MINUTES) {
                          Alert.alert(
                            "Chỉ được chọn thời gian bắt đầu sớm hơn hiện tại tối đa 5 phút!"
                          );
                          return;
                        }
                        setNewTask((prev: any) => ({
                          ...prev,
                          start_at: date.getTime(),
                        }));
                      }
                    }}
                  />
                )}

                {/* Ngày giờ kết thúc */}
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === "android") {
                      DateTimePickerAndroid.open({
                        value: newTask.end_at
                          ? new Date(newTask.end_at)
                          : new Date(),
                        minimumDate: new Date(),
                        mode: "date",
                        is24Hour: true,
                        onChange: (event, date) => {
                          if (event.type === "set" && date) {
                            DateTimePickerAndroid.open({
                              value: date,
                              mode: "time",
                              is24Hour: true,
                              onChange: (event2, time) => {
                                if (event2.type === "set" && time) {
                                  const combined = new Date(
                                    date.getFullYear(),
                                    date.getMonth(),
                                    date.getDate(),
                                    time.getHours(),
                                    time.getMinutes()
                                  );
                                  const startAt = newTask.start_at || 0;
                                  if (startAt && combined.getTime() <= startAt) {
                                    Alert.alert(
                                      "Ngày giờ kết thúc phải sau ngày giờ bắt đầu!"
                                    );
                                    return;
                                  }
                                  setNewTask((prev: any) => ({
                                    ...prev,
                                    end_at: combined.getTime(),
                                  }));
                                }
                              },
                            });
                          }
                        },
                      });
                    } else {
                      setShowEndPicker(true);
                    }
                  }}
                  className="border p-2 rounded mb-2 bg-gray-50"
                >
                  <Text>
                    Ngày giờ kết thúc:{" "}
                    {newTask.end_at
                      ? new Date(newTask.end_at).toLocaleString()
                      : "--"}
                  </Text>
                </TouchableOpacity>
                {Platform.OS === "ios" && showEndPicker && (
                  <DateTimePicker
                    value={newTask.end_at ? new Date(newTask.end_at) : new Date()}
                    minimumDate={new Date()}
                    mode="datetime"
                    display="inline"
                    onChange={(event, date) => {
                      setShowEndPicker(false);
                      if (event.type === "set" && date) {
                        const startAt = newTask.start_at || 0;
                        if (startAt && date.getTime() <= startAt) {
                          Alert.alert(
                            "Ngày giờ kết thúc phải sau ngày giờ bắt đầu!"
                          );
                          return;
                        }
                        setNewTask((prev: any) => ({
                          ...prev,
                          end_at: date.getTime(),
                        }));
                      }
                    }}
                  />
                )}

                {/* Mức độ */}
                <FilterPicker
                  value={newTask.priority}
                  onChange={(v: any) =>
                    setNewTask((prev: any) => ({ ...prev, priority: v }))
                  }
                  options={PRIORITY_OPTIONS}
                />

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
                      <FilterPicker
                        value={reminderTime.toString()}
                        onChange={(v: any) => setReminderTime(Number(v))}
                        options={REMINDER_OPTIONS.map((o: any) => ({
                          label: o.label,
                          value: o.value.toString(),
                        }))}
                      />
                    </View>

                    <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                      <Text className="ml-1 mt-0.5 mb-1 font-medium">
                        Phương thức nhắc
                      </Text>
                      <FilterPicker
                        value={reminderMethod}
                        onChange={(v: any) => setReminderMethod(v)}
                        options={[
                          { label: "Thông báo", value: "notification" },
                          { label: "Email", value: "email" },
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
                        Loại lặp
                      </Text>
                      <FilterPicker
                        value={repeatFrequency.toString()}
                        onChange={(v: any) => setRepeatFrequency(v)}
                        options={REPEAT_OPTIONS.map((o: any) => ({
                          label: o.label,
                          value: o.value.toString(),
                        }))}
                        placeholder="Chọn loại lặp"
                      />
                    </View>

                    <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                      <Text className="ml-1 mt-0.5 mb-1 font-medium">
                        {repeatFrequency === "daily" &&
                          "Lặp lại mỗi bao nhiêu ngày"}
                        {repeatFrequency === "weekly" &&
                          "Lặp lại mỗi bao nhiêu tuần"}
                        {repeatFrequency === "monthly" &&
                          "Lặp lại mỗi bao nhiêu tháng"}
                        {repeatFrequency === "yearly" &&
                          "Lặp lại mỗi bao nhiêu năm"}
                        {!repeatFrequency && "Khoảng cách lặp"}
                      </Text>

                      <TextInput
                        keyboardType="numeric"
                        value={
                          repeatInterval === 0 ? "" : repeatInterval.toString()
                        }
                        onChangeText={(v: string) => {
                          if (v === "")
                            setRepeatInterval(0);
                          else {
                            const num = Number(v);
                            setRepeatInterval(num > 0 ? num : 1);
                          }
                        }}
                        onBlur={() => {
                          if (repeatInterval === 0) setRepeatInterval(1);
                        }}
                        className="border border-black bg-gray-50 rounded p-1 mt-1"
                      />

                      <Text className="text-blue-600 mt-1">
                        {repeatFrequency === "daily" && repeatInterval > 1
                          ? `Cách ${repeatInterval} ngày lặp lại 1 lần`
                          : repeatFrequency === "weekly" && repeatInterval > 1
                          ? `Cách ${repeatInterval} tuần lặp lại 1 lần`
                          : repeatFrequency === "monthly" && repeatInterval > 1
                          ? `Cách ${repeatInterval} tháng lặp lại 1 lần`
                          : repeatFrequency === "yearly" && repeatInterval > 1
                          ? `Cách ${repeatInterval} năm lặp lại 1 lần`
                          : repeatFrequency === "daily"
                          ? "Lặp lại mỗi ngày"
                          : repeatFrequency === "weekly"
                          ? "Lặp lại mỗi tuần"
                          : repeatFrequency === "monthly"
                          ? "Lặp lại mỗi tháng"
                          : repeatFrequency === "yearly"
                          ? "Lặp lại mỗi năm"
                          : ""}
                      </Text>
                    </View>

                    {repeatFrequency === "weekly" && (
                      <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                        <Text className="mb-1">Chọn các ngày trong tuần</Text>
                        <View className="flex-row flex-wrap mt-1">
                          {[
                            { value: "Mon", label: "T2" },
                            { value: "Tue", label: "T3" },
                            { value: "Wed", label: "T4" },
                            { value: "Thu", label: "T5" },
                            { value: "Fri", label: "T6" },
                            { value: "Sat", label: "T7" },
                            { value: "Sun", label: "CN" },
                          ].map((opt) => {
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
                                <Text
                                  className={`${isSelected ? "text-white" : "text-gray-800"}`}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {repeatFrequency === "monthly" && (
                      <View className="border border-gray-300 rounded-lg bg-gray-100 mb-2 p-2">
                        <Text className="mb-1">Chọn các ngày trong tháng</Text>
                        <View className="flex-row flex-wrap mt-1">
                          {[...Array(31)].map((_, i) => {
                            const day = i + 1;
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
                                <Text
                                  className={`${selected ? "text-white" : "text-gray-800"}`}
                                >
                                  {day}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </>
                ) : null}
                {editId === null ? (
                  <TouchableOpacity
                    className={`bg-blue-600 p-3 rounded-lg mt-2 ${!newTask.title.trim() ? 'opacity-50' : ''}`}
                    onPress={handleAddTask}
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
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
