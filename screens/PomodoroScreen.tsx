// screens/PomodoroScreen.tsx
import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  StatusBar,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { usePomodoro } from "../hooks/usePomodoro";
import { useLanguage } from "../context/LanguageContext";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function PomodoroScreen() {
  const {
    workMin,
    shortBreakMin,
    longBreakMin,
    sessionsBeforeLong,
    mode,
    remainingSec,
    running,
    isPaused,
    start,
    pause,
    reset,
    setSettings,
    setWorkMin,
    setShortBreakMin,
    setLongBreakMin,
    setSessionsBeforeLong,
    _debug,
  } = usePomodoro();

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { language } = useLanguage();

  // Localization mapping (Vietnamese and English)
  const L = {
    vi: {
      pageTitle: "Chế độ tập trung Pomodoro",
      mode_work: "Làm việc",
      mode_short: "Nghỉ ngắn",
      mode_long: "Nghỉ dài",
      start: "Bắt đầu",
      running: "Đang chạy",
      resume: "Tiếp tục",
      pause: "Tạm dừng",
      reset: "Đặt lại",
      settingsTitle: "Cài đặt (phút)",
      noteTitle: "Ghi chú",
      noteBody:
        "• Bắt đầu / Tiếp tục: Khởi chạy hoặc tiếp tục bộ đếm từ thời gian hiện tại.\n" +
        "• Tạm dừng: Dừng bộ đếm và lưu số giây còn lại.\n" +
        "• Đặt lại: Xóa trạng thái hiện tại và trả về thời lượng mặc định của chế độ.",
      completedToday: "Phiên làm việc hoàn thành hôm nay",
      consecutive: "Phiên làm việc liên tiếp hiện tại",
      alertEmptyTitle: "Thời lượng không hợp lệ",
      alertEmptyMsg:
        "Vui lòng đặt thời lượng lớn hơn 0 cho chế độ hiện tại trước khi bắt đầu.",
      setting_labels: {
        work: "Làm việc",
        short: "Nghỉ ngắn",
        long: "Nghỉ dài",
        sessionsBeforeLong: "Số phiên",
      },
    },
    en: {
      pageTitle: "Pomodoro Focus",
      mode_work: "Work",
      mode_short: "Short Break",
      mode_long: "Long Break",
      start: "Start",
      running: "Running",
      resume: "Resume",
      pause: "Pause",
      reset: "Reset",
      settingsTitle: "Settings (minutes)",
      noteTitle: "Notes",
      noteBody:
        "• Start / Resume: Start or resume the timer from current time.\n" +
        "• Pause: Pause the timer and retain remaining seconds.\n" +
        "• Reset: Clear current state and restore default duration for the mode.",
      completedToday: "Work sessions completed today",
      consecutive: "Current consecutive sessions",
      alertEmptyTitle: "Invalid duration",
      alertEmptyMsg:
        "Please set a duration greater than 0 for the current mode before starting.",
      setting_labels: {
        work: "Work",
        short: "Short Break",
        long: "Long Break",
        sessionsBeforeLong: "Sessions Count",
      },
    },
  }[language];

  useEffect(() => {
    // no-op, kept in case future side-effects needed on language change
  }, [language]);

  const colors = {
    background: isDark ? "#071226" : "#fff",
    surface: isDark ? "#0b1220" : "#F8FAFF",
    cardBorder: isDark ? "#0f1724" : "#EFF6FF",
    text: isDark ? "#E6EEF8" : "#111827",
    muted: isDark ? "#9AA4B2" : "#374151",
    inputBg: isDark ? "#071226" : "#fff",
    controlGreen: "#10B981",
    controlOrange: "#F59E0B",
    controlRed: "#EF4444",
    runningGray: "#6B7280",
  };

  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  const isTimerActive = running || isPaused;

  const persistSingleSetting = async (
    field: "work" | "short" | "long" | "sessions",
    value: number
  ) => {
    const newSettings = {
      workMin: field === "work" ? value : workMin,
      shortBreakMin: field === "short" ? value : shortBreakMin,
      longBreakMin: field === "long" ? value : longBreakMin,
      sessionsBeforeLong: field === "sessions" ? value : sessionsBeforeLong,
    };
    await setSettings(newSettings);
  };

  const onStartPress = () => {
    const durationMap: Record<typeof mode, number> = {
      work: workMin,
      short_break: shortBreakMin,
      long_break: longBreakMin,
    };
    if (durationMap[mode] <= 0) {
      Alert.alert(L.alertEmptyTitle, L.alertEmptyMsg);
      return;
    }
    start();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <Text style={[styles.pageTitle, { color: colors.text }]}>{L.pageTitle}</Text>

      <View
        style={[
          styles.timerCard,
          { backgroundColor: colors.surface, borderColor: colors.cardBorder },
        ]}
      >
        <View
          style={[
            styles.timerCircle,
            { backgroundColor: colors.inputBg, borderColor: colors.cardBorder },
          ]}
        >
          <Text style={[styles.timerText, { color: colors.text }]}>
            {pad(minutes)}:{pad(seconds)}
          </Text>
          <Text style={[styles.modeText, { color: colors.muted }]}>
            {mode === "work"
              ? L.mode_work
              : mode === "short_break"
              ? L.mode_short
              : L.mode_long}
          </Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={onStartPress}
            style={[
              styles.controlBtn,
              { backgroundColor: running ? colors.runningGray : colors.controlGreen },
            ]}
            disabled={running}
          >
            <Text style={styles.controlText}>
              {running ? L.running : isPaused ? L.resume : L.start}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={pause}
            style={[
              styles.controlBtn,
              { backgroundColor: running ? colors.controlOrange : colors.runningGray },
            ]}
            disabled={!running}
          >
            <Text style={styles.controlText}>{L.pause}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => reset()}
            style={[
              styles.controlBtn,
              { backgroundColor: colors.controlRed, opacity: isTimerActive ? 1 : 0.5 },
            ]}
            disabled={!isTimerActive}
          >
            <Text style={styles.controlText}>{L.reset}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>{L.settingsTitle}</Text>

        {[
          { label: L.setting_labels.work, value: workMin, setter: setWorkMin, min: 1, field: "work" as const },
          { label: L.setting_labels.short, value: shortBreakMin, setter: setShortBreakMin, min: 1, field: "short" as const },
          { label: L.setting_labels.long, value: longBreakMin, setter: setLongBreakMin, min: 1, field: "long" as const },
          { label: L.setting_labels.sessionsBeforeLong, value: sessionsBeforeLong, setter: setSessionsBeforeLong, min: 1, field: "sessions" as const },
        ].map((item, idx) => (
          <View key={idx} style={styles.inputRow}>
            <Text style={[styles.label, { color: colors.text }]}>{item.label}</Text>
            <TextInput
              keyboardType="number-pad"
              value={String(item.value)}
              onChangeText={(t) => {
                const numeric = t.replace(/[^0-9]/g, "");
                const v = parseInt(numeric, 10);
                item.setter(isNaN(v) ? item.min : v);
              }}
              onBlur={async () => {
                if (item.value < item.min) item.setter(item.min);
                await persistSingleSetting(item.field, item.value);
              }}
              style={[
                styles.input,
                isTimerActive && styles.inputDisabled,
                { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.cardBorder },
              ]}
              editable={!isTimerActive}
            />
          </View>
        ))}
      </View>

      <View style={[styles.stats, { backgroundColor: colors.surface, borderColor: colors.cardBorder, borderWidth: 1 }]}>
        <Text style={[styles.statText, { color: colors.text }]}>
          {L.completedToday}: <Text style={{ fontWeight: "700" }}>—</Text>
        </Text>
        <Text style={[styles.statText, { color: colors.text }]}>
          {L.consecutive}: <Text style={{ fontWeight: "700" }}>—</Text>
        </Text>
      </View>

      <View style={[styles.helpCard, { backgroundColor: isDark ? "#1F2937" : "#FEF3C7" }]}>
        <Text style={[styles.helpTitle, { color: isDark ? "#FBBF24" : "#92400E" }]}>{L.noteTitle}</Text>
        <Text style={[styles.helpText, { color: isDark ? "#D1D5DB" : "#374151" }]}>{L.noteBody}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  timerCard: { borderRadius: 12, padding: 14, marginBottom: 24, borderWidth: 1 },
  timerCircle: { alignSelf: "center", width: 200, height: 200, borderRadius: 100, borderWidth: 8, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  timerText: { fontSize: 44, fontWeight: "800", letterSpacing: 1 },
  modeText: { marginTop: 6, fontSize: 16, textTransform: "uppercase", letterSpacing: 0.5 },
  controlsRow: { flexDirection: "row", justifyContent: "space-between" },
  controlBtn: { flex: 1, marginHorizontal: 6, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  controlText: { color: "#fff", fontWeight: "700" },
  section: { marginBottom: 24, borderRadius: 10, padding: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  inputRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(128,128,128,0.1)" },
  label: { fontSize: 16 },
  input: { width: 88, height: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, textAlign: "center", fontSize: 16, fontWeight: "600" },
  inputDisabled: { opacity: 0.6 },
  stats: { marginBottom: 24, padding: 16, borderRadius: 8 },
  statText: { fontSize: 16, lineHeight: 24 },
  helpCard: { padding: 16, borderRadius: 8 },
  helpTitle: { fontWeight: "700", marginBottom: 6, fontSize: 16 },
  helpText: { fontSize: 14, lineHeight: 20 },
});
