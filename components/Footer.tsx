import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  StyleSheet,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { usePrimaryColor } from "../context/PrimaryColorContext";

const tabsBase = [
  { key: "home", icon: "🏠", label_en: "Home", label_vi: "Trang chủ" },
  { key: "tasks", icon: "📋", label_en: "Tasks", label_vi: "Công việc" },
  { key: "schedule", icon: "📅", label_en: "Schedule", label_vi: "Lịch học" },
  { key: "pomodoro", icon: "⏰", label_en: "Focus", label_vi: "Tập trung" },
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
  const { language } = useLanguage();

  // primaryColor provided by PrimaryColorContext (kept in sync globally)
  const { primaryColor } = usePrimaryColor();

  // local accent mirrors primaryColor for styling; fallback to default
  const [accent, setAccent] = useState<string>(primaryColor ?? "#2563EB");

  useEffect(() => {
    if (primaryColor) setAccent(primaryColor);
  }, [primaryColor]);

  const colors = {
    background: isDark ? "#0B1220" : "#f9fafb",
    surface: isDark ? "#0F1724" : "#fff",
    card: isDark ? "#111827" : "#fff",
    text: isDark ? "#E6EEF8" : "#111827",
    muted: isDark ? "#9AA4B2" : "#6b7280",
    border: isDark ? "#1f2937" : "#eee",
    themeColor: accent,
  };

  // Gán nhãn theo ngôn ngữ
  const tabs = tabsBase.map((t) => ({
    key: t.key,
    icon: t.icon,
    label: language === "en" ? t.label_en : t.label_vi,
  }));

  // Hiệu ứng thanh highlight
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
              <Text style={[styles.icon, active && { color: accent }]}>
                {tab.icon}
              </Text>
              <Text style={[styles.label, active && { color: accent }]}>
                {tab.label}
              </Text>
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
