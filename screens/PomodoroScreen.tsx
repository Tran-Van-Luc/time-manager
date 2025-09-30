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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Mode = "work" | "short_break" | "long_break";

const STORAGE_KEY_END = "@pomodoro_endTimestamp";
const STORAGE_KEY_REMAIN = "@pomodoro_remaining";
const STORAGE_KEY_PAUSED = "@pomodoro_paused_flag";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function PomodoroScreen() {
  // mặc định (Pomodoro tiêu chuẩn)
  const [workMin, setWorkMin] = useState<number>(25);
  const [shortBreakMin, setShortBreakMin] = useState<number>(5);
  const [longBreakMin, setLongBreakMin] = useState<number>(15);
  const [sessionsBeforeLong, setSessionsBeforeLong] = useState<number>(4);

  const [mode, setMode] = useState<Mode>("work");
  const [remainingSec, setRemainingSec] = useState<number>(workMin * 60);
  const [running, setRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false); // người dùng chủ động tạm dừng

  // khả năng chịu đựng khi vào nền (background resilience)
  const [endTimestamp, setEndTimestamp] = useState<number | null>(null); // thời điểm kết thúc (ms)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const [completedToday, setCompletedToday] = useState<number>(0);
  const [consecutiveWorkCount, setConsecutiveWorkCount] = useState<number>(0);

  // Khôi phục khi mount: ưu tiên deadline đang hoạt động, nếu không có thì khôi phục remaining khi đang paused
  useEffect(() => {
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

        // khởi tạo mặc định
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

  // AppState: khi app chuyển sang active, tính lại remaining từ deadline hoặc thử khôi phục remaining khi paused
  useEffect(() => {
    const sub = AppState.addEventListener("change", next => {
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

  // Đồng bộ remaining khi mode/độ dài thay đổi
  useEffect(() => {
    // Nếu đang paused giữ nguyên remaining
    if (isPaused) return;

    // Nếu không chạy và không có deadline, đặt lại remaining theo mode mặc định
    if (!running && !endTimestamp) {
      if (mode === "work") setRemainingSec(workMin * 60);
      if (mode === "short_break") setRemainingSec(shortBreakMin * 60);
      if (mode === "long_break") setRemainingSec(longBreakMin * 60);
      return;
    }

    // Nếu có deadline, tính remaining từ đó
    if (endTimestamp) {
      setRemainingSec(Math.max(0, Math.round((endTimestamp - Date.now()) / 1000)));
    }
  }, [workMin, shortBreakMin, longBreakMin, mode, running, endTimestamp, isPaused]);

  // Vòng lặp timer (cập nhật UI khi foreground và đang chạy)
  useEffect(() => {
    if (running) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRemainingSec(prev => {
          if (prev <= 1) {
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            handleFinishInterval();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [running]);

  // hàm lưu trạng thái
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

  // BẮT ĐẦU / TIẾP TỤC
  function start() {
    if (remainingSec <= 0) {
      Alert.alert("Khoảng thời gian rỗng", "Vui lòng đặt thời lượng lớn hơn 0 trước khi bắt đầu.");
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

  // TẠM DỪNG: đóng băng (đặt isPaused ngay lập tức rồi lưu)
  async function pause() {
    // đặt cờ paused ngay lập tức để tránh các effect khác ghi đè remaining
    setIsPaused(true);

    // dừng chạy và xoá deadline
    setRunning(false);
    setEndTimestamp(null);

    // lưu trạng thái paused và remaining
    try {
      await persistEndTimestamp(null);
      await persistRemaining(remainingSec);
      await persistPausedFlag(true);
    } catch (e) {
      console.warn("pause persist failed", e);
    }
  }

  // ĐẶT LẠI: xoá trạng thái đã lưu và reset remaining về mặc định của mode hiện tại
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

  // KẾT THÚC: khi remaining về 0
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
      setConsecutiveWorkCount(prev => {
        const next = prev + 1;
        setCompletedToday(ct => ct + 1);
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
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.pageTitle}>Chế độ tập trung Pomodoro</Text>

      <View style={styles.timerCard}>
        <View style={styles.timerCircle}>
          <Text style={styles.timerText}>{pad(minutes)}:{pad(seconds)}</Text>
          <Text style={styles.modeText}>
            {mode === "work" ? "Làm việc" : mode === "short_break" ? "Nghỉ ngắn" : "Nghỉ dài"}
          </Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={start}
            style={[styles.controlBtn, { backgroundColor: running ? "#6B7280" : "#10B981" }]}
            disabled={running}
          >
            <Text style={styles.controlText}>
              {running ? "Đang chạy" : isPaused ? "Tiếp tục" : "Bắt đầu"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={pause}
            style={[styles.controlBtn, { backgroundColor: running ? "#F59E0B" : "#D97706" }]}
            disabled={!running}
          >
            <Text style={styles.controlText}>Tạm dừng</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={reset} style={[styles.controlBtn, { backgroundColor: "#EF4444" }]}>
            <Text style={styles.controlText}>Đặt lại</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cài đặt (phút)</Text>

        {[
          { label: "Làm việc", value: workMin, setter: setWorkMin, min: 1 },
          { label: "Nghỉ ngắn", value: shortBreakMin, setter: setShortBreakMin, min: 0 },
          { label: "Nghỉ dài", value: longBreakMin, setter: setLongBreakMin, min: 0 },
          { label: "Phiên trước nghỉ dài", value: sessionsBeforeLong, setter: setSessionsBeforeLong, min: 1 },
        ].map((item, idx) => (
          <View key={idx} style={styles.inputRow}>
            <Text style={styles.label}>{item.label}</Text>
            <View pointerEvents={running || isPaused ? "none" : "auto"}>
              <TextInput
                keyboardType="number-pad"
                value={String(item.value)}
                onChangeText={t => item.setter(Math.max(item.min || 0, parseInt(t || "0") || 0))}
                style={[styles.input, (running || isPaused) && styles.inputDisabled]}
                editable={!running && !isPaused}
              />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.stats}>
        <Text style={styles.statText}>Phiên làm việc hoàn thành hôm nay: <Text style={{ fontWeight: "700" }}>{completedToday}</Text></Text>
        <Text style={styles.statText}>Phiên làm việc liên tiếp hiện tại: <Text style={{ fontWeight: "700" }}>{consecutiveWorkCount}</Text></Text>
      </View>

      <View style={{ height: 24 }} />

      <View style={styles.helpCard}>
        <Text style={styles.helpTitle}>Ghi chú</Text>
        <Text style={styles.helpText}>
          • Bắt đầu / Tiếp tục: Khởi chạy hoặc tiếp tục bộ đếm từ thời gian hiện tại.{"\n"}
          • Tạm dừng: Dừng bộ đếm và lưu số giây còn lại.{"\n"}
          • Đặt lại: Xóa trạng thái hiện tại và trả về thời lượng mặc định của chế độ.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 12 },

  timerCard: { backgroundColor: "#F8FAFF", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#EFF6FF" },
  timerCircle: { alignSelf: "center", width: 200, height: 200, borderRadius: 100, borderWidth: 8, borderColor: "#EFF6FF", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", marginBottom: 12 },
  timerText: { fontSize: 44, fontWeight: "800", color: "#111827" },
  modeText: { marginTop: 6, fontSize: 16, color: "#374151" },

  controlsRow: { flexDirection: "row", justifyContent: "space-between" },
  controlBtn: { flex: 1, marginHorizontal: 6, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  controlText: { color: "#fff", fontWeight: "700" },

  section: { marginTop: 12, backgroundColor: "#fff", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#EFF6FF" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#374151", marginBottom: 8 },

  inputRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  label: { color: "#374151" },
  input: { width: 88, height: 36, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 8, textAlign: "center", backgroundColor: "#fff" },
  inputDisabled: { opacity: 0.5, backgroundColor: "#F3F4F6" },

  stats: { marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: "#F3F4F6" },
  statText: { color: "#374151", marginBottom: 6 },

  helpCard: { marginTop: 10, padding: 12, borderRadius: 8, backgroundColor: "#FEF3C7" },
  helpTitle: { fontWeight: "700", marginBottom: 6 },
  helpText: { color: "#374151" },
});
