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
import AddScheduleForm from "../components/schedules/AddScheduleForm";
import { useSchedules, ScheduleItem } from "../hooks/useSchedules";
import DayView from "../components/schedules/DayView";
import WeekView from "../components/schedules/WeekView";
import ScheduleDetailModal from "../components/schedules/ScheduleDetailModal";
import ImportFromText from "../components/schedules/ImportFromText";
import ExcelImportModal from "../components/schedules/ExcelImportModal";
import ImportErrorModal from "../components/schedules/ImportErrorModal";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import { CreateScheduleParams, ScheduleType } from "../database/schedule";
import { useTheme } from "../context/ThemeContext"; // ✅ IMPORT useTheme

const TYPE_STYLE: Record<string, { color: string; emoji: string; pillBg: string }> = {
  "Lịch học lý thuyết": { color: "#1D4ED8", emoji: "📚", pillBg: "#DBEAFE" },
  "Lịch học thực hành": { color: "#047857", emoji: "🧪", pillBg: "#BBF7D0" },
  "Lịch thi": { color: "#DC2626", emoji: "📝", pillBg: "#FECACA" },
  "Lịch tạm ngưng": { color: "#D97706", emoji: "⏸", pillBg: "#FDE68A" },
  "Lịch học bù": { color: "#7C3AED", emoji: "📅", pillBg: "#EDE9FE" },
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
  const { theme } = useTheme(); // ✅ SỬ DỤNG THEME
  
  const {
    schedules,
    loading,
    loadSchedules,
    addSchedule,
    deleteAllByCourse,
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
  const [showTextImport, setShowTextImport] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [importResult, setImportResult] = useState({
    addedCount: 0,
    validationErrors: [] as string[],
    conflictErrors: [] as string[],
  });

  // ✅ DYNAMIC STYLES DỰA TRÊN THEME
  const themedStyles = useMemo(() => ({
    container: {
      backgroundColor: theme === "dark" ? "#1a1a1a" : "#fff",
    },
    text: {
      color: theme === "dark" ? "#e5e5e5" : "#111",
    },
    subText: {
      color: theme === "dark" ? "#a3a3a3" : "#374151",
    },
    card: {
      backgroundColor: theme === "dark" ? "#2a2a2a" : "#fff",
      shadowColor: theme === "dark" ? "#000" : "#000",
    },
    sectionHeader: {
      backgroundColor: theme === "dark" ? "#1a1a1a" : "#fff",
    },
    emptyText: {
      color: theme === "dark" ? "#666" : "#999",
    },
  }), [theme]);

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

  function handleDetailDelete(item: ScheduleItem) {
    Alert.alert(
      "Xác nhận xóa",
      "Bạn có chắc muốn xóa toàn bộ lịch của môn này?",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa môn",
          style: "destructive",
          onPress: async () => {
            await deleteAllByCourse(item.subject);
            setSelectedItem(null);
          },
        },
      ]
    );
  }

  async function handleImportExcel() {
    if (importing) return;
    setImporting(true);

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
      });
      
      if (res.canceled) {
        setImporting(false);
        return;
      }
      
      const uri = res.assets[0].uri;
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
      const wb = XLSX.read(b64, { type: "base64", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        blankrows: false,
        raw: true,
      });

      if (!raw || raw.length === 0) {
        Alert.alert("Lỗi import", "File Excel không có dữ liệu");
        setImporting(false);
        return;
      }

      const headerRowIndex = raw.findIndex(row =>
        row.some(cell => String(cell).trim() === "Tên môn học")
      );
      
      if (headerRowIndex < 0) {
        Alert.alert(
          "Lỗi import", 
          "Không tìm thấy dòng tiêu đề.\n\nVui lòng đảm bảo có cột 'Tên môn học' trong file Excel."
        );
        setImporting(false);
        return;
      }
      
      const header = raw[headerRowIndex].map(c => String(c).trim());

      const requiredColumns = [
        "Tên môn học",
        "Loại lịch",
        "Giảng viên",
        "Địa điểm",
        "Ngày bắt đầu",
        "Ngày kết thúc",
        "Giờ bắt đầu",
        "Giờ kết thúc",
      ];

      const missingColumns: string[] = [];
      const foundColumns: Record<string, number> = {};

      for (const colName of requiredColumns) {
        const idx = header.indexOf(colName);
        if (idx < 0) {
          missingColumns.push(colName);
        } else {
          foundColumns[colName] = idx;
        }
      }

      if (missingColumns.length > 0) {
        const missingList = missingColumns.map(col => `• ${col}`).join("\n");
        Alert.alert(
          "Thiếu cột bắt buộc",
          `File Excel thiếu ${missingColumns.length} cột:\n\n${missingList}\n\nVui lòng tải file mẫu để xem định dạng đúng.`
        );
        setImporting(false);
        return;
      }

      const idx = {
        courseName: foundColumns["Tên môn học"],
        type:       foundColumns["Loại lịch"],
        instructor: foundColumns["Giảng viên"],
        location:   foundColumns["Địa điểm"],
        startDate:  foundColumns["Ngày bắt đầu"],
        endDate:    foundColumns["Ngày kết thúc"],
        startTime:  foundColumns["Giờ bắt đầu"],
        endTime:    foundColumns["Giờ kết thúc"],
      };

      const rows = raw.slice(headerRowIndex + 1);

      if (rows.length === 0) {
        Alert.alert(
          "Lỗi import",
          "File Excel không có dữ liệu.\n\nVui lòng thêm ít nhất 1 dòng dữ liệu sau dòng tiêu đề."
        );
        setImporting(false);
        return;
      }

      const pad2 = (n: number) => String(n).padStart(2, "0");
      
      function toDateParts(v: any): [number, number, number] {
        if (v instanceof Date) return [v.getFullYear(), v.getMonth() + 1, v.getDate()];
        if (typeof v === "number") {
          const o = XLSX.SSF.parse_date_code(v);
          return [o.y, o.m, o.d];
        }
        const s = String(v).trim();
        if (s.includes("/")) {
          const parts = s.split("/").map(Number);
          if (parts.length === 3) {
            const [dd, mm, yyyy] = parts;
            return [yyyy, mm, dd];
          }
        }
        const parts = s.split("-").map(Number);
        if (parts.length === 3) return parts as [number, number, number];
        throw new Error("Không parse được ngày: " + s);
      }
      
      function toTimeParts(v: any): [number, number] {
        if (v instanceof Date) return [v.getHours(), v.getMinutes()];
        if (typeof v === "number") {
          const total = Math.round(v * 24 * 60);
          return [Math.floor(total / 60), total % 60];
        }
        const s = String(v).trim();
        const parts = s.split(":").map(Number);
        if (parts.length >= 2) return [parts[0], parts[1]];
        throw new Error("Không parse được giờ: " + s);
      }

      let addedCount = 0;
      const conflictMessages: string[] = [];
      const validationErrors: string[] = [];
      const validTypes: ScheduleType[] = [
        "Lịch học lý thuyết",
        "Lịch học thực hành",
        "Lịch thi",
        "Lịch học bù",
        "Lịch tạm ngưng",
      ];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const excelRowNumber = headerRowIndex + 2 + i;
        
        if (!row || row.length === 0 || row.every(cell => !cell)) {
          continue;
        }

        const rawName = String(row[idx.courseName] ?? "").trim();
        const rawType = String(row[idx.type] ?? "").trim();
        const rawInstructor = String(row[idx.instructor] ?? "").trim();
        const rawLocation = String(row[idx.location] ?? "").trim();

        const missingFields: string[] = [];
        
        if (!rawName) missingFields.push("Tên môn học");
        if (!rawType) missingFields.push("Loại lịch");
        if (!rawInstructor) missingFields.push("Giảng viên");
        if (!rawLocation) missingFields.push("Địa điểm");

        if (missingFields.length > 0) {
          validationErrors.push(
            `Dòng ${excelRowNumber}: Thiếu ${missingFields.join(", ")}`
          );
          continue;
        }

        const rawTypes = rawType
          .split(/\s*[;,]\s*/)
          .map((t: string) => t.trim())
          .filter(Boolean);

        const normTypes = rawTypes.map((t: string) =>
          t === "Lịch học thường xuyên" ? "Lịch học lý thuyết" : t
        );

        const validTypesArr = normTypes.filter((t: string) => 
          validTypes.includes(t as ScheduleType)
        );

        if (validTypesArr.length === 0) {
          validationErrors.push(
            `Dòng ${excelRowNumber}: Loại lịch không hợp lệ "${rawType}". ` +
            `Chỉ chấp nhận: ${validTypes.join(", ")}`
          );
          continue;
        }

        const sdRaw = row[idx.startDate];
        const edRaw = row[idx.endDate];
        const stRaw = row[idx.startTime];
        const etRaw = row[idx.endTime];
        
        const missingDateTime: string[] = [];
        if (!sdRaw) missingDateTime.push("Ngày bắt đầu");
        if (!stRaw) missingDateTime.push("Giờ bắt đầu");
        if (!etRaw) missingDateTime.push("Giờ kết thúc");
        
        if (missingDateTime.length > 0) {
          validationErrors.push(
            `Dòng ${excelRowNumber}: Thiếu ${missingDateTime.join(", ")}`
          );
          continue;
        }

        let y: number, m: number, d: number;
        let sh: number, sm: number, eh: number, em: number;
        
        try {
          [y, m, d] = toDateParts(sdRaw);
          [sh, sm] = toTimeParts(stRaw);
          [eh, em] = toTimeParts(etRaw);
        } catch (ex: any) {
          conflictMessages.push(`Dòng ${excelRowNumber}: Lỗi parse ngày/giờ (${ex?.message ?? ex})`);
          continue;
        }

        const startDate = `${y}-${pad2(m)}-${pad2(d)}`;
        const startTime = `${pad2(sh)}:${pad2(sm)}`;
        const endTime = `${pad2(eh)}:${pad2(em)}`;

        for (const scheduleTypeRaw of validTypesArr) {
          const scheduleType = scheduleTypeRaw as ScheduleType;
          let params: CreateScheduleParams;

          if (scheduleType === "Lịch học lý thuyết") {
            const [ey, emn, eday] = edRaw ? toDateParts(edRaw) : [y, m, d];
            const endDate = `${ey}-${pad2(emn)}-${pad2(eday)}`;
            params = {
              courseName: rawName,
              type: scheduleType,
              instructorName: row[idx.instructor]?.trim(),
              location: row[idx.location]?.trim(),
              startDate,
              endDate,
              startTime,
              endTime,
            };
          } else if (scheduleType === "Lịch học thực hành") {
            if (edRaw) {
              const [ey, emn, eday] = toDateParts(edRaw);
              const endDate = `${ey}-${pad2(emn)}-${pad2(eday)}`;
              params = {
                courseName: rawName,
                type: scheduleType,
                instructorName: row[idx.instructor]?.trim(),
                location: row[idx.location]?.trim(),
                startDate,
                endDate,
                startTime,
                endTime,
              };
            } else {
              params = {
                courseName: rawName,
                type: scheduleType,
                instructorName: row[idx.instructor]?.trim(),
                location: row[idx.location]?.trim(),
                singleDate: startDate,
                startTime,
                endTime,
              };
            }
          } else {
            params = {
              courseName: rawName,
              type: scheduleType,
              instructorName: row[idx.instructor]?.trim(),
              location: row[idx.location]?.trim(),
              singleDate: startDate,
              startTime,
              endTime,
            };
          }

          try {
            await addSchedule(params);
            addedCount++;
          } catch (e: any) {
            const msg = e?.message && String(e.message).includes("Xung đột")
              ? `Dòng ${excelRowNumber}: ${e.message}`
              : `Dòng ${excelRowNumber}: Không thể thêm (${e?.message ?? e})`;
            conflictMessages.push(msg);
            console.warn(msg);
          }
        }
      }

      await loadSchedules();
      
      setImportResult({
        addedCount,
        validationErrors,
        conflictErrors: conflictMessages,
      });

      if (validationErrors.length + conflictMessages.length > 5) {
        setShowErrorDetail(true);
      } else {
        let alertTitle = "Kết quả import";
        let alertMsg = "";

        if (addedCount > 0) {
          alertMsg += `✅ Đã thêm thành công ${addedCount} buổi học!\n`;
        }

        if (validationErrors.length > 0) {
          alertMsg += `\n⚠️ Bỏ qua ${validationErrors.length} dòng do lỗi dữ liệu:\n`;
          alertMsg += validationErrors.slice(0, 3).join("\n");
          if (validationErrors.length > 3) {
            alertMsg += `\n... và ${validationErrors.length - 3} lỗi khác`;
          }
        }

        if (conflictMessages.length > 0) {
          alertMsg += `\n\n❌ Không thêm được ${conflictMessages.length} buổi do trùng lịch:\n`;
          alertMsg += conflictMessages.slice(0, 3).join("\n");
          if (conflictMessages.length > 3) {
            alertMsg += `\n... và ${conflictMessages.length - 3} lỗi khác`;
          }
        }

        if (addedCount === 0) {
          alertTitle = "Import thất bại";
          if (alertMsg.trim() === "") {
            alertMsg = "Không có dữ liệu hợp lệ để import.";
          }
        }
        
        Alert.alert(alertTitle, alertMsg.trim());
      }

    } catch (err: any) {
      console.error("❌ handleImportExcel error:", err);
      Alert.alert("Lỗi import Excel", err?.message ?? String(err));
    } finally {
      setImporting(false);
      setShowExcelImport(false);
    }
  }

  async function handleImportFromText(schedules: CreateScheduleParams[]) {
    let addedCount = 0;
    const errors: string[] = [];

    for (const params of schedules) {
      try {
        await addSchedule(params);
        addedCount++;
      } catch (error: any) {
        const errMsg = `${params.courseName}: ${error?.message ?? String(error)}`;
        errors.push(errMsg);
      }
    }

    await loadSchedules();

    if (errors.length > 0) {
      throw new Error(`Đã thêm ${addedCount} buổi. Lỗi ${errors.length} buổi:\n${errors.join("\n")}`);
    }

    return addedCount;
  }

  function renderSectionHeader({ section }: { section: any }) {
    const st = TYPE_STYLE[section.title];
    return (
      <View style={[styles.sectionHeader, themedStyles.sectionHeader]}>
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
      <View style={[styles.card, themedStyles.card, { borderLeftColor: st.color }]}>
        <View style={styles.line1}>
          <Text style={[styles.subjectText, themedStyles.text]}>
            {capitalize(item.subject)}
          </Text>
          <View style={[styles.typeTag, { backgroundColor: st.pillBg }]}>
            <Text style={{ color: st.color, fontWeight: "600" }}>
              {capitalize(item.type.replace("Lịch ", ""))}
            </Text>
          </View>
        </View>
        <Text style={[styles.infoText, themedStyles.subText]}>
          🗓️ {dayName} ⏰ {fmt(item.startAt)} — {fmt(item.endAt)}
        </Text>
        <Text style={[styles.infoText, themedStyles.subText]}>
          👨‍🏫 {capitalize(item.instructorName ?? "") || "Chưa có giảng viên"}
        </Text>
        <View style={styles.bottomRow}>
          <Text style={[styles.infoText, themedStyles.subText]}>
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
                Alert.alert(
                  "Xác nhận xóa",
                  "Bạn có chắc muốn xóa toàn bộ lịch của môn này?",
                  [
                    { text: "Hủy", style: "cancel" },
                    {
                      text: "Xóa môn",
                      style: "destructive",
                      onPress: async () => {
                        await deleteAllByCourse(item.subject);
                        Alert.alert("Xóa thành công");
                      },
                    },
                  ]
                )
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
    <View style={[styles.container, themedStyles.container]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.pageTitle, themedStyles.text]}>Thời khóa biểu</Text>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.importButton}
            onPress={() => setShowExcelImport(true)}
          >
            <AntDesign name="download" size={20} color="#1D4ED8" />
            <Text style={styles.importText}>Excel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.importButton, { borderColor: "#059669" }]}
            onPress={() => setShowTextImport(true)}
          >
            <AntDesign name="copy" size={20} color="#059669" />
            <Text style={[styles.importText, { color: "#059669" }]}>
              Lịch
            </Text>
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

      {loading && <Text style={[styles.empty, themedStyles.emptyText]}>Đang tải...</Text>}

      {viewMode === "day" ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id.toString()}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={[styles.empty, themedStyles.emptyText]}>Không có lịch hôm nay.</Text>
          }
        />
      ) : (
        <WeekView
          weekDates={weekDates}
          schedules={filtered}
          typeStyle={TYPE_STYLE}
          onSelectItem={setSelectedItem}
          theme={theme} // ✅ TRUYỀN THEME VÀO WEEKVIEW
        />
      )}

      <ScheduleDetailModal
        visible={!!selectedItem}
        item={selectedItem}
        typeStyle={TYPE_STYLE}
        onClose={() => setSelectedItem(null)}
        onEdit={handleDetailEdit}
        onDelete={() => handleDetailDelete(selectedItem!)}
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
              endTime: `${String(editingItem.endAt.getHours()).padStart(2, "0")}:${String(editingItem.endAt.getMinutes()).padStart(2, "0")}`,
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

      <ImportFromText
        visible={showTextImport}
        onClose={() => setShowTextImport(false)}
        onImport={handleImportFromText}
      />

      <ExcelImportModal
        visible={showExcelImport}
        onClose={() => setShowExcelImport(false)}
        onImport={handleImportExcel}
        importing={importing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: { flexDirection: "column", marginBottom: 8 },
  pageTitle: { fontSize: 22, fontWeight: "bold" },
  headerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginVertical: 6,
    marginTop: -28,
    alignItems: "center",
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#1D4ED8",
    marginRight: 8,
  },
  importText: { marginLeft: 4, color: "#1D4ED8", fontWeight: "600" },
  sectionHeader: { paddingVertical: 6, marginTop: 16 },
  sectionHeaderText: { fontSize: 16, fontWeight: "bold" },
  card: {
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    borderLeftWidth: 4,
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  line1: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  subjectText: { flex: 1, fontWeight: "bold", fontSize: 16 },
  typeTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, height: 25 },
  infoText: { fontSize: 14, marginTop: 2 },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  actionsRow: { flexDirection: "row" },
  empty: { textAlign: "center", marginTop: 20 },
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
