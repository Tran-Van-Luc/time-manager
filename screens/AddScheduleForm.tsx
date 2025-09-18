// screens/AddScheduleForm.tsx
import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { createSchedule, CreateScheduleParams, ScheduleType } from "../database/schedule";
import { useSchedules } from "../hooks/useSchedules";

// 3 loại khi thêm mới
const ADD_TYPES: ScheduleType[] = [
  "Lịch học thường xuyên",
  "Lịch thi",
  "Lịch học bù",
];
// khi sửa, thêm “Lịch tạm ngưng”
const EDIT_TYPES: ScheduleType[] = [...ADD_TYPES, "Lịch tạm ngưng"];

// parse "YYYY-MM-DD" → local Date
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
// format Date → "YYYY-MM-DD"
function formatLocalDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
// format Date → "HH:mm"
function formatLocalTime(d: Date): string {
  return [
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
  ].join(":");
}

interface Props {
  onClose: () => void;
  onSave?: (params: CreateScheduleParams) => Promise<number>;
  initialValues?: Partial<CreateScheduleParams> & { id?: number };
}

export default function AddScheduleForm({
  onClose,
  onSave,
  initialValues,
}: Props) {
  const { schedules, loadSchedules } = useSchedules();

  // choose between add or edit types
  const types = onSave ? EDIT_TYPES : ADD_TYPES;

  // form fields
  const [courseName, setCourseName] = useState(initialValues?.courseName ?? "");
  const [instructor, setInstructor] = useState(initialValues?.instructorName ?? "");
  const [location, setLocation]     = useState(initialValues?.location ?? "");
  const [type, setType]             = useState<ScheduleType>(initialValues?.type ?? types[0]);

  // dates
  const [startDate, setStartDate] = useState<Date>(() => {
    if (initialValues?.startDate) return parseLocalDate(initialValues.startDate);
    if (initialValues?.singleDate) return parseLocalDate(initialValues.singleDate);
    return new Date();
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    if (initialValues?.endDate) return parseLocalDate(initialValues.endDate);
    return new Date(startDate);
  });
  const [singleDate, setSingleDate] = useState<Date>(() =>
    initialValues?.singleDate
      ? parseLocalDate(initialValues.singleDate)
      : new Date()
  );

  // times
  const [startTime, setStartTime] = useState<Date>(() =>
    initialValues?.startTime
      ? new Date(`1970-01-01T${initialValues.startTime}:00`)
      : new Date()
  );
  const [endTime, setEndTime] = useState<Date>(() =>
    initialValues?.endTime
      ? new Date(`1970-01-01T${initialValues.endTime}:00`)
      : new Date(startTime)
  );

  // picker flags
  const [showSD, setShowSD]       = useState(false);
  const [showED, setShowED]       = useState(false);
  const [showSingle, setShowSingle] = useState(false);
  const [showST, setShowST]       = useState(false);
  const [showET, setShowET]       = useState(false);

  useEffect(() => {
    loadSchedules();
  }, []);

  // conflict check (skip current entry when editing)
  const conflictDetail = useMemo(() => {
    if (type === "Lịch học thường xuyên") return undefined;
    const ns = new Date(
      `${formatLocalDate(singleDate)}T${formatLocalTime(startTime)}:00`
    );
    const ne = new Date(
      `${formatLocalDate(singleDate)}T${formatLocalTime(endTime)}:00`
    );
    return schedules.find(evt => {
      if (evt.id === initialValues?.id) return false;
      const sameDay =
        evt.startAt.getFullYear() === ns.getFullYear() &&
        evt.startAt.getMonth() === ns.getMonth() &&
        evt.startAt.getDate() === ns.getDate();
      return sameDay && evt.startAt < ne && evt.endAt > ns;
    });
  }, [type, singleDate, startTime, endTime, schedules, initialValues?.id]);

  const isValid =
    courseName.trim() !== "" &&
    startTime < endTime &&
    (type !== "Lịch học thường xuyên" || startDate <= endDate) &&
    !conflictDetail;

  // save or update
  async function handleSave() {
    if (!isValid) {
      if (conflictDetail) {
        return Alert.alert(
          "Trùng lịch",
          `Bạn đã có "${conflictDetail.subject}" từ ${conflictDetail.startAt.toLocaleTimeString()} đến ${conflictDetail.endAt.toLocaleTimeString()}`
        );
      }
      return Alert.alert("Lỗi", "Vui lòng kiểm tra lại thông tin");
    }

    const base: Partial<CreateScheduleParams> = {
      courseName:     courseName.trim(),
      instructorName: instructor.trim() || undefined,
      location:       location.trim()   || undefined,
      type,
      startTime:      formatLocalTime(startTime),
      endTime:        formatLocalTime(endTime),
    };

    const params: CreateScheduleParams =
      type === "Lịch học thường xuyên"
        ? {
            ...(base as CreateScheduleParams),
            startDate: formatLocalDate(startDate),
            endDate:   formatLocalDate(endDate),
          }
        : {
            ...(base as CreateScheduleParams),
            singleDate: formatLocalDate(singleDate),
          };

    try {
      if (onSave) {
        // EDIT mode: onSave returns the number of sessions updated
        const count = await onSave(params);
        Alert.alert("Cập nhật thành công", `Đã cập nhật ${count} buổi`);
      } else {
        // ADD mode: call createSchedule directly to get sessionsCreated
        const { sessionsCreated } = await createSchedule(params);
        await loadSchedules();
        Alert.alert("Thành công", `Tạo ${sessionsCreated} buổi cho "${courseName}"`);
      }
      onClose();
    } catch {
      Alert.alert(
        "Trùng lịch",
        "Buổi này trùng lịch, vui lòng chọn khung giờ khác"
      );
    }
  }

  return (
    <View style={s.overlay}>
      <View style={s.modal}>
        <View style={s.header}>
          <Text style={s.title}>
            {onSave ? "Chỉnh sửa lịch" : "Thêm lịch mới"}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView>
          {/* Course Name */}
          <Text style={s.label}>Tên môn học *</Text>
          <TextInput
            style={s.input}
            placeholder="VD: Toán cao cấp"
            value={courseName}
            onChangeText={setCourseName}
          />

          {/* Type */}
          <Text style={s.label}>Loại lịch</Text>
          <View style={s.picker}>
            <Picker
              selectedValue={type}
              onValueChange={v => setType(v as ScheduleType)}
            >
              {types.map(t => (
                <Picker.Item key={t} label={t} value={t} />
              ))}
            </Picker>
          </View>

          {/* Instructor */}
          <Text style={s.label}>Giảng viên</Text>
          <TextInput
            style={s.input}
            placeholder="VD: TS. Nguyễn Kiều Anh"
            value={instructor}
            onChangeText={setInstructor}
          />

          {/* Location */}
          <Text style={s.label}>Địa điểm</Text>
          <TextInput
            style={s.input}
            placeholder="VD: Phòng G3"
            value={location}
            onChangeText={setLocation}
          />

          {/* Dates */}
          {type === "Lịch học thường xuyên" ? (
            <>
              <Text style={s.label}>Ngày bắt đầu – kết thúc</Text>
              <View style={s.row}>
                <TouchableOpacity style={s.btn} onPress={() => setShowSD(true)}>
                  <Text>{formatLocalDate(startDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btn} onPress={() => setShowED(true)}>
                  <Text>{formatLocalDate(endDate)}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={s.label}>Ngày</Text>
              <TouchableOpacity style={s.btn} onPress={() => setShowSingle(true)}>
                <Text>{formatLocalDate(singleDate)}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Times */}
          <Text style={s.label}>Giờ bắt đầu – kết thúc</Text>
          <View style={s.row}>
            <TouchableOpacity style={s.btn} onPress={() => setShowST(true)}>
              <Text>{formatLocalTime(startTime)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btn} onPress={() => setShowET(true)}>
              <Text>{formatLocalTime(endTime)}</Text>
            </TouchableOpacity>
          </View>

          {conflictDetail && (
            <Text style={s.error}>
              Trùng lịch: đã có "{conflictDetail.subject}" khung này
            </Text>
          )}

          {/* Pickers */}
          {showSD && (
            <DateTimePicker
              mode="date"
              value={startDate}
              onChange={(_, d) => {
                if (d) {
                  setStartDate(d);
                  if (d > endDate) setEndDate(d);
                }
                if (Platform.OS !== "ios") setShowSD(false);
              }}
            />
          )}
          {showED && (
            <DateTimePicker
              mode="date"
              value={endDate}
              minimumDate={startDate}
              onChange={(_, d) => {
                if (d) setEndDate(d);
                if (Platform.OS !== "ios") setShowED(false);
              }}
            />
          )}
          {showSingle && (
            <DateTimePicker
              mode="date"
              value={singleDate}
              onChange={(_, d) => {
                if (d) setSingleDate(d);
                if (Platform.OS !== "ios") setShowSingle(false);
              }}
            />
          )}
          {showST && (
            <DateTimePicker
              mode="time"
              value={startTime}
              onChange={(_, d) => {
                if (d) {
                  setStartTime(d);
                  if (d > endTime) setEndTime(d);
                }
                if (Platform.OS !== "ios") setShowST(false);
              }}
            />
          )}
          {showET && (
            <DateTimePicker
              mode="time"
              value={endTime}
              minimumDate={startTime}
              onChange={(_, d) => {
                if (d) setEndTime(d);
                if (Platform.OS !== "ios") setShowET(false);
              }}
            />
          )}

          {/* Save */}
          <TouchableOpacity
            style={[s.saveBtn, isValid ? s.saveBtnActive : s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!isValid}
          >
            <Text style={[s.saveBtnText, !isValid && s.saveBtnTextDisabled]}>
              {onSave ? "Cập nhật" : "Lưu lịch"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "90%",
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
  },
  label: {
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
  },
  picker: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  btn: {
    flex: 1,
    padding: 12,
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
    marginRight: 8,
    alignItems: "center",
  },
  error: {
    color: "red",
    marginTop: 8,
  },
  saveBtn: {
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  saveBtnActive: {
    backgroundColor: "#007AFF",
  },
  saveBtnDisabled: {
    backgroundColor: "#ccc",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
  saveBtnTextDisabled: {
    color: "#666",
  },
});
