// app/setting.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AntDesign } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import AppearanceSettings from "../components/settings/AppearanceSettings";
import LanguageSettings from "../components/settings/LanguageSettings";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_LANG = "appLanguage";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [notifEnabled, setNotifEnabled] = React.useState(true);
  const [showAppearance, setShowAppearance] = React.useState(false);
  const [showLanguage, setShowLanguage] = React.useState(false);
  const [labels, setLabels] = useState({
    close: "Đóng",
    title: "Cài đặt",
    notifications: "Thông báo",
    appearance: "Giao diện",
    language: "Ngôn ngữ",
  });

  useEffect(() => {
    (async () => {
      try {
        const l = (await AsyncStorage.getItem(STORAGE_KEY_LANG)) as "vi" | "en" | null;
        if (l === "en") {
          setLabels({
            close: "Close",
            title: "Settings",
            notifications: "Notifications",
            appearance: "Appearance",
            language: "Language",
          });
        } else {
          setLabels({
            close: "Đóng",
            title: "Cài đặt",
            notifications: "Thông báo",
            appearance: "Giao diện",
            language: "Ngôn ngữ",
          });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [showLanguage]);

  const colors = {
    background: isDark ? "#121212" : "#f6f7fb",
    surface: isDark ? "#1E1E1E" : "#fff",
    text: isDark ? "#E1E1E1" : "#111",
    subtleText: isDark ? "#A0A0A0" : "#999",
    border: isDark ? "#333" : "#ddd",
    accent: "#2563EB",
  };

  const Row = ({ icon, title, right, onPress }: any) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.icon, { color: colors.text }]}>{icon}</Text>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <View style={styles.right}>{right}</View>
    </TouchableOpacity>
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 8 },
      ]}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.closeText, { color: colors.accent }]}>{labels.close}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{labels.title}</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.group, { borderColor: colors.border }]}>
          <Row
            icon="🔔"
            title={labels.notifications}
            right={
              <View style={styles.switchWrap}>
                <Switch
                  value={notifEnabled}
                  onValueChange={setNotifEnabled}
                  trackColor={{ false: "#ccc", true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>
            }
            onPress={() => setNotifEnabled((v) => !v)}
          />

          <Row
            icon="🎨"
            title={labels.appearance}
            right={<AntDesign name="right" size={18} color={colors.text} />}
            onPress={() => setShowAppearance(true)}
          />

          <Row
            icon="🌐"
            title={labels.language}
            right={<AntDesign name="right" size={18} color={colors.text} />}
            onPress={() => setShowLanguage(true)}
          />
        </View>

        <AppearanceSettings
          visible={showAppearance}
          onClose={() => setShowAppearance(false)}
        />
        <LanguageSettings
          visible={showLanguage}
          onClose={() => setShowLanguage(false)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  closeText: { fontSize: 16, fontWeight: "600" },
  headerTitle: { fontSize: 20, fontWeight: "700" },

  content: { paddingVertical: 16 },
  group: {
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: "hidden",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: 52,
  },
  icon: { fontSize: 18, width: 28, textAlign: "center" },
  title: { flex: 1, fontSize: 16, marginLeft: 6 },
  right: {
    minWidth: 40,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  switchWrap: {
    transform: [{ scale: 0.85 }],
    justifyContent: "center",
    alignItems: "center",
  },
});
