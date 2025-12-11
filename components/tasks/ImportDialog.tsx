import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {
  parseFile,
  exportTemplate,
  ParsedRow,
  ParseResult,
} from "./importHelpers";

type Props = {
  visible: boolean;
  onClose: () => void;
  onParsed: (rows: ParsedRow[]) => void;
};

export default function ImportDialog({ visible, onClose, onParsed }: Props) {
  const [path, setPath] = useState("");
  const [candidateUri, setCandidateUri] = useState<string | null>(null);

  const browse = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
      });
      if (!res.canceled) {
        const file = res.assets[0];
        setPath(file.uri);
        setCandidateUri(file.uri);
      }
    } catch (e) {
      console.warn("picker fail", e);
      Alert.alert("Lỗi", "Không thể chọn tệp. Vui lòng thử lại.");
    }
  };

  const handleExport = async () => {
    try {
      await exportTemplate();
    } catch (e) {
      console.warn("exportTemplate failed", e);
      Alert.alert("Lỗi", "Không thể xuất file mẫu.");
    }
  };

  const handleConfirm = async () => {
    const uri = candidateUri || path;
    if (!uri) {
      Alert.alert("Không có tệp", "Vui lòng chọn tệp để nhập.");
      return;
    }
    try {
      // First run parseFile in dryRun mode to ensure no partial writes occur.
      const result: ParseResult = await parseFile(uri, { dryRun: true });
      const rows = result.rows || [];
      const proceedWithRows = (rs: ParsedRow[]) => {
        onParsed(rs);
        setPath("");
        setCandidateUri(null);
      };

      if (result.errors && result.errors.length > 0) {
          // Nếu có bất kỳ lỗi nào khi parse file thì KHÔNG được import bất kỳ dòng nào.
          // Hiển thị toàn bộ lỗi và yêu cầu người dùng sửa file trước khi thử lại.
          const errorMsg = result.errors.join("\n");
          Alert.alert("Lỗi nhập", errorMsg, [{ text: "Đóng", style: "cancel" }]);
          return;
      }

  // Không có lỗi: tiếp tục bình thường
  proceedWithRows(rows);
    } catch (e: any) {
      console.warn("parseFile failed", e);
      const msg =
        e && e.message
          ? String(e.message)
          : "Không thể đọc tệp Excel. Vui lòng kiểm tra định dạng.";
      Alert.alert("Lỗi nhập", msg);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.4)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 680,
            maxWidth: "95%",
            backgroundColor: "#fff",
            borderRadius: 8,
            padding: 18,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>
            Nhập dữ liệu từ Excel
          </Text>
          <Text style={{ marginBottom: 6 }}>Đường dẫn</Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <TextInput
              value={path}
              onChangeText={setPath}
              placeholder="Đường dẫn tệp"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "#ddd",
                padding: 8,
                borderRadius: 4,
                marginRight: 8,
              }}
            />
            <TouchableOpacity
              onPress={browse}
              style={{
                width: 44,
                height: 44,
                backgroundColor: "#eee",
                borderRadius: 4,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text>...</Text>
            </TouchableOpacity>
          </View>
          <View
            style={{ height: 1, backgroundColor: "#eee", marginVertical: 8 }}
          />
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <TouchableOpacity
              onPress={handleExport}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                marginRight: 8,
                backgroundColor: "#e5e7eb",
                borderRadius: 6,
              }}
            >
              <Text>Tải mẫu</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                marginRight: 8,
                backgroundColor: "#60a5fa",
                borderRadius: 6,
              }}
            >
              <Text style={{ color: "#fff" }}>Đồng ý</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setPath("");
                setCandidateUri(null);
                onClose();
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                backgroundColor: "#ef4444",
                borderRadius: 6,
              }}
            >
              <Text style={{ color: "#fff" }}>Hủy bỏ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
