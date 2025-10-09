// components/settings/PrimaryColorPicker.tsx
import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  SafeAreaView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Button,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../context/ThemeContext";

const STORAGE_KEY_PRIMARY = "primaryColor";
const STORAGE_KEY_LANG = "appLanguage";

const PRESETS = [
  { id: "blue", name_en: "Simple Blue", name_vi: "Simple Blue", color: "#2563EB" },
  { id: "green", name_en: "Simple Green", name_vi: "Simple Green", color: "#10B981" },
  { id: "purple", name_en: "Simple Purple", name_vi: "Simple Purple", color: "#7C3AED" },
  { id: "orange", name_en: "Simple Orange", name_vi: "Simple Orange", color: "#F59E0B" },
  { id: "rose", name_en: "Simple Rose", name_vi: "Simple Rose", color: "#EF4444" },
];

export default function PrimaryColorPicker({
  visible,
  onClose,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  onApply?: (color: string) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = PRESETS[selectedIdx];
  const [month, setMonth] = useState(new Date());
  const [lang, setLang] = useState<"vi" | "en">("vi");

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY_PRIMARY);
        const i = PRESETS.findIndex((p) => p.color === v);
        if (i >= 0) setSelectedIdx(i);
      } catch {}
    })();
  }, [visible]);

  useEffect(() => {
    (async () => {
      try {
        const l = (await AsyncStorage.getItem(STORAGE_KEY_LANG)) as "vi" | "en" | null;
        if (l) setLang(l);
      } catch {}
    })();
  }, [visible]);

  async function handleApply() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_PRIMARY, selected.color);
      onApply?.(selected.color);
    } catch {}
    onClose();
  }

  // calendar grid for month (hide outside-month cells)
  const monthDays = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

    const totalCells = firstWeekday + daysInMonth;
    const rows = Math.ceil(totalCells / 7);
    const grid: (number | null)[][] = [];

    let d = 1;
    for (let r = 0; r < rows; r++) {
      const row: (number | null)[] = [];
      for (let c = 0; c < 7; c++) {
        const idx = r * 7 + c;
        if (idx < firstWeekday || d > daysInMonth) row.push(null);
        else {
          row.push(d);
          d++;
        }
      }
      grid.push(row);
    }
    return grid;
  }, [month]);

  function prevMonth() {
    setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  }
  function nextMonth() {
    setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  }

  function prevPreset() {
    setSelectedIdx((p) => (p - 1 + PRESETS.length) % PRESETS.length);
  }
  function nextPreset() {
    setSelectedIdx((p) => (p + 1) % PRESETS.length);
  }

  const screenWidth = Dimensions.get("window").width;
  const cellSize = screenWidth / 7.4;

  const styles = createStyles(isDark);

  const labels = {
    title: lang === "en" ? "Primary color" : "Màu chủ đạo",
    close: lang === "en" ? "Close" : "Đóng",
    apply: lang === "en" ? "Apply" : "Áp dụng",
    monthLabel: (m: Date) => (lang === "en" ? `Month ${m.getMonth() + 1}, ${m.getFullYear()}` : `Tháng ${m.getMonth() + 1}, ${m.getFullYear()}`),
    day: lang === "en" ? "Day" : "Ngày",
    week: lang === "en" ? "Week" : "Tuần",
    monthTab: lang === "en" ? "Month" : "Tháng",
    weekLabels: lang === "en" ? ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] : ["T2","T3","T4","T5","T6","T7","CN"],
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.close}>{labels.close}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{labels.title}</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Preset bar */}
          <View style={[styles.presetBar, { borderColor: selected.color }]}>
            <TouchableOpacity onPress={prevPreset} style={styles.arrow}>
              <Text style={[styles.arrowText, { color: selected.color }]}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.presetName}>{lang === "en" ? selected.name_en : selected.name_vi}</Text>
            <TouchableOpacity onPress={nextPreset} style={styles.arrow}>
              <Text style={[styles.arrowText, { color: selected.color }]}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Month nav + mode */}
          <View style={styles.navWrap}>
            <View style={styles.monthSwitch}>
              <TouchableOpacity onPress={prevMonth} style={styles.monthArrow}>
                <Text style={[styles.monthArrowText, { color: isDark ? "#cbd5e1" : "#555" }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: isDark ? "#E6EEF8" : "#111" }]}>
                {labels.monthLabel(month)}
              </Text>
              <TouchableOpacity onPress={nextMonth} style={styles.monthArrow}>
                <Text style={[styles.monthArrowText, { color: isDark ? "#cbd5e1" : "#555" }]}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.modeSwitch, { backgroundColor: isDark ? "#0b1220" : "#F0F0F0" }]}>
              <TouchableOpacity style={styles.modeBtn}>
                <Text style={[styles.modeText, { color: isDark ? "#E6EEF8" : "#111" }]}>{labels.day}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modeBtn}>
                <Text style={[styles.modeText, { color: isDark ? "#E6EEF8" : "#111" }]}>{labels.week}</Text>
              </TouchableOpacity>
              <View style={[styles.modeBtnActive, { backgroundColor: selected.color }]}>
                <Text style={styles.modeTextActive}>{labels.monthTab}</Text>
              </View>
            </View>
          </View>

          {/* Week labels */}
          <View style={styles.weekRow}>
            {labels.weekLabels.map((lbl) => (
              <Text key={lbl} style={[styles.weekLabel, { color: selected.color }]}>
                {lbl}
              </Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.grid}>
            {monthDays.map((row, rIdx) => (
              <View key={rIdx} style={styles.row}>
                {row.map((d, cIdx) =>
                  d ? (
                    <View
                      key={cIdx}
                      style={[
                        styles.cell,
                        {
                          width: cellSize,
                          height: cellSize * 1.05,
                          borderColor: isDark ? "#0f1724" : "#E5E7EB",
                          backgroundColor: isDark ? "#071226" : "#fff",
                        },
                      ]}
                    >
                      <Text style={[styles.dayNum, { color: isDark ? "#E6EEF8" : "#111" }]}>{d}</Text>
                    </View>
                  ) : (
                    <View
                      key={cIdx}
                      style={{ width: cellSize, height: cellSize * 1.05 }}
                    />
                  )
                )}
              </View>
            ))}
          </View>

          {/* Apply button */}
          <TouchableOpacity
            style={[styles.applyBtn, { backgroundColor: selected.color }]}
            onPress={handleApply}
            activeOpacity={0.9}
          >
            <Text style={styles.applyText}>{labels.apply}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: isDark ? "#071226" : "#F6F7F9" },
    scroll: { alignItems: "center", paddingBottom: 20 },

    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "#0f1724" : "#e5e7eb",
      backgroundColor: isDark ? "#071226" : "#F6F7F9",
    },
    title: { fontSize: 17, fontWeight: "700", color: isDark ? "#E6EEF8" : "#111" },
    close: { color: isDark ? "#60A5FA" : "#007AFF", fontWeight: "600" },

    presetBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 2,
      borderRadius: 8,
      width: "90%",
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginBottom: 16,
      backgroundColor: isDark ? "#071226" : "transparent",
    },
    presetName: { fontSize: 15, fontWeight: "700", color: isDark ? "#E6EEF8" : "#111" },
    arrow: { paddingHorizontal: 6, paddingVertical: 2 },
    arrowText: { fontSize: 18, fontWeight: "700" },

    navWrap: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      width: "90%",
      marginBottom: 8,
    },
    monthSwitch: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    monthArrow: {
      backgroundColor: isDark ? "#0b1220" : "#fff",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      elevation: isDark ? 0 : 1,
    },
    monthArrowText: { fontSize: 16, fontWeight: "700" },
    monthLabel: { fontSize: 13, fontWeight: "600" },

    modeSwitch: {
      flexDirection: "row",
      borderRadius: 12,
      overflow: "hidden",
    },
    modeBtn: { paddingHorizontal: 12, paddingVertical: 6, alignItems: "center", justifyContent: "center" },
    modeBtnActive: { paddingHorizontal: 12, paddingVertical: 6, alignItems: "center", justifyContent: "center" },
    modeText: { fontWeight: "600" },
    modeTextActive: { fontWeight: "700", color: "#fff" },

    weekRow: {
      flexDirection: "row",
      width: "92%",
      justifyContent: "space-between",
      marginTop: 4,
      marginBottom: 6,
    },
    weekLabel: { fontSize: 13, fontWeight: "600" },

    grid: {
      backgroundColor: isDark ? "#071226" : "#fff",
      borderRadius: 12,
      width: "92%",
      paddingVertical: 6,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? "#0f1724" : "#E5E7EB",
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    cell: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 0.5,
    },
    dayNum: { fontSize: 13, fontWeight: "600" },

    applyBtn: {
      marginTop: 8,
      paddingHorizontal: 28,
      paddingVertical: 10,
      borderRadius: 20,
    },
    applyText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
