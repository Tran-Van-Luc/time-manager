// components/settings/AppearanceSettings.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  SafeAreaView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import PrimaryColorPicker from "./PrimaryColorPicker";

const STORAGE_KEY_PREF_THEME = "prefTheme";
const STORAGE_KEY_PRIMARY = "primaryColor";
const STORAGE_KEY_LANG = "appLanguage";

export default function AppearanceSettings({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const systemTheme = Appearance.getColorScheme() || "light";

  const [prefTheme, setPrefTheme] = useState<"system" | "light" | "dark">("system");
  const [showPrimaryPicker, setShowPrimaryPicker] = useState(false);
  const [labels, setLabels] = useState({
    title: "Giao diện",
    close: "Đóng",
    system: "Hệ thống",
    dark: "Tối",
    light: "Sáng",
    primaryColor: "Màu chủ đạo",
  });

  const themeOptions = [
    { id: "system", labelKey: "system", icon: "contrast-outline" },
    { id: "dark", labelKey: "dark", icon: "moon-outline" },
    { id: "light", labelKey: "light", icon: "sunny-outline" },
  ];

  useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(STORAGE_KEY_PREF_THEME)) as
          | "system"
          | "light"
          | "dark"
          | null;
        if (saved) setPrefTheme(saved);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const lang = (await AsyncStorage.getItem(STORAGE_KEY_LANG)) as "vi" | "en" | null;
        updateLabels(lang ?? "vi");
      } catch {
        updateLabels("vi");
      }
    })();
  }, [visible]);

  async function applyPref(next: "system" | "light" | "dark") {
    setPrefTheme(next);
    await AsyncStorage.setItem(STORAGE_KEY_PREF_THEME, next);

    const current = theme;
    const sys = Appearance.getColorScheme() || "light";

    if (next === "system") {
      if (sys === "dark" && current !== "dark") toggleTheme();
      if (sys === "light" && current !== "light") toggleTheme();
    } else {
      if (next === "dark" && current !== "dark") toggleTheme();
      if (next === "light" && current !== "light") toggleTheme();
    }
  }

  function updateLabels(lang: "vi" | "en") {
    if (lang === "en") {
      setLabels({
        title: "Appearance",
        close: "Close",
        system: "System",
        dark: "Dark",
        light: "Light",
        primaryColor: "Primary color",
      });
    } else {
      setLabels({
        title: "Giao diện",
        close: "Đóng",
        system: "Hệ thống",
        dark: "Tối",
        light: "Sáng",
        primaryColor: "Màu chủ đạo",
      });
    }
  }

  const styles = createStyles(isDark);

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>{labels.close}</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{labels.title}</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.card}>
              {themeOptions.map((t, idx) => {
                const active = prefTheme === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => applyPref(t.id as any)}
                    style={[
                      styles.item,
                      idx === 0 && styles.itemFirst,
                      idx === themeOptions.length - 1 && styles.itemLast,
                      active && styles.itemActive,
                    ]}
                  >
                    <View style={styles.itemLeft}>
                      <Ionicons
                        name={t.icon as any}
                        size={18}
                        color={active ? styles.iconActive.color : styles.icon.color}
                      />
                      <Text style={[styles.itemText, active && styles.itemTextActive]}>
                        {t.id === "system" ? labels.system : t.id === "dark" ? labels.dark : labels.light}
                      </Text>
                    </View>
                    {prefTheme === t.id && (
                      <Ionicons name="checkmark" size={18} color={styles.check.color} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.card}>
              <TouchableOpacity
                style={[styles.item, styles.itemSingle]}
                onPress={() => setShowPrimaryPicker(true)}
              >
                <View style={styles.itemLeft}>
                  <Ionicons name="color-palette-outline" size={18} color={isDark ? "#9aa4b2" : "#374151"} />
                  <Text style={[styles.itemText, { color: isDark ? "#E6EEF8" : "#111" }]}>{labels.primaryColor}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={isDark ? "#9aa4b2" : "#9ca3af"} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <PrimaryColorPicker
        visible={showPrimaryPicker}
        onClose={() => setShowPrimaryPicker(false)}
        onApply={async (color) => {
          try {
            await AsyncStorage.setItem(STORAGE_KEY_PRIMARY, color);
          } catch {}
        }}
      />
    </>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: isDark ? "#071226" : "#F5F6F7",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "#0f1724" : "#e5e7eb",
      backgroundColor: isDark ? "#071226" : "#F5F6F7",
    },
    title: {
      fontSize: 17,
      fontWeight: "600",
      color: isDark ? "#E6EEF8" : "#111",
    },
    closeText: {
      color: isDark ? "#60A5FA" : "#007AFF",
      fontSize: 16,
      fontWeight: "500",
    },

    container: {
      padding: 12,
    },

    card: {
      backgroundColor: isDark ? "#071226" : "#fff",
      borderRadius: 10,
      marginBottom: 20,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDark ? "#0f1724" : "#eee",
    },

    item: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "#0f1724" : "#E5E5EA",
      backgroundColor: isDark ? "#071226" : "#fff",
    },
    itemFirst: {
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
    },
    itemLast: {
      borderBottomWidth: 0,
      borderBottomLeftRadius: 10,
      borderBottomRightRadius: 10,
    },
    itemSingle: {
      borderBottomWidth: 0,
    },
    itemActive: {
      backgroundColor: isDark ? "#0b2540" : "#E7F0FF",
      borderColor: isDark ? "#0b2540" : "#E7F0FF",
    },

    itemLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    itemText: {
      fontSize: 16,
      color: isDark ? "#E6EEF8" : "#111",
    },
    itemTextActive: {
      color: isDark ? "#E6EEF8" : "#0b4ad6",
      fontWeight: "700",
    },

    icon: {
      color: isDark ? "#9aa4b2" : "#374151",
    },
    iconActive: {
      color: isDark ? "#60A5FA" : "#2563EB",
    },
    check: {
      color: isDark ? "#60A5FA" : "#2563EB",
    },
    chevron: {
      color: isDark ? "#9aa4b2" : "#9ca3af",
    },
  });
