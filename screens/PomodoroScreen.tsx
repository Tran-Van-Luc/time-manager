// screens/PomodoroScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  Vibration,
  Platform,
  AppState,
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../context/ThemeContext";

type Mode = "work" | "short_break" | "long_break";

const STORAGE_KEY_END = "@pomodoro_endTimestamp";
const STORAGE_KEY_REMAIN = "@pomodoro_remaining";
const STORAGE_KEY_PAUSED = "@pomodoro_paused_flag";
const STORAGE_KEY_LANG = "appLanguage";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function PomodoroScreen() {
  // defaults
  const [workMin, setWorkMin] = useState<number>(25);
  const [shortBreakMin, setShortBreakMin] = useState<number>(5);
  const [longBreakMin, setLongBreakMin] = useState<number>(15);
  const [sessionsBeforeLong, setSessionsBeforeLong] = useState<number>(4);

  const [mode, setMode] = useState<Mode>("work");
  const [remainingSec, setRemainingSec] = useState<number>(workMin * 60);
  const [running, setRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const [endTimestamp, setEndTimestamp] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const [completedToday, setCompletedToday] = useState<number>(0);
  const [consecutiveWorkCount, setConsecutiveWorkCount] = useState<number>(0);

  const { theme } = useTheme();
  const isDark = theme === "dark";

  // language labels
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [L, setL] = useState(() => ({
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
    placeholder: "Nhập",
    alertEmptyTitle: "Khoảng thời gian rỗng",
    alertEmptyMsg:
      "Vui lòng đặt thời lượng lớn hơn 0 trước khi bắt đầu.",
    setting_labels: {
      work: "Làm việc",
      short: "Nghỉ ngắn",
      long: "Nghỉ dài",
      sessionsBeforeLong: "Phiên trước nghỉ dài",
    },
  }));

  // colors based on theme
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

  // load language + restore state on mount
  useEffect(() => {
    (async () => {
      try {
        const l = (await AsyncStorage.getItem(STORAGE_KEY_LANG)) as "vi" | "en" | null;
        if (l) {
          setLang(l);
          applyLang(l);
        }
      } catch {}
      // restore timer state
      try {
        const vEnd = await AsyncStorage.getItem(STORAGE_KEY_END);
        if (vEnd) {
          const saved = parseInt(vEnd, 10);
          if (!isNaN(saved) && saved > Date.now()) {
            setEndTimestamp(saved);
            setRunning(true);
            setIsPaused(false);
            setRemainingSec(Math.max(0, Math.round((saved - Date.now()) / 1000)));
            return;
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY_END);
          }
        }

        const pausedFlag = await AsyncStorage.getItem(STORAGE_KEY_PAUSED);
        const vRem = await AsyncStorage.getItem(STORAGE_KEY_REMAIN);
        if (pausedFlag === "1" && vRem) {
          const savedRem = parseInt(vRem, 10);
          if (!isNaN(savedRem)) {
            setRemainingSec(savedRem);
            setIsPaused(true);
            setRunning(false);
            return;
          }
        }

        setRemainingSec(workMin * 60);
        setIsPaused(false);
      } catch (e) {
        console.warn("Restore pomodoro failed", e);
        setRemainingSec(workMin * 60);
        setIsPaused(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyLang(l: "vi" | "en") {
    if (l === "en") {
      setL({
        pageTitle: "Pomodoro Focus Mode",
        mode_work: "Work",
        mode_short: "Short break",
        mode_long: "Long break",
        start: "Start",
        running: "Running",
        resume: "Resume",
        pause: "Pause",
        reset: "Reset",
        settingsTitle: "Settings (minutes)",
        noteTitle: "Notes",
        noteBody:
          "• Start / Resume: Start or resume the timer from the current time.\n" +
          "• Pause: Pause the timer and save remaining seconds.\n" +
          "• Reset: Clear current state and restore default durations for the mode.",
        completedToday: "Work sessions completed today",
        consecutive: "Current consecutive work sessions",
        placeholder: "Enter",
        alertEmptyTitle: "Empty duration",
        alertEmptyMsg: "Please set a duration greater than 0 before starting.",
        setting_labels: {
          work: "Work",
          short: "Short break",
          long: "Long break",
          sessionsBeforeLong: "Sessions before long break",
        },
      });
    } else {
      setL({
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
        placeholder: "Nhập",
        alertEmptyTitle: "Khoảng thời gian rỗng",
        alertEmptyMsg: "Vui lòng đặt thời lượng lớn hơn 0 trước khi bắt đầu.",
        setting_labels: {
          work: "Làm việc",
          short: "Nghỉ ngắn",
          long: "Nghỉ dài",
          sessionsBeforeLong: "Phiên trước nghỉ dài",
        },
      });
    }
  }

  // AppState listener
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        if (endTimestamp) {
          const rem = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000));
          setRemainingSec(rem);
          if (rem === 0) handleFinishInterval();
        } else {
          (async () => {
            try {
              const vEnd = await AsyncStorage.getItem(STORAGE_KEY_END);
              if (vEnd) {
                const saved = parseInt(vEnd, 10);
                if (!isNaN(saved) && saved > Date.now()) {
                  setEndTimestamp(saved);
                  setRunning(true);
                  setIsPaused(false);
                  setRemainingSec(Math.max(0, Math.round((saved - Date.now()) / 1000)));
                  return;
                } else {
                  await AsyncStorage.removeItem(STORAGE_KEY_END);
                }
              }
              const pausedFlag = await AsyncStorage.getItem(STORAGE_KEY_PAUSED);
              if (pausedFlag === "1") {
                const vRem = await AsyncStorage.getItem(STORAGE_KEY_REMAIN);
                if (vRem) {
                  const savedRem = parseInt(vRem, 10);
                  if (!isNaN(savedRem)) {
                    setRemainingSec(savedRem);
                    setIsPaused(true);
                    setRunning(false);
                  }
                }
              }
            } catch (e) {
              console.warn(e);
            }
          })();
        }
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [endTimestamp]);

  // sync remaining when durations/mode change
  useEffect(() => {
    if (isPaused) return;
    if (!running && !endTimestamp) {
      if (mode === "work") setRemainingSec(workMin * 60);
      if (mode === "short_break") setRemainingSec(shortBreakMin * 60);
      if (mode === "long_break") setRemainingSec(longBreakMin * 60);
      return;
    }
    if (endTimestamp) {
      setRemainingSec(Math.max(0, Math.round((endTimestamp - Date.now()) / 1000)));
    }
  }, [workMin, shortBreakMin, longBreakMin, mode, running, endTimestamp, isPaused]);

  // timer loop
  useEffect(() => {
    if (running) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRemainingSec((prev) => {
          if (prev <= 1) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            handleFinishInterval();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running]);

  // persist helpers
  async function persistEndTimestamp(ts: number | null) {
    try {
      if (ts === null) await AsyncStorage.removeItem(STORAGE_KEY_END);
      else await AsyncStorage.setItem(STORAGE_KEY_END, String(ts));
    } catch (e) {
      console.warn("persistEndTimestamp failed", e);
    }
  }
  async function persistRemaining(rem: number | null) {
    try {
      if (rem === null) await AsyncStorage.removeItem(STORAGE_KEY_REMAIN);
      else await AsyncStorage.setItem(STORAGE_KEY_REMAIN, String(rem));
    } catch (e) {
      console.warn("persistRemaining failed", e);
    }
  }
  async function persistPausedFlag(flag: boolean) {
    try {
      if (flag) await AsyncStorage.setItem(STORAGE_KEY_PAUSED, "1");
      else await AsyncStorage.removeItem(STORAGE_KEY_PAUSED);
    } catch (e) {
      console.warn("persistPausedFlag failed", e);
    }
  }

  // START
  function start() {
    if (remainingSec <= 0) {
      Alert.alert(L.alertEmptyTitle, L.alertEmptyMsg);
      return;
    }
    const endAt = Date.now() + remainingSec * 1000;
    setEndTimestamp(endAt);
    persistEndTimestamp(endAt);
    persistRemaining(null);
    persistPausedFlag(false);
    setIsPaused(false);
    setRunning(true);
  }

  // PAUSE
  async function pause() {
    setIsPaused(true);
    setRunning(false);
    setEndTimestamp(null);
    try {
      await persistEndTimestamp(null);
      await persistRemaining(remainingSec);
      await persistPausedFlag(true);
    } catch (e) {
      console.warn("pause persist failed", e);
    }
  }

  // RESET
  async function reset() {
    setRunning(false);
    setEndTimestamp(null);
    await persistEndTimestamp(null);
    await persistRemaining(null);
    await persistPausedFlag(false);
    setIsPaused(false);
    if (mode === "work") setRemainingSec(workMin * 60);
    if (mode === "short_break") setRemainingSec(shortBreakMin * 60);
    if (mode === "long_break") setRemainingSec(longBreakMin * 60);
  }

  // FINISH
  async function handleFinishInterval() {
    setRunning(false);
    setEndTimestamp(null);
    await persistEndTimestamp(null);
    await persistRemaining(null);
    await persistPausedFlag(false);

    try {
      if (Platform.OS === "android") Vibration.vibrate([0, 500, 200, 500]);
      else Vibration.vibrate(1000);
    } catch {}

    if (mode === "work") {
      setConsecutiveWorkCount((prev) => {
        const next = prev + 1;
        setCompletedToday((ct) => ct + 1);
        if (next >= sessionsBeforeLong) {
          setMode("long_break");
          setRemainingSec(longBreakMin * 60);
          return 0;
        } else {
          setMode("short_break");
          setRemainingSec(shortBreakMin * 60);
          return next;
        }
      });
    } else {
      setMode("work");
      setRemainingSec(workMin * 60);
    }
  }

  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <Text style={[styles.pageTitle, { color: colors.text }]}>{L.pageTitle}</Text>

      <View style={[styles.timerCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={[styles.timerCircle, { backgroundColor: colors.inputBg, borderColor: colors.cardBorder }]}>
          <Text style={[styles.timerText, { color: colors.text }]}>{pad(minutes)}:{pad(seconds)}</Text>
          <Text style={[styles.modeText, { color: colors.muted }]}>
            {mode === "work" ? L.mode_work : mode === "short_break" ? L.mode_short : L.mode_long}
          </Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={start}
            style={[styles.controlBtn, { backgroundColor: running ? colors.runningGray : colors.controlGreen }]}
            disabled={running}
          >
            <Text style={styles.controlText}>
              {running ? L.running : isPaused ? L.resume : L.start}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={pause}
            style={[styles.controlBtn, { backgroundColor: running ? colors.controlOrange : "#D97706" }]}
            disabled={!running}
          >
            <Text style={styles.controlText}>{L.pause}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={reset} style={[styles.controlBtn, { backgroundColor: colors.controlRed }]}>
            <Text style={styles.controlText}>{L.reset}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>{L.settingsTitle}</Text>

        {[
          { label: L.setting_labels.work, value: workMin, setter: setWorkMin, min: 1 },
          { label: L.setting_labels.short, value: shortBreakMin, setter: setShortBreakMin, min: 0 },
          { label: L.setting_labels.long, value: longBreakMin, setter: setLongBreakMin, min: 0 },
          { label: L.setting_labels.sessionsBeforeLong, value: sessionsBeforeLong, setter: setSessionsBeforeLong, min: 1 },
        ].map((item, idx) => (
          <View key={idx} style={styles.inputRow}>
            <Text style={[styles.label, { color: colors.text }]}>{item.label}</Text>
            <View pointerEvents={running || isPaused ? "none" : "auto"}>
              <TextInput
                keyboardType="number-pad"
                value={String(item.value)}
                onChangeText={(t) => item.setter(Math.max(item.min || 0, parseInt(t || "0") || 0))}
                style={[
                  styles.input,
                  (running || isPaused) && styles.inputDisabled,
                  { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.cardBorder },
                ]}
                editable={!running && !isPaused}
                placeholderTextColor={isDark ? "#7E8D99" : "#9CA3AF"}
              />
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.stats, { backgroundColor: isDark ? "#071226" : "#F3F4F6" }]}>
        <Text style={[styles.statText, { color: colors.text }]}>
          {L.completedToday}: <Text style={{ fontWeight: "700", color: colors.text }}>{completedToday}</Text>
        </Text>
        <Text style={[styles.statText, { color: colors.text }]}>
          {L.consecutive}: <Text style={{ fontWeight: "700", color: colors.text }}>{consecutiveWorkCount}</Text>
        </Text>
      </View>

      <View style={{ height: 24 }} />

      <View style={[styles.helpCard, { backgroundColor: isDark ? "#1F2937" : "#FEF3C7" }]}>
        <Text style={[styles.helpTitle, { color: colors.text }]}>{L.noteTitle}</Text>
        <Text style={[styles.helpText, { color: colors.text }]}>{L.noteBody}</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: "700", marginBottom: 12 },

  timerCard: { borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1 },
  timerCircle: { alignSelf: "center", width: 200, height: 200, borderRadius: 100, borderWidth: 8, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  timerText: { fontSize: 44, fontWeight: "800" },
  modeText: { marginTop: 6, fontSize: 16 },

  controlsRow: { flexDirection: "row", justifyContent: "space-between" },
  controlBtn: { flex: 1, marginHorizontal: 6, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  controlText: { color: "#fff", fontWeight: "700" },

  section: { marginTop: 12, borderRadius: 10, padding: 12, borderWidth: 1 },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 8 },

  inputRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  label: {},
  input: { width: 88, height: 36, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, textAlign: "center" },
  inputDisabled: { opacity: 0.5 },

  stats: { marginTop: 12, padding: 12, borderRadius: 8 },
  statText: { marginBottom: 6 },

  helpCard: { marginTop: 10, padding: 12, borderRadius: 8 },
  helpTitle: { fontWeight: "700", marginBottom: 6 },
  helpText: {},
});
