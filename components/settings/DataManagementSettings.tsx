import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Alert,
  Platform,
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../context/ThemeContext";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { db } from "../../database/database";
import * as schema from "../../database/schema";

const STORAGE_KEY_LANG = "appLanguage";

const isIsoDateString = (value: any): value is string => {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value);
};

export default function DataManagementSettings({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [labels, setLabels] = useState({
    title: "Quản lý dữ liệu",
    close: "Đóng",
    export: "Sao lưu (Export)",
    import: "Phục hồi (Import)",
    clear: "Xoá hết dữ liệu",
    exportConfirm: "Tạo bản sao lưu của dữ liệu và lưu vào file?",
    importConfirm: "Bạn muốn import file dữ liệu?",
    clearConfirm: "Bạn chắc chắn muốn xóa tất cả dữ liệu? Hành động này không thể hoàn tác.",
    cancel: "Hủy",
    ok: "Đồng ý",
    cleared: "Đã xoá dữ liệu ứng dụng.",
    importWarning: "HÀNH ĐỘNG NÀY SẼ XOÁ TOÀN BỘ DỮ LIỆU HIỆN TẠI VÀ THAY THẾ BẰNG DỮ LIỆU TRONG FILE BACKUP. Bạn chắc chắn muốn tiếp tục?",
    error: "Lỗi",
    invalidFile: "File backup không hợp lệ.",
    success: "Thành công",
    restored: "Dữ liệu đã được phục hồi thành công!",
    failed: "Thất bại",
    cannotProcess: "Không thể xử lý file",
  });

  useEffect(() => {
    (async () => {
      try {
        const l = (await AsyncStorage.getItem(STORAGE_KEY_LANG)) as "vi" | "en" | null;
        if (l === "en") updateLabels("en");
        else updateLabels("vi");
      } catch {
        updateLabels("vi");
      }
    })();
  }, [visible]);

  function updateLabels(lang: "vi" | "en") {
    if (lang === "en") {
      setLabels({
        title: "Data Management",
        close: "Close",
        export: "Export backup",
        import: "Import backup",
        clear: "Clear all data",
        exportConfirm: "Create a backup file of your data?",
        importConfirm: "Do you want to import a data file?",
        clearConfirm: "Are you sure you want to delete all data? This cannot be undone.",
        cancel: "Cancel",
        ok: "OK",
        cleared: "Application data cleared.",
        importWarning: "THIS WILL DELETE ALL CURRENT DATA AND REPLACE IT WITH DATA FROM THE BACKUP FILE. Are you sure you want to continue?",
        error: "Error",
        invalidFile: "Invalid backup file.",
        success: "Success",
        restored: "Data restored successfully!",
        failed: "Failed",
        cannotProcess: "Cannot process file",
      });
    } else {
      setLabels({
        title: "Quản lý dữ liệu",
        close: "Đóng",
        export: "Sao lưu (Export)",
        import: "Phục hồi (Import)",
        clear: "Xoá hết dữ liệu",
        exportConfirm: "Tạo bản sao lưu của dữ liệu và lưu vào file?",
        importConfirm: "Bạn muốn import file dữ liệu?",
        clearConfirm: "Bạn chắc chắn muốn xóa tất cả dữ liệu? Hành động này không thể hoàn tác.",
        cancel: "Hủy",
        ok: "Đồng ý",
        cleared: "Đã xoá dữ liệu ứng dụng.",
        importWarning: "HÀNH ĐỘNG NÀY SẼ XOÁ TOÀN BỘ DỮ LIỆU HIỆN TẠI VÀ THAY THẾ BẰNG DỮ LIỆU TRONG FILE BACKUP. Bạn chắc chắn muốn tiếp tục?",
        error: "Lỗi",
        invalidFile: "File backup không hợp lệ.",
        success: "Thành công",
        restored: "Dữ liệu đã được phục hồi thành công!",
        failed: "Thất bại",
        cannotProcess: "Không thể xử lý file",
      });
    }
  }

  async function handleExport() {
    Alert.alert(labels.export, labels.exportConfirm, [
      { text: labels.cancel, style: "cancel" },
      {
        text: labels.ok,
        onPress: async () => {
          try {
            const tablesToExport: { [key: string]: any[] } = {
              users: await db.select().from(schema.users).all(),
              tasks: await db.select().from(schema.tasks).all(),
              courses: await db.select().from(schema.courses).all(),
              schedule_entries: await db.select().from(schema.schedule_entries).all(),
              calendar_events: await db.select().from(schema.calendar_events).all(),
              cancelled_events: await db.select().from(schema.cancelled_events).all(),
              reminders: await db.select().from(schema.reminders).all(),
              recurrences: await db.select().from(schema.recurrences).all(),
              habit_completions: await db.select().from(schema.habit_completions).all(),
              scheduled_notifications: await db.select().from(schema.scheduled_notifications).all(),
              pomodoro_settings: await db.select().from(schema.pomodoro_settings).all(),
              pomodoro_sessions: await db.select().from(schema.pomodoro_sessions).all(),
            };
            
            const payload = {
              exported_at: Date.now(),
              app: "time-manager",
              version: 1,
              tables: tablesToExport,
            };

            const json = JSON.stringify(payload, null, 2);
            const name = `time-manager-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
            const path = ((FileSystem as any).documentDirectory || "") + name;

            await FileSystem.writeAsStringAsync(path, json);

            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(path, { mimeType: "application/json" });
            } else {
              Alert.alert(labels.export, "Backup saved to: " + path);
            }
          } catch (e: any) {
            Alert.alert(labels.error, "Export failed: " + String(e));
          }
        },
      },
    ]);
  }

  async function handleImport() {
    Alert.alert(labels.import, labels.importConfirm, [
      { text: labels.cancel, style: "cancel" },
      {
        text: labels.ok,
        onPress: async () => {
          try {
            const res: any = await DocumentPicker.getDocumentAsync({ type: "application/json" });
            if (res.canceled || !res.assets?.length) return;

            const content = await FileSystem.readAsStringAsync(res.assets[0].uri);
            const parsed = JSON.parse(content);

            if (!parsed || !parsed.tables) {
              Alert.alert(labels.error, labels.invalidFile);
              return;
            }

            Alert.alert(
              labels.import,
              labels.importWarning,
              [
                { text: labels.cancel, style: "destructive" },
                {
                  text: labels.ok,
                  onPress: async () => {
                    const client: any = (db as any).$client;
                    try {
                      const importErrors: string[] = [];
                      client.execSync("BEGIN; PRAGMA foreign_keys=OFF;");

                      const tableNames = Object.keys(parsed.tables);
                      
                      for (const t of tableNames) {
                        try { client.execSync(`DELETE FROM ${t};`); } catch (e) { console.warn(`Không xóa được bảng ${t}:`, e); }
                      }

                      for (const tableName of tableNames) {
                        const tableSchema = (schema as any)[tableName];
                        if (!tableSchema) continue;

                        let rows: any[] = parsed.tables[tableName] || [];
                        if (rows.length === 0) continue;

                        rows.forEach(row => {
                          for (const key in row) {
                            if (isIsoDateString(row[key])) {
                              row[key] = new Date(row[key]);
                            }
                          }
                        });

                        console.log(`Importing ${rows.length} rows into "${tableName}"...`);
                        try {
                          await db.insert(tableSchema).values(rows);
                        } catch (e: any) {
                          importErrors.push(`Lỗi bảng ${tableName}: ${e.message}`);
                          console.error(`Lỗi khi import vào bảng "${tableName}":`, e);
                        }
                      }
                      
                      client.execSync("PRAGMA foreign_keys=ON; COMMIT;");
                      
                      if (importErrors.length > 0) {
                        Alert.alert("Hoàn tất với lỗi", `Phục hồi hoàn tất nhưng có ${importErrors.length} lỗi. Kiểm tra console.`);
                      } else {
                        Alert.alert(labels.success, labels.restored);
                      }

                    } catch (e: any) {
                      try { client.execSync("ROLLBACK;"); } catch {}
                      Alert.alert(labels.failed, "Phục hồi thất bại: " + e.message);
                    }
                  },
                },
              ]
            );
          } catch (e: any) {
            Alert.alert(labels.error, labels.cannotProcess + ": " + e.message);
          }
        },
      },
    ]);
  }

  async function handleClear() {
    Alert.alert(labels.clear, labels.clearConfirm, [
      { text: labels.cancel, style: "cancel" },
      {
        text: labels.ok,
        style: "destructive",
        onPress: async () => {
          try {
            const client: any = (db as any).$client;
            client.execSync("BEGIN;");
            client.execSync("PRAGMA foreign_keys=OFF;");
            const tablesToClear = [
              "scheduled_notifications", "habit_completions", "reminders",
              "calendar_events", "cancelled_events", "schedule_entries",
              "tasks", "recurrences", "courses", "pomodoro_sessions", "pomodoro_settings",
            ];
            for (const t of tablesToClear) {
              try { client.execSync(`DELETE FROM ${t};`); } catch (e) { /* ignore */ }
            }
            client.execSync("PRAGMA foreign_keys=ON;");
            client.execSync("COMMIT;");
            Alert.alert(labels.ok, labels.cleared);
          } catch (e: any) {
            try { (db as any).$client.execSync("ROLLBACK;"); } catch { }
            Alert.alert(labels.error, "Không thể xoá dữ liệu: " + String(e));
          }
        },
      },
    ]);
  }

  const s = createStyles(isDark);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.close}>{labels.close}</Text>
          </TouchableOpacity>
          <Text style={s.title}>{labels.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={s.container}>
          <TouchableOpacity style={s.row} onPress={handleExport} activeOpacity={0.7}>
            <Text style={s.label}>{labels.export}</Text>
            <Text style={s.chev}>›</Text>
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity style={s.row} onPress={handleImport} activeOpacity={0.7}>
            <Text style={s.label}>{labels.import}</Text>
            <Text style={s.chev}>›</Text>
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity style={s.row} onPress={handleClear} activeOpacity={0.7}>
            <Text style={[s.label, { color: isDark ? "#FCA5A5" : "#DC2626" }]}>{labels.clear}</Text>
            <Text style={[s.chev, { color: isDark ? "#FCA5A5" : "#DC2626" }]}>⚠</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    safe: { 
      flex: 1, 
      backgroundColor: isDark ? "#071226" : "#F6F7FB",
      paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "#0f1724" : "#e5e7eb",
      backgroundColor: isDark ? "#071226" : "#F6F7FB",
    },
    close: { color: isDark ? "#60A5FA" : "#2563EB", fontWeight: "700", fontSize: 16 },
    title: { fontSize: 18, fontWeight: "700", color: isDark ? "#E6EEF8" : "#111" },

    container: {
      backgroundColor: isDark ? "#071226" : "#fff",
      borderRadius: 12,
      marginHorizontal: 16,
      marginTop: 16,
      borderWidth: 1,
      borderColor: isDark ? "#0f1724" : "#E5E7EB",
      overflow: "hidden",
    },

    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderColor: isDark ? "#0f1724" : "#E5E7EB",
      backgroundColor: isDark ? "#071226" : "#fff",
    },
    label: { fontSize: 16, color: isDark ? "#E6EEF8" : "#111" },
    chev: { fontSize: 18, color: isDark ? "#60A5FA" : "#9ca3af" },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: isDark ? "#0f1724" : "#E5E7EB" },
  });