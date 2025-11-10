import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";

const STORAGE_KEY_WIDGET_THEME = "widgetTheme";

const THEMES = [
  { id: "blue", name: "Simple Blue", color: "#2563EB" },
  { id: "green", name: "Simple Green", color: "#22C55E" },
  { id: "pink", name: "Healthy Pink", color: "#EC4899" },
];

export default function WidgetSettings({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isDark = theme === "dark";

  const [selected, setSelected] = useState("blue");

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY_WIDGET_THEME);
      if (saved) setSelected(saved);
    })();
  }, [visible]);

  async function selectTheme(id: string) {
    setSelected(id);
    await AsyncStorage.setItem(STORAGE_KEY_WIDGET_THEME, id);
  }

  const s = createStyles(isDark);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.close}>{t.widgetSettings.close}</Text>
          </TouchableOpacity>
          <Text style={s.title}>{t.widgetSettings.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={s.scroll}>
          <View style={s.previewContainer}>
            <View style={[s.widgetBox, { borderColor: "#E5E7EB" }]}>
              <View style={s.widgetHeader}>
                <Text style={s.dateText}>26/8 Thứ 3</Text>
                <Text style={s.weekText}>CN</Text>
              </View>
              <View style={{ marginTop: 8 }}>
                <Text style={s.eventText}>📌 Event: Học React Native</Text>
                <Text style={s.eventSub}>mô tả ngắn...</Text>
                <Text style={s.eventText}>🕒 Event: Làm đồ án</Text>
                <Text style={s.eventSub}>2 sự kiện</Text>
              </View>
            </View>
          </View>

          <View style={s.container}>
            {THEMES.map((thm, i) => (
              <TouchableOpacity
                key={thm.id}
                style={[
                  s.row,
                  { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth },
                ]}
                onPress={() => selectTheme(thm.id)}
                activeOpacity={0.7}
              >
                <View style={s.rowLeft}>
                  <View style={[s.iconBox, { backgroundColor: thm.color }]}>
                    <Text style={s.iconText}>📅</Text>
                  </View>
                  <Text style={s.label}>{thm.name}</Text>
                </View>
                {selected === thm.id && <Text style={s.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: isDark ? "#071226" : "#F6F7FB" },
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
    scroll: { flex: 1 },
    previewContainer: { padding: 16 },
    widgetBox: {
      backgroundColor: "#fff",
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 5,
      elevation: 2,
    },
    widgetHeader: { flexDirection: "row", justifyContent: "space-between" },
    dateText: { fontWeight: "600", fontSize: 16, color: "#111" },
    weekText: { color: "#DC2626", fontWeight: "500" },
    eventText: { fontSize: 14, marginTop: 4, fontWeight: "500", color: "#111" },
    eventSub: { fontSize: 13, color: "#6B7280" },
    container: {
      backgroundColor: isDark ? "#071226" : "#fff",
      borderRadius: 12,
      marginHorizontal: 16,
      marginBottom: 24,
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
    rowLeft: { flexDirection: "row", alignItems: "center" },
    iconBox: {
      width: 26,
      height: 26,
      borderRadius: 6,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
    },
    iconText: { fontSize: 12 },
    label: { fontSize: 16, color: isDark ? "#E6EEF8" : "#111" },
    check: { color: isDark ? "#60A5FA" : "#22C55E", fontSize: 18, fontWeight: "600" },
  });
