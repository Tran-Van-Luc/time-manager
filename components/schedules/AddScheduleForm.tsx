// components/schedules/AddScheduleForm.tsx
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
import VoiceScheduleInput from "./VoiceScheduleInput";
import { getAllTasks } from "../../database/task";
import { useLanguage } from "../../context/LanguageContext";

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

// Format date to Vietnamese style: dd/mm/yyyy
function formatVietnameseDate(d: Date): string {
  return [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join("/");
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
  const { language } = useLanguage();

  // localized labels (vi / en)
  const L = {
    vi: {
      titleNew: "Thêm lịch mới",
      titleEdit: "Chỉnh sửa lịch",
      courseLabel: "📚 Tên môn học *",
      coursePlaceholder: "VD: Toán cao cấp",
      typeLabel: "📋 Loại lịch",
      instructorLabel: "👨‍🏫 Giảng viên",
      instructorPlaceholder: "VD: TS. Nguyễn Kiều Anh",
      locationLabel: "📍 Địa điểm",
      locationPlaceholder: "VD: Phòng G3",
      startEndDateLabel: "📅 Ngày bắt đầu – kết thúc *",
      dateLabel: "📅 Ngày",
      startEndTimeLabel: "⏰ Giờ bắt đầu – kết thúc *",
      saveNew: "✓ Lưu lịch",
      saveEdit: "✓ Cập nhật",
      conflictTitle: "Trùng lịch",
      conflictMsg: (s: string, a: string, b: string) => `Bạn đã có "${s}" từ ${a} đến ${b}`,
      invalidTitle: "Lỗi",
      invalidMsg: "Vui lòng kiểm tra lại thông tin",
      successCreate: (n: number, name: string) => `Tạo ${n} buổi cho "${name}"`,
      successUpdate: (n: number) => `Đã cập nhật ${n} buổi`,
      errorSave: "Không thể lưu lịch",
      voiceNote: "Ghi âm lịch (nhập bằng giọng nói)",
      pickDateBtn: "Chọn ngày",
    },
    en: {
      titleNew: "Add schedule",
      titleEdit: "Edit schedule",
      courseLabel: "📚 Course name *",
      coursePlaceholder: "e.g. Advanced Mathematics",
      typeLabel: "📋 Type",
      instructorLabel: "👨‍🏫 Instructor",
      instructorPlaceholder: "e.g. Dr. Nguyen",
      locationLabel: "📍 Location",
      locationPlaceholder: "e.g. Room G3",
      startEndDateLabel: "📅 Start – End date *",
      dateLabel: "📅 Date",
      startEndTimeLabel: "⏰ Start – End time *",
      saveNew: "✓ Save",
      saveEdit: "✓ Update",
      conflictTitle: "Schedule conflict",
      conflictMsg: (s: string, a: string, b: string) => `You already have "${s}" from ${a} to ${b}`,
      invalidTitle: "Error",
      invalidMsg: "Please check the information",
      successCreate: (n: number, name: string) => `Created ${n} sessions for "${name}"`,
      successUpdate: (n: number) => `Updated ${n} sessions`,
      errorSave: "Cannot save schedule",
      voiceNote: "Voice schedule input",
      pickDateBtn: "Pick date",
    },
  }[language];

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

  // tasks (client-side list) — dùng để kiểm tra conflict ngay trong form
  const [tasks, setTasks] = useState<Array<Record<string, any>>>([]);

  useEffect(() => {
    loadSchedules();
    // load tasks once for client-side conflict checking
    (async () => {
      try {
        const t = await getAllTasks();
        setTasks(t || []);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // helper: normalize various DB formats to Date | null
  const toDate = (v: any): Date | null => {
    if (v == null) return null;
    if (v instanceof Date) return v;
    if (typeof v === "number") {
      const ms = v < 1e12 ? v * 1000 : v;
      return new Date(ms);
    }
    if (typeof v === "string") {
      if (/^\d+$/.test(v)) {
        const n = parseInt(v, 10);
        const ms = n < 1e12 ? n * 1000 : n;
        return new Date(ms);
      }
      return new Date(v.replace(" ", "T"));
    }
    try {
      return new Date(v);
    } catch {
      return null;
    }
  };

  // helper: try multiple field names safely
  const getField = (o: Record<string, any> | null | undefined, ...names: string[]) => {
    if (!o) return undefined;
    for (const n of names) {
      if (n in o && typeof o[n] !== "undefined") return o[n];
    }
    return undefined;
  };

  // generate occurrences for recurring (weekly) between startDate..endDate for the given startTime/endTime
  const generateRecurringSlots = (sDate: Date, eDate: Date, sTime: Date, eTime: Date) => {
    const slots: Array<{ start: Date; end: Date }> = [];
    const cursor = new Date(sDate);
    while (cursor <= eDate) {
      const s = new Date(cursor);
      s.setHours(sTime.getHours(), sTime.getMinutes(), 0, 0);
      const e = new Date(cursor);
      e.setHours(eTime.getHours(), eTime.getMinutes(), 0, 0);
      slots.push({ start: s, end: e });
      cursor.setDate(cursor.getDate() + 7);
    }
    return slots;
  };

  // conflict check (client-side) — covers both single and recurring; skip current entry when editing
  const conflictDetail = useMemo(() => {
    // prepare candidate slots to check
    const candidateSlots: Array<{ start: Date; end: Date }> = [];

    if (isRecurringType(type)) {
      if (!startDate || !endDate) return undefined;
      if (startDate > endDate) return undefined;
      candidateSlots.push(...generateRecurringSlots(startDate, endDate, startTime, endTime));
    } else {
      const ns = new Date(
        `${formatLocalDate(singleDate)}T${formatLocalTime(startTime)}:00`
      );
      const ne = new Date(
        `${formatLocalDate(singleDate)}T${formatLocalTime(endTime)}:00`
      );
      candidateSlots.push({ start: ns, end: ne });
    }

    const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => {
      return aStart < bEnd && aEnd > bStart;
    };

    // check each candidate slot against schedules and tasks
    for (const slot of candidateSlots) {
      // schedules
      for (const evt of schedules) {
        if (evt.id === initialValues?.id) continue;
        const existingStart = toDate(getField(evt as any, "startAt", "start_at", "start"));
        const existingEnd = toDate(getField(evt as any, "endAt", "end_at", "end"));
        if (!existingStart || !existingEnd) continue;
        if (
          existingStart.getFullYear() === slot.start.getFullYear() &&
          existingStart.getMonth() === slot.start.getMonth() &&
          existingStart.getDate() === slot.start.getDate()
        ) {
          if (overlaps(slot.start, slot.end, existingStart, existingEnd)) {
            return {
              source: "schedule" as const,
              subject: getField(evt as any, "subject", "title") ?? (language === "vi" ? "Môn học" : "Subject"),
              existingStart,
              existingEnd,
            };
          }
        }
      }

      // tasks
      for (const t of tasks) {
        if (typeof getField(t, "is_deleted") !== "undefined" && getField(t, "is_deleted")) continue;
        const existingStart = toDate(getField(t, "start_at", "startAt", "start"));
        const existingEnd = toDate(getField(t, "end_at", "endAt", "end"));
        if (!existingStart || !existingEnd) continue;
        if (
          existingStart.getFullYear() === slot.start.getFullYear() &&
          existingStart.getMonth() === slot.start.getMonth() &&
          existingStart.getDate() === slot.start.getDate()
        ) {
          if (overlaps(slot.start, slot.end, existingStart, existingEnd)) {
            return {
              source: "task" as const,
              subject: getField(t, "title") ?? (language === "vi" ? "Công việc" : "Task"),
              existingStart,
              existingEnd,
            };
          }
        }
      }
    }

    return undefined;
  }, [type, startDate, endDate, singleDate, startTime, endTime, schedules, tasks, initialValues?.id, language]);

  const isValid =
    courseName.trim() !== "" &&
    startTime < endTime &&
    (!isRecurringType(type) ? true : startDate <= endDate) &&
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
          L.conflictTitle,
          L.conflictMsg(
            conflictDetail.subject,
            conflictDetail.existingStart.toLocaleTimeString(),
            conflictDetail.existingEnd.toLocaleTimeString()
          )
        );
      }
      return Alert.alert(L.invalidTitle, L.invalidMsg);
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
        Alert.alert(L.titleEdit, L.successUpdate ? L.successUpdate(count) : `${count} updated`);
      } else {
        const { sessionsCreated } = await createSchedule(params);
        await loadSchedules();
        Alert.alert(L.titleNew, L.successCreate ? L.successCreate(sessionsCreated, courseName) : `Created ${sessionsCreated}`);
      }
      onClose();
    } catch (err: any) {
      Alert.alert(L.invalidTitle, err?.message ?? L.errorSave);
    }
  }

  // handleVoiceParsed: chỉ active khi thêm mới (onSave undefined).
  const handleVoiceParsed = (data: Partial<CreateScheduleParams>) => {
    if (onSave) return;

    if (data.courseName) setCourseName(data.courseName);
    if (data.instructorName) setInstructor(data.instructorName);
    if (data.location) setLocation(data.location);
    if (data.type) setType(data.type);
    if (data.startDate) setStartDate(parseLocalDate(data.startDate));
    if (data.endDate) setEndDate(parseLocalDate(data.endDate));
    if (data.singleDate) setSingleDate(parseLocalDate(data.singleDate));
    if (data.startTime) setStartTime(parseLocalTime(data.startTime));
    if (data.endTime) setEndTime(parseLocalTime(data.endTime));
  };

  return (
    <View style={s.overlay}>
      <View style={s.modal}>
        <View style={s.header}>
          <Text style={s.title}>{onSave ? L.titleEdit : L.titleNew}</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
          {!onSave && <VoiceScheduleInput onParsed={handleVoiceParsed} />}

          {!onSave && <View style={s.divider} />}
          
          <View style={s.inputGroup}>
            <Text style={s.label}>{L.courseLabel}</Text>
            <TextInput 
              style={s.input} 
              placeholder={L.coursePlaceholder} 
              placeholderTextColor="#999"
              value={courseName} 
              onChangeText={setCourseName} 
            />
          </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>{L.typeLabel}</Text>
            <View style={s.picker}>
              <Picker selectedValue={type} onValueChange={(v) => setType(v as ScheduleType)}>
                {types.map((t) => <Picker.Item key={t} label={t} value={t} />)}
              </Picker>
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>{L.instructorLabel}</Text>
            <TextInput 
              style={s.input} 
              placeholder={L.instructorPlaceholder} 
              placeholderTextColor="#999"
              value={instructor} 
              onChangeText={setInstructor} 
            />
          </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>{L.locationLabel}</Text>
            <TextInput 
              style={s.input} 
              placeholder={L.locationPlaceholder} 
              placeholderTextColor="#999"
              value={location} 
              onChangeText={setLocation} 
            />
          </View>

          {isRecurringType(type) ? (
            <View style={s.inputGroup}>
              <Text style={s.label}>{L.startEndDateLabel}</Text>
              <View style={s.row}>
                <TouchableOpacity style={s.dateBtn} onPress={() => openPicker("startDate", "date")}>
                  <Text style={s.dateBtnText}>{formatVietnameseDate(startDate)}</Text>
                  <Text style={s.icon}>📆</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.dateBtn} onPress={() => openPicker("endDate", "date")}>
                  <Text style={s.dateBtnText}>{formatVietnameseDate(endDate)}</Text>
                  <Text style={s.icon}>📆</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={s.inputGroup}>
              <Text style={s.label}>{L.dateLabel}</Text>
              <TouchableOpacity style={s.dateBtn} onPress={() => openPicker("singleDate", "date")}>
                <Text style={s.dateBtnText}>{formatVietnameseDate(singleDate)}</Text>
                <Text style={s.icon}>📆</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={s.inputGroup}>
            <Text style={s.label}>{L.startEndTimeLabel}</Text>
            <View style={s.row}>
              <TouchableOpacity style={s.dateBtn} onPress={() => openPicker("startTime", "time")}>
                <Text style={s.dateBtnText}>{formatLocalTime(startTime)}</Text>
                <Text style={s.icon}>🕐</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dateBtn} onPress={() => openPicker("endTime", "time")}>
                <Text style={s.dateBtnText}>{formatLocalTime(endTime)}</Text>
                <Text style={s.icon}>🕐</Text>
              </TouchableOpacity>
            </View>
          </View>

          {conflictDetail && (
            <View style={s.errorContainer}>
              <Text style={s.errorIcon}>⚠️</Text>
              <Text style={s.error}>
                {language === "vi"
                  ? `Trùng lịch với ${conflictDetail.source === "task" ? "công việc" : "lịch"}: "${conflictDetail.subject}" từ ${conflictDetail.existingStart.toLocaleTimeString()} đến ${conflictDetail.existingEnd.toLocaleTimeString()}`
                  : `Conflict with ${conflictDetail.source === "task" ? "task" : "schedule"}: "${conflictDetail.subject}" from ${conflictDetail.existingStart.toLocaleTimeString()} to ${conflictDetail.existingEnd.toLocaleTimeString()}`}
              </Text>
            </View>
          )}

          <DateTimePickerModal
            isVisible={isPickerVisible}
            mode={pickerMode}
            date={currentPickerDate}
            minimumDate={pickerTarget === "endDate" ? startDate : undefined}
            display={Platform.OS === "ios" ? "inline" : "default"}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />

          <TouchableOpacity 
            style={[s.saveBtn, isValid ? s.saveBtnActive : s.saveBtnDisabled]} 
            onPress={handleSave} 
            disabled={!isValid}
          >
            <Text style={s.saveBtnText}>
              {onSave ? L.saveEdit : L.saveNew}
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
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modal: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  closeBtn: {
    padding: 4,
    marginRight: -4,
  },
  closeBtnText: {
    fontSize: 22,
    color: "#6b7280",
    fontWeight: "300",
  },
  scrollContent: {
    padding: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 8,
  },
  inputGroup: {
    marginBottom: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
    backgroundColor: "#5e72e4",
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 4,
    overflow: "hidden",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    backgroundColor: "#f9fafb",
    color: "#111827",
  },
  picker: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    backgroundColor: "#f9fafb",
    overflow: "hidden",
    height: 42,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  dateBtnText: {
    fontSize: 13,
    color: "#1e40af",
    fontWeight: "500",
  },
  icon: {
    fontSize: 16,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fef3c7",
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
    padding: 8,
    borderRadius: 5,
    marginBottom: 10,
  },
  errorIcon: {
    fontSize: 14,
    marginRight: 5,
    marginTop: 1,
  },
  error: {
    flex: 1,
    color: "#92400e",
    fontSize: 11,
    lineHeight: 16,
  },
  saveBtn: {
    marginTop: 4,
    marginBottom: 6,
    paddingVertical: 10,
    borderRadius: 7,
    alignItems: "center",
  },
  saveBtnActive: {
    backgroundColor: "#5e72e4",
    shadowColor: "#5e72e4",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  saveBtnDisabled: {
    backgroundColor: "#d1d5db",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
