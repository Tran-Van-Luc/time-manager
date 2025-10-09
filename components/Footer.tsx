import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../context/ThemeContext";

const STORAGE_KEY_PRIMARY = "primaryColor";
const STORAGE_KEY_LANG = "appLanguage";

const tabsBase = [
  { key: "home", icon: "🏠", label_en: "Home", label_vi: "Trang chủ" },
  { key: "tasks", icon: "📋", label_en: "Tasks", label_vi: "Công việc" },
  { key: "schedule", icon: "📅", label_en: "Schedule", label_vi: "Lịch học" },
  { key: "pomodoro", icon: "⏰", label_en: "Focus", label_vi: "Tập Trung" },
  { key: "stats", icon: "📊", label_en: "Stats", label_vi: "Thống kê" },
];

export default function Footer({
  activeTab = "home",
  onTabPress,
}: {
  activeTab?: string;
  onTabPress?: (tab: string) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [accent, setAccent] = useState<string>("#2563EB");
  const [lang, setLang] = useState<"vi" | "en">("vi");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const c = await AsyncStorage.getItem(STORAGE_KEY_PRIMARY);
        if (mounted && c) setAccent(c);
      } catch {}
    })();
    (async () => {
      try {
        const l = (await AsyncStorage.getItem(STORAGE_KEY_LANG)) as "vi" | "en" | null;
        if (mounted && l) setLang(l);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const tabs = tabsBase.map((t) => ({
    key: t.key,
    icon: t.icon,
    label: lang === "en" ? t.label_en : t.label_vi,
  }));

  const translateAnim = useRef(new Animated.Value(0)).current;
  const tabWidth = Dimensions.get("window").width / tabs.length;

  useEffect(() => {
    const index = Math.max(0, tabs.findIndex((t) => t.key === activeTab));
    Animated.spring(translateAnim, {
      toValue: index * tabWidth,
      useNativeDriver: true,
      bounciness: 8,
    }).start();
  }, [activeTab, tabWidth, translateAnim, tabs]);

  const styles = createStyles(isDark, accent);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => onTabPress?.(tab.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.icon, active && { color: accent }]}>{tab.icon}</Text>
              <Text style={[styles.label, active && { color: accent }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Animated.View
        style={[
          styles.highlight,
          {
            transform: [{ translateX: translateAnim }],
            backgroundColor: accent,
            width: tabWidth,
          },
        ]}
      />
    </View>
  );
}

const createStyles = (isDark: boolean, accent: string) =>
  StyleSheet.create({
    container: {
      height: 64,
      backgroundColor: isDark ? "#071226" : "#ffffff",
      borderTopWidth: 1,
      borderTopColor: isDark ? "#0f1724" : "#e5e7eb",
      justifyContent: "center",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      height: 60,
    },
    tab: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 6,
    },
    icon: {
      fontSize: 20,
      color: isDark ? "#9aa4b2" : "#9ca3af",
    },
    label: {
      marginTop: 2,
      fontSize: 11,
      color: isDark ? "#9aa4b2" : "#9ca3af",
    },
    highlight: {
      position: "absolute",
      bottom: 0,
      left: 0,
      height: 3,
    },
  });
