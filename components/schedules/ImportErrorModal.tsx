import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";

interface Props {
  visible: boolean;
  onClose: () => void;
  addedCount: number;
  validationErrors: string[];
  conflictErrors: string[];
}

export default function ImportErrorModal({
  visible,
  onClose,
  addedCount,
  validationErrors,
  conflictErrors,
}: Props) {
  const totalErrors = validationErrors.length + conflictErrors.length;

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
            <Text style={styles.title}>Chi tiết Import</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <AntDesign name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content}>
            {/* Thành công */}
            {addedCount > 0 && (
              <View style={styles.successBox}>
                <Text style={styles.successIcon}>✅</Text>
                <Text style={styles.successText}>
                  Đã thêm thành công {addedCount} buổi học
                </Text>
              </View>
            )}

            {/* Lỗi validation */}
            {validationErrors.length > 0 && (
              <View style={styles.errorSection}>
                <View style={styles.errorHeader}>
                  <Text style={styles.errorIcon}>⚠️</Text>
                  <Text style={styles.errorTitle}>
                    Lỗi dữ liệu ({validationErrors.length})
                  </Text>
                </View>
                <View style={styles.errorList}>
                  {validationErrors.map((err, idx) => (
                    <Text key={idx} style={styles.errorItem}>
                      • {err}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {/* Lỗi conflict */}
            {conflictErrors.length > 0 && (
              <View style={styles.errorSection}>
                <View style={styles.errorHeader}>
                  <Text style={styles.errorIcon}>❌</Text>
                  <Text style={styles.errorTitle}>
                    Trùng lịch ({conflictErrors.length})
                  </Text>
                </View>
                <View style={styles.errorList}>
                  {conflictErrors.map((err, idx) => (
                    <Text key={idx} style={styles.errorItem}>
                      • {err}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {/* Hướng dẫn khắc phục */}
            {totalErrors > 0 && (
              <View style={styles.guideBox}>
                <Text style={styles.guideTitle}>💡 Hướng dẫn khắc phục:</Text>
                
                {validationErrors.length > 0 && (
                  <>
                    <Text style={styles.guideText}>
                      • Kiểm tra các cột bắt buộc: Tên môn học, Loại lịch, Giảng viên, Địa điểm, Ngày bắt đầu, Giờ bắt đầu, Giờ kết thúc
                    </Text>
                    <Text style={styles.guideText}>
                      • Định dạng ngày: YYYY-MM-DD hoặc DD/MM/YYYY
                    </Text>
                    <Text style={styles.guideText}>
                      • Định dạng giờ: HH:mm (ví dụ: 07:00, 13:30)
                    </Text>
                    <Text style={styles.guideText}>
                      • Loại lịch hợp lệ: Lịch học lý thuyết, Lịch học thực hành, Lịch thi, Lịch học bù, Lịch tạm ngưng
                    </Text>
                  </>
                )}
                
                {conflictErrors.length > 0 && (
                  <Text style={styles.guideText}>
                    • Kiểm tra trùng lặp với lịch đã có trong hệ thống
                  </Text>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Đóng</Text>
            </TouchableOpacity>
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
    maxHeight: "80%",
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
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d1fae5",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#059669",
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  successText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#065f46",
  },
  errorSection: {
    marginBottom: 16,
  },
  errorHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  errorIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#991b1b",
  },
  errorList: {
    backgroundColor: "#fef2f2",
    borderLeftWidth: 4,
    borderLeftColor: "#dc2626",
    padding: 12,
    borderRadius: 8,
  },
  errorItem: {
    fontSize: 13,
    color: "#7f1d1d",
    lineHeight: 20,
    marginBottom: 4,
  },
  guideBox: {
    backgroundColor: "#eff6ff",
    borderLeftWidth: 4,
    borderLeftColor: "#2563eb",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e40af",
    marginBottom: 8,
  },
  guideText: {
    fontSize: 13,
    color: "#1e3a8a",
    lineHeight: 20,
    marginBottom: 4,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    padding: 16,
  },
  closeButton: {
    backgroundColor: "#1D4ED8",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
