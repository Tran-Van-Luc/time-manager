// screens/ScheduleScreen.tsx
import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import AddScheduleForm from "./AddScheduleForm";
import { useSchedules, ScheduleItem } from "../hooks/useSchedules";
import DayView from "../components/DayView";
import WeekView from "../components/WeekView";
import ScheduleDetailModal from "../components/ScheduleDetailModal";

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { CreateScheduleParams, ScheduleType } from "../database/schedule";

const TYPE_STYLE: Record<string, { color: string; emoji: string; pillBg: string }> = {
  "Lịch học thường xuyên": { color: "#1D4ED8", emoji: "📚", pillBg: "#DBEAFE" },
  "Lịch thi": { color: "#DC2626", emoji: "📝", pillBg: "#FECACA" },
  "Lịch tạm ngưng": { color: "#D97706", emoji: "⏸", pillBg: "#FDE68A" },
  "Lịch học bù": { color: "#047857", emoji: "📅", pillBg: "#BBF7D0" },
};

const DAY_NAMES = ["Chủ nhật","Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6","Thứ 7"];

function capitalize(str?: string) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ScheduleScreen() {
  const {
    schedules,
    loading,
    loadSchedules,
    addSchedule,
    deleteSchedule,
    updateSchedule,
  } = useSchedules();

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [viewMode, setViewMode] = useState<"day" | "week">("day");

  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [importing, setImporting] = useState(false);

  // build tuần thứ 2→CN
  const weekDates = useMemo(() => {
    const d = selectedDate.getDay();
    const offset = d === 0 ? -6 : 1 - d;
    const mon = new Date(selectedDate);
    mon.setDate(mon.getDate() + offset);
    mon.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(mon);
      day.setDate(mon.getDate() + i);
      return day;
    });
  }, [selectedDate]);

  // lọc theo ngày hoặc tuần
  const filtered = useMemo(() => {
    if (viewMode === "day") {
      return schedules.filter(
        (s) =>
          s.startAt.getFullYear() === selectedDate.getFullYear() &&
          s.startAt.getMonth() === selectedDate.getMonth() &&
          s.startAt.getDate() === selectedDate.getDate()
      );
    }
    const start = weekDates[0];
    const end = new Date(weekDates[6]);
    end.setHours(23, 59, 59, 999);
    return schedules.filter((s) => s.startAt >= start && s.startAt <= end);
  }, [schedules, selectedDate, viewMode, weekDates]);

  const sections = useMemo(() => {
    return Object.keys(TYPE_STYLE).map((type) => ({
      title: type,
      data: filtered.filter((s) => s.type === type),
    }));
  }, [filtered]);

  useEffect(() => {
    loadSchedules();
  }, []);
  
  function handleDetailEdit(id: number) {
    const itm = schedules.find(s => s.id === id);
    if (!itm) return;
    setEditingItem(itm);
    setShowEditModal(true);
  }

  function handleDetailDelete(id: number) {
    Alert.alert(
      "Xác nhận xóa",
      "Bạn có chắc muốn xóa buổi này không?",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa",
          style: "destructive",
          onPress: () => {
            deleteSchedule(id);
            setSelectedItem(null);
          },
        },
      ]
    );
  }

  async function handleImportExcel() {
  if (importing) return;
  setImporting(true);
  console.log("▶️ handleImportExcel bắt đầu");

  try {
    // 1) Mở file picker
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ],
    });
    if (res.canceled) {
      console.log("⏭ User canceled");
      return;
    }
    const uri = res.assets[0].uri;
    console.log("📄 Chosen URI:", uri);

    // 2) Đọc base64
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });

    // 3) Parse workbook
    const wb = XLSX.read(b64, { type: "base64", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      blankrows: false,
      raw: true,
    });
    console.log("🔥 raw row count:", raw.length);

    // 4) Find header row
    const headerRowIndex = raw.findIndex(row =>
      row.some(cell => String(cell).trim() === "Tên môn học")
    );
    if (headerRowIndex < 0) {
      Alert.alert("Lỗi import", "Không tìm thấy header “Tên môn học”");
      return;
    }
    const header = raw[headerRowIndex].map(c => String(c).trim());
    console.log("✅ Detected header:", header);

    // 5) Column indexes
    const findIdx = (name: string) => {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`Thiếu cột “${name}”`);
      return i;
    };
    const idx = {
      courseName: findIdx("Tên môn học"),
      type:       findIdx("Loại lịch"),
      instructor: findIdx("Giảng viên"),
      location:   findIdx("Địa điểm"),
      startDate:  findIdx("Ngày bắt đầu"),
      endDate:    findIdx("Ngày kết thúc"),
      startTime:  findIdx("Giờ bắt đầu"),
      endTime:    findIdx("Giờ kết thúc"),
    };

    // 6) Data rows
    const rows = raw.slice(headerRowIndex + 1);
    console.log("🛠️ Data rows to import:", rows.length);

    // Helpers để parse Excel cells
    const pad2 = (n: number) => String(n).padStart(2, "0");
    function toDateParts(v: any): [number, number, number] {
      if (v instanceof Date) return [v.getFullYear(), v.getMonth() + 1, v.getDate()];
      if (typeof v === "number") {
        const o = XLSX.SSF.parse_date_code(v);
        return [o.y, o.m, o.d];
      }
      const s = String(v).trim();
      if (s.includes("/")) {
        const [dd, mm, yyyy] = s.split("/").map(Number);
        return [yyyy, mm, dd];
      }
      return s.split("-").map(Number) as [number, number, number];
    }
    function toTimeParts(v: any): [number, number] {
      if (v instanceof Date) return [v.getHours(), v.getMinutes()];
      if (typeof v === "number") {
        const total = Math.round(v * 24 * 60);
        return [Math.floor(total / 60), total % 60];
      }
      return String(v).trim().split(":").map(Number) as [number, number];
    }

    // 7) Duyệt rows, import và collect conflict
    let addedCount = 0;
    const conflictMessages: string[] = [];
    const validTypes: ScheduleType[] = [
      "Lịch học thường xuyên",
      "Lịch thi",
      "Lịch học bù",
      "Lịch tạm ngưng",
    ];

    for (let i = 0; i < rows.length; i++) {
      const row         = rows[i];
      const rawName     = String(row[idx.courseName] ?? "").trim();
      const rawType     = String(row[idx.type]       ?? "").trim();
      if (!rawName || !rawType) {
        console.warn(`Dòng ${i+2} bỏ qua: thiếu môn hoặc loại.`);
        continue;
      }

      // Validate and cast type
      if (!validTypes.includes(rawType as ScheduleType)) {
        console.warn(`Dòng ${i+2} bỏ qua: Loại lịch không hợp lệ "${rawType}".`);
        continue;
      }
      const scheduleType = rawType as ScheduleType;

      // Raw date/time
      const sdRaw = row[idx.startDate];
      const edRaw = row[idx.endDate];
      const stRaw = row[idx.startTime];
      const etRaw = row[idx.endTime];
      if (!sdRaw || !stRaw || !etRaw) {
        console.warn(`Dòng ${i+2} bỏ qua: thiếu ngày/giờ.`);
        continue;
      }

      // Parse thành string
      const [y, m, d]    = toDateParts(sdRaw);
      const [sh, sm]     = toTimeParts(stRaw);
      const [eh, em]     = toTimeParts(etRaw);
      const startDate    = `${y}-${pad2(m)}-${pad2(d)}`;
      const startTime    = `${pad2(sh)}:${pad2(sm)}`;
      const endTime      = `${pad2(eh)}:${pad2(em)}`;

      let params: CreateScheduleParams;
      if (scheduleType === "Lịch học thường xuyên") {
        const [ey, emn, eday] = edRaw
          ? toDateParts(edRaw)
          : [y, m, d];
        const endDate = `${ey}-${pad2(emn)}-${pad2(eday)}`;
        params = {
          courseName:     rawName,
          type:           scheduleType,
          instructorName: row[idx.instructor]?.trim(),
          location:       row[idx.location]?.trim(),
          startDate,
          endDate,
          startTime,
          endTime,
        };
      } else {
        params = {
          courseName:     rawName,
          type:           scheduleType,
          instructorName: row[idx.instructor]?.trim(),
          location:       row[idx.location]?.trim(),
          singleDate:     startDate,
          startTime,
          endTime,
        };
      }

      console.log(`→ import dòng ${i+2}:`, params);
      try {
        await addSchedule(params);
        addedCount++;
      } catch (e: any) {
        const msg = e.message.includes("Xung đột")
          ? `Dòng ${i+2}: ${e.message}`
          : `Dòng ${i+2}: Không thể thêm (${e.message})`;
        conflictMessages.push(msg);
        console.warn(msg);
      }
    }

    // 8) Reload và show alert
    await loadSchedules();
    let alertMsg = `Đã thêm ${addedCount} buổi.`;
    if (conflictMessages.length) {
      alertMsg += `\nKhông thêm được ${conflictMessages.length} buổi do trùng:\n`
                + conflictMessages.join("\n");
    }
    Alert.alert("Kết quả import", alertMsg);

  } catch (err: any) {
    console.error("❌ handleImportExcel error:", err);
    Alert.alert("Lỗi import Excel", err.message);
  } finally {
    setImporting(false);
  }
}

  function renderSectionHeader({ section }: { section: any }) {
    const st = TYPE_STYLE[section.title];
    return (
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionHeaderText, { color: st.color }]}>
          {st.emoji} {section.title}
        </Text>
      </View>
    );
  }

  function renderItem({ item }: { item: ScheduleItem }) {
    const st =
      TYPE_STYLE[item.type] || {
        color: "#6B7280",
        pillBg: "#E5E7EB",
        emoji: "",
      };
    const dayName = DAY_NAMES[item.startAt.getDay()];
    const fmt = (d: Date) =>
      `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`;

    return (
      <View style={[styles.card, { borderLeftColor: st.color }]}>
        <View style={styles.line1}>
          <Text style={styles.subjectText}>{capitalize(item.subject)}</Text>
          <View style={[styles.typeTag, { backgroundColor: st.pillBg }]}>
            <Text style={{ color: st.color, fontWeight: "600" }}>
              {capitalize(item.type.replace("Lịch ", ""))}
            </Text>
          </View>
        </View>
        <Text style={styles.infoText}>
          🗓️ {dayName} ⏰ {fmt(item.startAt)} – {fmt(item.endAt)}
        </Text>
        <Text style={styles.infoText}>
          👨‍🏫 {capitalize(item.instructorName ?? "") || "Chưa có giảng viên"}
        </Text>
        <View style={styles.bottomRow}>
          <Text style={styles.infoText}>
            📍 {capitalize(item.location ?? "") || "Chưa có địa điểm"}
          </Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={() => {
                setEditingItem(item);
                setShowEditModal(true);
              }}
            >
              <AntDesign name="edit" size={20} color="#74C0FC" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ marginLeft: 12 }}
              onPress={() =>
                Alert.alert("Xác nhận xóa", "Bạn có chắc muốn xóa buổi này không?", [
                  { text: "Hủy", style: "cancel" },
                  {
                    text: "Xóa",
                    style: "destructive",
                    onPress: () => {
                      deleteSchedule(item.id);
                      Alert.alert("Xóa thành công");
                    },
                  },
                ])
              }
            >
              <AntDesign name="delete" size={20} color="#bf2222" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Thời khóa biểu</Text>

        <View style={styles.headerActions}>
          {/* Nút Import Excel */}
          <TouchableOpacity
            style={styles.importButton}
            onPress={handleImportExcel}
          >
            <AntDesign name="upload" size={20} color="#1D4ED8" />
            <Text style={styles.importText}>Import Excel</Text>
          </TouchableOpacity>
        </View>

        <DayView
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          viewMode={viewMode}
          setViewMode={setViewMode}
          showDatePicker={showDatePicker}
          setShowDatePicker={setShowDatePicker}
        />
      </View>

      {loading && <Text style={styles.empty}>Đang tải...</Text>}

      {viewMode === "day" ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id.toString()}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.empty}>Không có lịch hôm nay.</Text>
          }
        />
      ) : (
        <WeekView
          weekDates={weekDates}
          schedules={filtered}
          typeStyle={TYPE_STYLE}
          onSelectItem={setSelectedItem}
        />
      )}

      <ScheduleDetailModal
        visible={!!selectedItem}
        item={selectedItem}
        typeStyle={TYPE_STYLE}
        onClose={() => setSelectedItem(null)}
        onEdit={handleDetailEdit}
        onDelete={handleDetailDelete}
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddModal(true)}
      >
        <AntDesign name="plus" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={showAddModal} transparent animationType="slide">
        <AddScheduleForm
          onClose={() => {
            setShowAddModal(false);
            loadSchedules();
          }}
        />
      </Modal>

      {!!editingItem && (
        <Modal visible={showEditModal} transparent animationType="slide">
          <AddScheduleForm
            initialValues={{
              id: editingItem.id,
              courseName: editingItem.subject,
              instructorName: editingItem.instructorName ?? undefined,
              location: editingItem.location ?? undefined,
              type: editingItem.type as any,
              singleDate: editingItem.startAt.toLocaleDateString("en-CA"),
              startDate: editingItem.startAt.toLocaleDateString("en-CA"),
              endDate: editingItem.endAt.toLocaleDateString("en-CA"),
              startTime: `${String(editingItem.startAt.getHours()).padStart(
                2,
                "0"
              )}:${String(editingItem.startAt.getMinutes()).padStart(2, "0")}`,
              endTime: `${String(editingItem.endAt.getHours()).padStart(
                2,
                "0"
              )}:${String(editingItem.endAt.getMinutes()).padStart(2, "0")}`,
            }}
            onSave={async (params) => {
              await updateSchedule(editingItem.id, params);
              return 1;
            }}
            onClose={() => {
              setShowEditModal(false);
              setEditingItem(null);
              loadSchedules();
            }}
          />
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  headerRow: { flexDirection: "column", marginBottom: 8 },
  pageTitle: { fontSize: 22, fontWeight: "bold" },
  headerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginVertical: 6,
    marginTop: -28,
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#1D4ED8",
  },
  importText: { marginLeft: 4, color: "#1D4ED8", fontWeight: "600" },
  sectionHeader: { paddingVertical: 6, marginTop: 16 },
  sectionHeaderText: { fontSize: 16, fontWeight: "bold" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  line1: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  subjectText: { flex: 1, fontWeight: "bold", fontSize: 16, color: "#111" },
  typeTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  infoText: { fontSize: 14, color: "#374151", marginTop: 2 },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  actionsRow: { flexDirection: "row" },
  empty: { textAlign: "center", color: "#999", marginTop: 20 },
  addButton: {
    position: "absolute",
    right: 24,
    bottom: 24,
    backgroundColor: "#1D4ED8",
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
  },
});
