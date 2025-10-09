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
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { Picker } from "@react-native-picker/picker";
import {
  createSchedule,
  CreateScheduleParams,
  ScheduleType,
} from "../../database/schedule";
import { useSchedules } from "../../hooks/useSchedules";

// Các loại lịch
const ADD_TYPES: ScheduleType[] = [
  "Lịch học lý thuyết",
  "Lịch học thực hành",
  "Lịch thi",
  "Lịch học bù",
];
const EDIT_TYPES: ScheduleType[] = [...ADD_TYPES, "Lịch tạm ngưng"];

// Kiểm tra loại recurring
function isRecurringType(t: ScheduleType) {
  return t === "Lịch học lý thuyết" || t === "Lịch học thực hành";
}

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

// parse "HH:mm" → local Date (tránh lệch múi giờ)
function parseLocalTime(timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
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

  const types = onSave ? EDIT_TYPES : ADD_TYPES;

  const [courseName, setCourseName] = useState(
    initialValues?.courseName ?? ""
  );
  const [instructor, setInstructor] = useState(
    initialValues?.instructorName ?? ""
  );
  const [location, setLocation] = useState(initialValues?.location ?? "");
  const [type, setType] = useState<ScheduleType>(
    (initialValues?.type as ScheduleType) ?? types[0]
  );

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
    initialValues?.singleDate ? parseLocalDate(initialValues.singleDate) : new Date()
  );

  // times
  const [startTime, setStartTime] = useState<Date>(() =>
    initialValues?.startTime ? parseLocalTime(initialValues.startTime) : new Date()
  );
  const [endTime, setEndTime] = useState<Date>(() =>
    initialValues?.endTime ? parseLocalTime(initialValues.endTime) : new Date(startTime)
  );

  useEffect(() => {
    loadSchedules();
  }, []);

  // conflict check (skip current entry when editing)
  const conflictDetail = useMemo(() => {
    if (isRecurringType(type)) return undefined;
    const ns = new Date(
      `${formatLocalDate(singleDate)}T${formatLocalTime(startTime)}:00`
    );
    const ne = new Date(
      `${formatLocalDate(singleDate)}T${formatLocalTime(endTime)}:00`
    );
    return schedules.find((evt) => {
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
    ( !isRecurringType(type) ? true : startDate <= endDate ) &&
    !conflictDetail;

  // Picker states
  type PickerTarget = "startDate" | "endDate" | "singleDate" | "startTime" | "endTime";
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  const openPicker = (target: PickerTarget, mode: "date" | "time") => {
    setPickerTarget(target);
    setPickerMode(mode);
    setPickerVisible(true);
  };

  const handleConfirm = (date: Date) => {
    if (pickerTarget === "startDate") {
      setStartDate(date);
      if (date > endDate) setEndDate(date);
    } else if (pickerTarget === "endDate") {
      setEndDate(date);
    } else if (pickerTarget === "singleDate") {
      setSingleDate(date);
    } else if (pickerTarget === "startTime") {
      setStartTime(date);
      if (date > endTime) setEndTime(date);
    } else if (pickerTarget === "endTime") {
      setEndTime(date);
    }
    setPickerVisible(false);
  };

  const handleCancel = () => {
    setPickerVisible(false);
  };

  const currentPickerDate =
    pickerTarget === "startDate" ? startDate :
    pickerTarget === "endDate" ? endDate :
    pickerTarget === "singleDate" ? singleDate :
    pickerTarget === "startTime" ? startTime : endTime;

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
      courseName: courseName.trim(),
      instructorName: instructor.trim() || undefined,
      location: location.trim() || undefined,
      type,
      startTime: formatLocalTime(startTime),
      endTime: formatLocalTime(endTime),
    };

    const params: CreateScheduleParams = isRecurringType(type)
      ? {
          ...(base as CreateScheduleParams),
          startDate: formatLocalDate(startDate),
          endDate: formatLocalDate(endDate),
        }
      : {
          ...(base as CreateScheduleParams),
          singleDate: formatLocalDate(singleDate),
        };

    try {
      if (onSave) {
        const count = await onSave(params);
        Alert.alert("Cập nhật thành công", `Đã cập nhật ${count} buổi`);
      } else {
        const { sessionsCreated } = await createSchedule(params);
        await loadSchedules();
        Alert.alert("Thành công", `Tạo ${sessionsCreated} buổi cho "${courseName}"`);
      }
      onClose();
    } catch (err: any) {
      Alert.alert("Lỗi", err?.message ?? "Không thể lưu lịch");
    }
  }

  return (
    <View style={s.overlay}>
      <View style={s.modal}>
        <View style={s.header}>
          <Text style={s.title}>{onSave ? "Chỉnh sửa lịch" : "Thêm lịch mới"}</Text>
          <TouchableOpacity onPress={onClose}><Text style={{fontSize:18}}>✕</Text></TouchableOpacity>
        </View>

        <ScrollView>
          <Text style={s.label}>Tên môn học *</Text>
          <TextInput style={s.input} placeholder="VD: Toán cao cấp" value={courseName} onChangeText={setCourseName} />

          <Text style={s.label}>Loại lịch</Text>
          <View style={s.picker}>
            <Picker selectedValue={type} onValueChange={(v) => setType(v as ScheduleType)}>
              {types.map((t) => <Picker.Item key={t} label={t} value={t} />)}
            </Picker>
          </View>

          <Text style={s.label}>Giảng viên</Text>
          <TextInput style={s.input} placeholder="VD: TS. Nguyễn Kiều Anh" value={instructor} onChangeText={setInstructor} />

          <Text style={s.label}>Địa điểm</Text>
          <TextInput style={s.input} placeholder="VD: Phòng G3" value={location} onChangeText={setLocation} />

          {isRecurringType(type) ? (
            <>
              <Text style={s.label}>Ngày bắt đầu – kết thúc</Text>
              <View style={s.row}>
                <TouchableOpacity style={s.btn} onPress={() => openPicker("startDate", "date")}>
                  <Text>{formatLocalDate(startDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btn} onPress={() => openPicker("endDate", "date")}>
                  <Text>{formatLocalDate(endDate)}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={s.label}>Ngày</Text>
              <TouchableOpacity style={s.btn} onPress={() => openPicker("singleDate", "date")}>
                <Text>{formatLocalDate(singleDate)}</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={s.label}>Giờ bắt đầu – kết thúc</Text>
          <View style={s.row}>
            <TouchableOpacity style={s.btn} onPress={() => openPicker("startTime", "time")}>
              <Text>{formatLocalTime(startTime)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btn} onPress={() => openPicker("endTime", "time")}>
              <Text>{formatLocalTime(endTime)}</Text>
            </TouchableOpacity>
          </View>

          {conflictDetail && <Text style={s.error}>Trùng lịch: đã có "{conflictDetail.subject}" khung này</Text>}

          <DateTimePickerModal
            isVisible={isPickerVisible}
            mode={pickerMode}
            date={currentPickerDate}
            minimumDate={pickerTarget === "endDate" ? startDate : undefined}
            display={Platform.OS === "ios" ? "inline" : "default"}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />

          <TouchableOpacity style={[s.saveBtn, isValid ? s.saveBtnActive : s.saveBtnDisabled]} onPress={handleSave} disabled={!isValid}>
            <Text style={[s.saveBtnText, !isValid && s.saveBtnTextDisabled]}>{onSave ? "Cập nhật" : "Lưu lịch"}</Text>
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
