import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import axios from "axios";
import { CreateScheduleParams } from "../../database/schedule";

interface ImportFromTextProps {
  visible: boolean;
  onClose: () => void;
  onImport: (params: CreateScheduleParams[]) => Promise<number>;
}

interface ParsedSchedule extends CreateScheduleParams {
  id?: string;
}

// Lấy API key từ biến môi trường EXPO_PUBLIC_GEMINI_API_KEY
const GEMINI_API_KEY = String(process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "");
const USE_MOCK = false;

export default function ImportFromText({ visible, onClose, onImport }: ImportFromTextProps) {
  const [parsing, setParsing] = useState(false);
  const [parsedSchedules, setParsedSchedules] = useState<ParsedSchedule[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [useMock, setUseMock] = useState(USE_MOCK);

  // Kiểm tra model khả dụng
  async function checkAvailableModels() {
    try {
      console.log("🔍 Checking v1beta models...");
      const v1beta = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
      );
      console.log("📋 v1beta models:", v1beta.data.models?.map((m: any) => m.name));

      console.log("🔍 Checking v1 models...");
      const v1 = await axios.get(
        `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`
      );
      console.log("📋 v1 models:", v1.data.models?.map((m: any) => m.name));

      Alert.alert("Thành công", "Kiểm tra console log để xem danh sách models");
    } catch (error: any) {
      console.error("Failed to list models:", error.response?.data || error.message);
      Alert.alert("Lỗi", error.response?.data?.error?.message || "Không thể kiểm tra API");
    }
  }

  async function parseScheduleWithGemini(base64Data: string, mimeType: string): Promise<ParsedSchedule[]> {
    if (useMock) {
      return [];
    }

    if (!GEMINI_API_KEY) {
      throw new Error("Missing Gemini API key (EXPO_PUBLIC_GEMINI_API_KEY).");
    }

    try {
      const modelsToTry = [
        { version: "v1", model: "gemini-2.5-flash" },
        { version: "v1", model: "gemini-2.5-pro" },
        { version: "v1", model: "gemini-2.0-flash" },
      ];

      let response;
      let usedModel = "";

      for (const { version, model } of modelsToTry) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
          console.log(`🔄 Trying ${version}/${model}`);

          response = await axios.post(
            endpoint,
            {
              contents: [
                {
                  parts: [
                    {
                      inline_data: {
                        mime_type: mimeType,
                        data: base64Data,
                      },
                    },
                    {
                      text: `Phân tích file PDF lịch học và trả về JSON array.

BẢNG CHUYỂN ĐỔI TIẾT HỌC:
Tiết 1: 06:45-07:30, Tiết 2: 07:30-08:15, Tiết 3: 08:15-09:00
Tiết 4: 09:00-09:45, Tiết 5: 09:45-10:30, Tiết 6: 10:30-11:15
Tiết 7: 11:15-12:00, Tiết 8: 12:45-13:30, Tiết 9: 13:30-14:15
Tiết 10: 14:15-15:00, Tiết 11: 15:00-15:45, Tiết 12: 15:45-16:30
Tiết 13: 16:30-17:15, Tiết 14: 17:15-18:00, Tiết 15: 18:00-18:45

FORMAT OUTPUT (QUAN TRỌNG - CHỈ TRẢ VỀ JSON ARRAY):
[
  {
    "courseName": "Tên môn học",
    "type": "Lịch học lý thuyết" hoặc "Lịch học thực hành",
    "instructorName": "Tên giảng viên",
    "location": "Phòng học (bỏ phần trong ngoặc)",
    "singleDate": "YYYY-MM-DD" (từ cột ngày trong tuần),
    "startTime": "HH:mm" (từ tiết bắt đầu),
    "endTime": "HH:mm" (từ tiết kết thúc)
  }
]

QUY TẮC:
1. Mỗi môn học trong mỗi ngày → 1 object
2. Chuyển DD/MM/YYYY thành YYYY-MM-DD
3. Chuyển "Tiết: X - Y" thành startTime và endTime theo bảng trên
4. Loại bỏ mã lớp, mã môn (chỉ giữ tên môn)
5. Location: chỉ lấy "C3.05" không lấy "(C (CS1))"
6. Nếu có "thực hành" → type = "Lịch học thực hành", còn lại → "Lịch học lý thuyết"

QUAN TRỌNG: Chỉ trả về JSON array, không có markdown, không có text khác.`,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2048,
              },
            }
          );

          usedModel = `${version}/${model}`;
          console.log(`✅ Success with: ${usedModel}`);
          break;
        } catch (err: any) {
          const errorMsg = err.response?.data?.error?.message || err.message;
          console.log(`❌ Failed ${version}/${model}: ${err.response?.status || 'network'}`);
          console.log(`💬 ${errorMsg}`);

          if (version === modelsToTry[modelsToTry.length - 1].version &&
              model === modelsToTry[modelsToTry.length - 1].model) {
            throw err;
          }
        }
      }

      if (!response) {
        throw new Error("Tất cả models đều không khả dụng");
      }

      const text = response.data.candidates[0].content.parts[0].text;
      console.log("✅ Gemini response:", text.substring(0, 200) + "...");

      const jsonStr = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const schedules = JSON.parse(jsonStr);

      return schedules.map((s: any) => ({
        ...s,
        id: `${Date.now()}-${Math.random()}`,
      }));
    } catch (error: any) {
      console.error("❌ Gemini parse error:", error);
      throw new Error(
        error.response?.data?.error?.message ||
          "Không thể phân tích PDF. Vui lòng thử lại."
      );
    }
  }

  async function handleImportPDF() {
    try {
      setParsing(true);

      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
      });

      if (res.canceled) {
        setParsing(false);
        return;
      }

      const asset = (res as any).assets?.[0];
      const uri = asset?.uri || (res as any).uri;

      if (!uri) {
        throw new Error("Không lấy được file");
      }

      console.log("📄 Reading PDF:", uri);

      const file = new File(uri);
      const base64 = await file.base64();

      console.log("📊 File size:", base64.length, "bytes");

      const schedules = await parseScheduleWithGemini(
        base64,
        "application/pdf"
      );

      if (schedules.length === 0) {
        Alert.alert(
          "Không tìm thấy lịch",
          "Không thể trích xuất thông tin lịch học từ file này."
        );
        setParsing(false);
        return;
      }

      setParsedSchedules(schedules);
      setShowTable(true);
      setParsing(false);
    } catch (error: any) {
      console.error("❌ PDF import error:", error);
      Alert.alert("Lỗi đọc PDF", error?.message ?? String(error));
      setParsing(false);
    }
  }

  function updateSchedule(id: string, field: string, value: string) {
    setParsedSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  }

  function deleteSchedule(id: string) {
    setParsedSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  const pad2 = (n: number) => String(n).padStart(2, "0");

  function normalizeDate(s?: string) {
    if (!s) return undefined;
    const t = String(s).trim();
    if (t.includes("/")) {
      const parts = t.split("/").map(Number);
      if (parts.length === 3) {
        const [dd, mm, yyyy] = parts;
        return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
      }
    }
    if (t.includes("-")) {
      const parts = t.split("-").map(Number);
      if (parts.length === 3) {
        const [y, m, d] = parts;
        return `${y}-${pad2(m)}-${pad2(d)}`;
      }
    }
    return t;
  }

  function normalizeTime(s?: string) {
    if (!s) return undefined;
    const t = String(s).trim();
    if (t.includes(":")) {
      const [hh, mm] = t.split(":").map(Number);
      if (!isNaN(hh) && !isNaN(mm)) return `${pad2(hh)}:${pad2(mm)}`;
    }
    const digits = t.replace(/\D/g, "");
    if (digits.length === 4) {
      return `${digits.slice(0,2)}:${digits.slice(2)}`;
    }
    return t;
  }

  function normalizeType(t?: string) {
    if (!t) return t;
    const s = String(t).trim().toLowerCase();
    if (s.includes("thực") || s.includes("thuc")) return "Lịch học thực hành";
    if (s.includes("lý") || s.includes("ly") || s.includes("lý thuyết") || s.includes("ly thuyet")) return "Lịch học lý thuyết";
    if (s.includes("thi")) return "Lịch thi";
    if (s.includes("tạm") || s.includes("tam")) return "Lịch tạm ngưng";
    if (s.includes("bù") || s.includes("bu")) return "Lịch học bù";
    return t;
  }

  async function handleAddSchedules() {
    if (parsedSchedules.length === 0) {
      Alert.alert("Lỗi", "Không có lịch để thêm");
      return;
    }

    setParsing(true);

    try {
      const schedulesToAdd: CreateScheduleParams[] = parsedSchedules.map(({ id, ...rest }) => {
        const obj: any = { ...rest };

        if (obj.courseName) obj.courseName = String(obj.courseName).trim();
        if (obj.instructorName) obj.instructorName = String(obj.instructorName).trim();
        if (obj.location) obj.location = String(obj.location).trim();

        obj.type = normalizeType(obj.type);

        obj.singleDate = normalizeDate(obj.singleDate);
        obj.startDate  = normalizeDate(obj.startDate);
        obj.endDate    = normalizeDate(obj.endDate);
        obj.startTime  = normalizeTime(obj.startTime);
        obj.endTime    = normalizeTime(obj.endTime);

        if ((obj.type === "Lịch học lý thuyết" || obj.type === "Lịch học thực hành") && !obj.startDate && obj.singleDate) {
          obj.startDate = obj.singleDate;
        }
        if ((obj.type === "Lịch học lý thuyết" || obj.type === "Lịch học thực hành") && obj.startDate && !obj.endDate) {
          obj.endDate = obj.startDate;
        }

        if (!obj.singleDate && !obj.startDate) {
          const today = new Date();
          obj.singleDate = today.toISOString().slice(0,10);
        }

        if (obj.startTime) obj.startTime = obj.startTime.slice(0,5);
        if (obj.endTime) obj.endTime = obj.endTime.slice(0,5);

        return obj as CreateScheduleParams;
      });

      console.log("DEBUG: Normalized schedules to add:", JSON.stringify(schedulesToAdd, null, 2));

      const added = await onImport(schedulesToAdd);

      setParsedSchedules([]);
      setShowTable(false);
      onClose();

      Alert.alert("Thành công", `Đã thêm ${added} buổi học!`);
    } catch (error: any) {
      console.error("Import failed:", error);
      Alert.alert("Lỗi import", error?.message ?? String(error));
    } finally {
      setParsing(false);
    }
  }

  function handleClear() {
    setParsedSchedules([]);
    setShowTable(false);
  }

  if (showTable && parsedSchedules.length > 0) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.header}>
              <Text style={styles.title}>Xem trước lịch học</Text>
              <TouchableOpacity onPress={onClose}>
                <AntDesign name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <Text style={styles.scheduleCount}>
              Tìm thấy {parsedSchedules.length} buổi học
            </Text>

            <ScrollView style={styles.tableContainer}>
              {parsedSchedules.map((schedule) => (
                <View key={schedule.id} style={styles.scheduleCard}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{schedule.courseName}</Text>
                    <TouchableOpacity
                      onPress={() => deleteSchedule(schedule.id!)}
                      style={styles.deleteBtn}
                    >
                      <AntDesign name="delete" size={18} color="#DC2626" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Tên môn:</Text>
                    <TextInput
                      style={styles.editInput}
                      value={schedule.courseName}
                      onChangeText={(v) =>
                        updateSchedule(schedule.id!, "courseName", v)
                      }
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Giảng viên:</Text>
                    <TextInput
                      style={styles.editInput}
                      value={schedule.instructorName}
                      onChangeText={(v) =>
                        updateSchedule(schedule.id!, "instructorName", v)
                      }
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Phòng:</Text>
                    <TextInput
                      style={styles.editInput}
                      value={schedule.location}
                      onChangeText={(v) =>
                        updateSchedule(schedule.id!, "location", v)
                      }
                    />
                  </View>

                  <View style={styles.rowGroup}>
                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                      <Text style={styles.label}>Ngày:</Text>
                      <TextInput
                        style={styles.editInput}
                        value={schedule.singleDate}
                        onChangeText={(v) =>
                          updateSchedule(schedule.id!, "singleDate", v)
                        }
                      />
                    </View>
                    <View
                      style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}
                    >
                      <Text style={styles.label}>Giờ:</Text>
                      <TextInput
                        style={styles.editInput}
                        value={`${schedule.startTime} - ${schedule.endTime}`}
                        onChangeText={(v) => {
                          const [start, end] = v.split(" - ");
                          updateSchedule(
                            schedule.id!,
                            "startTime",
                            start?.trim() || ""
                          );
                          updateSchedule(
                            schedule.id!,
                            "endTime",
                            end?.trim() || ""
                          );
                        }}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.clearButton]}
                onPress={handleClear}
              >
                <Text style={styles.clearButtonText}>Quay lại</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.parseButton,
                  parsing && styles.buttonDisabled,
                ]}
                onPress={handleAddSchedules}
                disabled={parsing}
              >
                {parsing ? (
                  <Text style={styles.parseButtonText}>Đang thêm...</Text>
                ) : (
                  <>
                    <AntDesign name="plus" size={18} color="#fff" />
                    <Text style={styles.parseButtonText}>Thêm tất cả</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Import từ PDF</Text>
            <TouchableOpacity onPress={onClose}>
              <AntDesign name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.instructions}>
            <Text style={styles.instructionTitle}>🤖 AI đọc PDF</Text>
            <Text style={styles.instructionText}>
              Chọn file PDF lịch học, Gemini AI sẽ tự động phân tích và trích
              xuất tất cả thông tin!
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.pdfImportButton,
              parsing && styles.buttonDisabled,
            ]}
            onPress={handleImportPDF}
            disabled={parsing}
          >
            {parsing ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={styles.pdfImportButtonText}>Đang phân tích...</Text>
              </>
            ) : (
              <>
                <AntDesign name="file" size={20} color="#fff" />
                <Text style={styles.pdfImportButtonText}>Chọn file PDF</Text>
              </>
            )}
          </TouchableOpacity>

          {useMock && (
            <View style={styles.mockWarning}>
              <Text style={styles.mockWarningText}>
                ⚠️ Đang dùng mock data. 
              </Text>
              <TouchableOpacity 
                onPress={() => setUseMock(false)}
                style={{ marginTop: 4 }}
              >
                <Text style={[styles.mockWarningText, { fontWeight: '600', textDecorationLine: 'underline' }]}>
                  Nhấn để dùng AI thật
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!useMock && !GEMINI_API_KEY.startsWith('AIza') && (
            <View style={[styles.mockWarning, { borderLeftColor: '#DC2626' }]}>
              <Text style={styles.mockWarningText}>
                ⚠️ Chưa có API key. Thêm Gemini API key để dùng AI.
              </Text>
            </View>
          )}

          {!useMock && GEMINI_API_KEY.startsWith('AIza') && (
            <TouchableOpacity 
              onPress={checkAvailableModels}
              style={[styles.pdfImportButton, { backgroundColor: '#10B981', marginBottom: 8 }]}
            >
              <Text style={styles.pdfImportButtonText}>🔍 Kiểm tra API</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111",
  },
  instructions: {
    backgroundColor: "#EFF6FF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  instructionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1D4ED8",
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
  },
  pdfImportButton: {
    backgroundColor: "#1D4ED8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  pdfImportButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  mockWarning: {
    backgroundColor: "#FEF3C7",
    padding: 10,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  mockWarningText: {
    fontSize: 12,
    color: "#92400E",
  },
  scheduleCount: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 12,
    fontWeight: "500",
  },
  tableContainer: {
    maxHeight: 400,
    marginBottom: 16,
  },
  scheduleCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#1D4ED8",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
    flex: 1,
  },
  deleteBtn: {
    padding: 8,
  },
  fieldGroup: {
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  editInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#111",
  },
  rowGroup: {
    flexDirection: "row",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  clearButton: {
    backgroundColor: "#F3F4F6",
  },
  clearButtonText: {
    color: "#374151",
    fontWeight: "600",
    fontSize: 15,
  },
  parseButton: {
    backgroundColor: "#1D4ED8",
  },
  parseButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
