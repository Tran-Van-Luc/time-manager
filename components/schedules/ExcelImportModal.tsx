import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";

interface Props {
  visible: boolean;
  onClose: () => void;
  onImport: () => void;
  importing: boolean;
}

export default function ExcelImportModal({ visible, onClose, onImport, importing }: Props) {
  
  async function handleDownloadTemplate() {
    try {
      // Tạo dữ liệu mẫu
      const sampleData = [
        {
          "Tên môn học": "Toán cao cấp",
          "Loại lịch": "Lịch học lý thuyết",
          "Giảng viên": "TS. Nguyễn Văn A",
          "Địa điểm": "Phòng A101",
          "Ngày bắt đầu": "2024-01-08",
          "Ngày kết thúc": "2024-05-20",
          "Giờ bắt đầu": "07:00",
          "Giờ kết thúc": "09:00",
        },
        {
          "Tên môn học": "Lập trình Python",
          "Loại lịch": "Lịch học thực hành",
          "Giảng viên": "ThS. Trần Thị B",
          "Địa điểm": "Phòng Máy 2",
          "Ngày bắt đầu": "2024-01-09",
          "Ngày kết thúc": "2024-05-21",
          "Giờ bắt đầu": "13:00",
          "Giờ kết thúc": "15:00",
        },
        {
          "Tên môn học": "Toán cao cấp",
          "Loại lịch": "Lịch thi",
          "Giảng viên": "TS. Nguyễn Văn A",
          "Địa điểm": "Hội trường A",
          "Ngày bắt đầu": "2024-06-10",
          "Ngày kết thúc": "",
          "Giờ bắt đầu": "09:00",
          "Giờ kết thúc": "11:00",
        },
      ];

      // Tạo worksheet
      const ws = XLSX.utils.json_to_sheet(sampleData);

      // Đặt độ rộng cột
      ws["!cols"] = [
        { wch: 20 }, // Tên môn học
        { wch: 22 }, // Loại lịch
        { wch: 20 }, // Giảng viên
        { wch: 15 }, // Địa điểm
        { wch: 15 }, // Ngày bắt đầu
        { wch: 15 }, // Ngày kết thúc
        { wch: 12 }, // Giờ bắt đầu
        { wch: 12 }, // Giờ kết thúc
      ];

      // Tạo workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Lịch học");

      // Ghi file
      const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const uri = FileSystem.documentDirectory + "Mau_Lich_Hoc.xlsx";
      await FileSystem.writeAsStringAsync(uri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Chia sẻ file
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: "Lưu file mẫu",
          UTI: "com.microsoft.excel.xlsx",
        });
        Alert.alert("Thành công", "File mẫu đã được tạo!");
      } else {
        Alert.alert("Lỗi", "Không thể chia sẻ file trên thiết bị này");
      }
    } catch (error: any) {
      console.error("Download template error:", error);
      Alert.alert("Lỗi", error?.message ?? "Không thể tạo file mẫu");
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Import Excel</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <AntDesign name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.description}>
              Chọn file Excel để nhập lịch học, hoặc tải file mẫu để tham khảo định dạng.
            </Text>

            {/* Hướng dẫn */}
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>📋 Các cột bắt buộc:</Text>
              <Text style={styles.infoText}>• Tên môn học</Text>
              <Text style={styles.infoText}>• Loại lịch (Lịch học lý thuyết, Lịch học thực hành, Lịch thi, Lịch học bù, Lịch tạm ngưng)</Text>
              <Text style={styles.infoText}>• Giảng viên</Text>
              <Text style={styles.infoText}>• Địa điểm</Text>
              <Text style={styles.infoText}>• Ngày bắt đầu (YYYY-MM-DD hoặc DD/MM/YYYY)</Text>
              <Text style={styles.infoText}>• Ngày kết thúc (cho lịch recurring)</Text>
              <Text style={styles.infoText}>• Giờ bắt đầu (HH:mm)</Text>
              <Text style={styles.infoText}>• Giờ kết thúc (HH:mm)</Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              {/* Nút lấy mẫu */}
              <TouchableOpacity
                style={[styles.button, styles.templateButton]}
                onPress={handleDownloadTemplate}
              >
                <AntDesign name="download" size={20} color="#059669" />
                <Text style={[styles.buttonText, { color: "#059669" }]}>
                  Lấy mẫu Excel
                </Text>
              </TouchableOpacity>

              {/* Nút import */}
              <TouchableOpacity
                style={[styles.button, styles.importButton]}
                onPress={onImport}
                disabled={importing}
              >
                <AntDesign 
                  name="upload" 
                  size={20} 
                  color={importing ? "#94A3B8" : "#fff"} 
                />
                <Text style={[styles.buttonText, { color: "#fff" }]}>
                  {importing ? "Đang import..." : "Chọn file Excel"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "90%",
    maxWidth: 500,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    backgroundColor: "#f8f9fa",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  description: {
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: "#f0f9ff",
    borderLeftWidth: 4,
    borderLeftColor: "#1D4ED8",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e3a8a",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#1e40af",
    lineHeight: 20,
    marginLeft: 8,
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  templateButton: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#059669",
  },
  importButton: {
    backgroundColor: "#1D4ED8",
    shadowColor: "#1D4ED8",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
  },
});