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
import { useLanguage } from "../../context/LanguageContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  onParsed: (rows: ParsedRow[]) => void;
};

export default function ImportDialog({ visible, onClose, onParsed }: Props) {
  const [path, setPath] = useState("");
  const [candidateUri, setCandidateUri] = useState<string | null>(null);
  const { language } = useLanguage();

  const isEn = language === "en";
  const txt = {
    title: isEn ? "Import Data from Excel" : "Nhập dữ liệu từ Excel",
    pathLabel: isEn ? "Path" : "Đường dẫn",
    pathPlaceholder: isEn ? "File path" : "Đường dẫn tệp",
    browseFailTitle: isEn ? "Error" : "Lỗi",
    browseFailMsg: isEn ? "Unable to pick a file. Please try again." : "Không thể chọn tệp. Vui lòng thử lại.",
    exportBtn: isEn ? "Download Template" : "Tải mẫu",
    exportFailTitle: isEn ? "Error" : "Lỗi",
    exportFailMsg: isEn ? "Unable to export template file." : "Không thể xuất file mẫu.",
    confirmBtn: isEn ? "Confirm" : "Đồng ý",
    cancelBtn: isEn ? "Cancel" : "Hủy bỏ",
    noFileTitle: isEn ? "No File" : "Không có tệp",
    noFileMsg: isEn ? "Please choose a file to import." : "Vui lòng chọn tệp để nhập.",
    importErrorTitle: isEn ? "Import Error" : "Lỗi nhập",
    importErrorFallback: isEn
      ? "Cannot read Excel file. Please check the format."
      : "Không thể đọc tệp Excel. Vui lòng kiểm tra định dạng.",
    importErrorClose: isEn ? "Close" : "Đóng",
  };

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
      Alert.alert(txt.browseFailTitle, txt.browseFailMsg);
    }
  };

  const handleExport = async () => {
    try {
      await exportTemplate();
    } catch (e) {
      console.warn("exportTemplate failed", e);
      Alert.alert(txt.exportFailTitle, txt.exportFailMsg);
    }
  };

  const handleConfirm = async () => {
    const uri = candidateUri || path;
    if (!uri) {
      Alert.alert(txt.noFileTitle, txt.noFileMsg);
      return;
    }
    try {
      // First run parseFile in dryRun mode to ensure no partial writes occur.
      const result: ParseResult = await parseFile(uri, { dryRun: true, language });
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
          Alert.alert(txt.importErrorTitle, errorMsg, [{ text: txt.importErrorClose, style: "cancel" }]);
          return;
      }

  // Không có lỗi: tiếp tục bình thường
  proceedWithRows(rows);
    } catch (e: any) {
      console.warn("parseFile failed", e);
      const msg =
        e && e.message
          ? String(e.message)
          : txt.importErrorFallback;
      Alert.alert(txt.importErrorTitle, msg);
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
            {txt.title}
          </Text>
          <Text style={{ marginBottom: 6 }}>{txt.pathLabel}</Text>
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
              placeholder={txt.pathPlaceholder}
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
              <Text>{txt.exportBtn}</Text>
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
              <Text style={{ color: "#fff" }}>{txt.confirmBtn}</Text>
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
              <Text style={{ color: "#fff" }}>{txt.cancelBtn}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
