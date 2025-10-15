// hooks/usePomodoro.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Vibration } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { loadPomodoroSettingsSync, loadPomodoroSettingsFallbackAsync, persistPomodoroSettingsSync, insertPomodoroSessionSync } from "../database/pomodoro";

type Mode = "work" | "short_break" | "long_break";

const STORAGE_KEY_END = "@pomodoro_endTimestamp";
const STORAGE_KEY_REMAIN = "@pomodoro_remaining";
const STORAGE_KEY_PAUSED = "@pomodoro_paused_flag";

export type SettingsShape = {
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  sessionsBeforeLong: number;
  muteNotifications?: number;
};

export function usePomodoro() {
  const [workMin, setWorkMin] = useState<number>(25);
  const [shortBreakMin, setShortBreakMin] = useState<number>(5);
  const [longBreakMin, setLongBreakMin] = useState<number>(15);
  const [sessionsBeforeLong, setSessionsBeforeLong] = useState<number>(4);

  const [mode, setMode] = useState<Mode>("work");
  const [remainingSec, setRemainingSec] = useState<number>(25 * 60);
  const [running, setRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [endTimestamp, setEndTimestamp] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endNotifRef = useRef<string | null>(null);
  const scheduledRef = useRef<boolean>(false);

  const didLoadSettingsRef = useRef<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const s = loadPomodoroSettingsSync();
        const looksLikeDefaults = s.workMin === 25 && s.shortBreakMin === 5 && s.longBreakMin === 15 && s.sessionsBeforeLong === 4;
        if (looksLikeDefaults) {
          const fallback = await loadPomodoroSettingsFallbackAsync();
          setWorkMin(fallback.workMin);
          setShortBreakMin(fallback.shortBreakMin);
          setLongBreakMin(fallback.longBreakMin);
          setSessionsBeforeLong(fallback.sessionsBeforeLong);
          setRemainingSec((prev) => {
            if (mode === "work") return fallback.workMin * 60;
            if (mode === "short_break") return fallback.shortBreakMin * 60;
            return fallback.longBreakMin * 60;
          });
        } else {
          setWorkMin(s.workMin);
          setShortBreakMin(s.shortBreakMin);
          setLongBreakMin(s.longBreakMin);
          setSessionsBeforeLong(s.sessionsBeforeLong);
          setRemainingSec((prev) => {
            if (mode === "work") return s.workMin * 60;
            if (mode === "short_break") return s.shortBreakMin * 60;
            return s.longBreakMin * 60;
          });
        }
      } catch (e) {
        // silent
      } finally {
        didLoadSettingsRef.current = true;
        try {
          const vEnd = await AsyncStorage.getItem(STORAGE_KEY_END);
          if (vEnd) {
            const savedEnd = parseInt(vEnd, 10);
            const now = Date.now();
            if (!Number.isNaN(savedEnd) && savedEnd > now) {
              setEndTimestamp(savedEnd);
              setRunning(true);
              setIsPaused(false);
              setRemainingSec(Math.round((savedEnd - now) / 1000));
              const rem = Math.round((savedEnd - now) / 1000);
              if (rem > 0) await scheduleEndNotification(rem);
              return;
            } else {
              await AsyncStorage.removeItem(STORAGE_KEY_END);
            }
          }
          const pausedFlag = await AsyncStorage.getItem(STORAGE_KEY_PAUSED);
          const vRem = await AsyncStorage.getItem(STORAGE_KEY_REMAIN);
          if (pausedFlag === "1" && vRem) {
            const savedRem = parseInt(vRem, 10);
            if (!Number.isNaN(savedRem)) {
              setRemainingSec(savedRem);
              setIsPaused(true);
              setRunning(false);
            }
          }
        } catch {
          // silent
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleEndNotification = useCallback(async (secondsFromNow: number) => {
    try {
      if (endNotifRef.current) {
        await Notifications.cancelScheduledNotificationAsync(endNotifRef.current);
        endNotifRef.current = null;
      }
    } catch {}
    try {
      const trigger: Notifications.TimeIntervalTriggerInput = {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.floor(secondsFromNow)),
        repeats: false,
      };
      const id = await Notifications.scheduleNotificationAsync({
        content: {
            title: mode === "work" ? "Phiên làm việc đã kết thúc" : "Kết thúc thời gian nghỉ",
            body: mode === "work" ? "Nhấn để tiếp tục" : "Nhấn để bắt đầu phiên tiếp theo",
            data: { type: "session_end", mode },
            sound: "default",
        },
        trigger,
      });
      endNotifRef.current = id;
      scheduledRef.current = true;
    } catch {
      scheduledRef.current = false;
      endNotifRef.current = null;
    }
  }, [mode]);

  useEffect(() => {
    if (!didLoadSettingsRef.current) return;
    try {
      persistPomodoroSettingsSync({
        workMin,
        shortBreakMin,
        longBreakMin,
        sessionsBeforeLong,
      });
    } catch {
      // silent
    }
  }, [workMin, shortBreakMin, longBreakMin, sessionsBeforeLong]);

  const finishHandler = useCallback(async () => {
    setRunning(false);
    setEndTimestamp(null);
    try { if (Platform.OS === "android") Vibration.vibrate([0, 500, 200, 500]); else Vibration.vibrate(); } catch {}
    try {
      if (mode === "work") insertPomodoroSessionSync({ type: "work", startedAt: Date.now() - workMin * 60 * 1000, endedAt: Date.now(), completed: 1 });
      else insertPomodoroSessionSync({ type: mode, startedAt: Date.now() - shortBreakMin * 60 * 1000, endedAt: Date.now(), completed: 1 });
    } catch {
      // silent
    }
    if (mode === "work") { setMode("short_break"); setRemainingSec(shortBreakMin * 60); }
    else { setMode("work"); setRemainingSec(workMin * 60); }
    try { await AsyncStorage.multiRemove([STORAGE_KEY_END, STORAGE_KEY_REMAIN, STORAGE_KEY_PAUSED]); } catch {}
    try { if (endNotifRef.current) { await Notifications.cancelScheduledNotificationAsync(endNotifRef.current); endNotifRef.current = null; } } catch {}
    scheduledRef.current = false;
  }, [mode, workMin, shortBreakMin]);

  useEffect(() => {
    if (running) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRemainingSec((prev) => {
          if (prev <= 1) {
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            finishHandler();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [running, finishHandler]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        if (endTimestamp) {
          const rem = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000));
          setRemainingSec(rem);
          if (rem === 0) finishHandler();
        }
      }
    });
    return () => sub.remove();
  }, [endTimestamp, finishHandler]);

  const start = useCallback(async () => {
    const durationMap: Record<Mode, number> = { work: workMin, short_break: shortBreakMin, long_break: longBreakMin };
    if (durationMap[mode] <= 0 || remainingSec <= 0) return;
    const endAt = Date.now() + remainingSec * 1000;
    setEndTimestamp(endAt);
    setRunning(true);
    setIsPaused(false);
    try { await AsyncStorage.setItem(STORAGE_KEY_END, String(endAt)); await AsyncStorage.removeItem(STORAGE_KEY_REMAIN); await AsyncStorage.removeItem(STORAGE_KEY_PAUSED); } catch {}
    if (!scheduledRef.current) await scheduleEndNotification(remainingSec);
  }, [mode, workMin, shortBreakMin, longBreakMin, remainingSec, scheduleEndNotification]);

  const pause = useCallback(async () => {
    try { if (endNotifRef.current) { await Notifications.cancelScheduledNotificationAsync(endNotifRef.current); endNotifRef.current = null; } } catch {}
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
    setIsPaused(true);
    setEndTimestamp(null);
    try { await AsyncStorage.removeItem(STORAGE_KEY_END); await AsyncStorage.setItem(STORAGE_KEY_REMAIN, String(remainingSec)); await AsyncStorage.setItem(STORAGE_KEY_PAUSED, "1"); } catch {}
    scheduledRef.current = false;
  }, [remainingSec]);

  const reset = useCallback(async (clearStorage = true) => {
    try { if (endNotifRef.current) { await Notifications.cancelScheduledNotificationAsync(endNotifRef.current); endNotifRef.current = null; } } catch {}
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
    setIsPaused(false);
    setEndTimestamp(null);
    if (clearStorage) { try { await AsyncStorage.multiRemove([STORAGE_KEY_END, STORAGE_KEY_REMAIN, STORAGE_KEY_PAUSED]); } catch {} }
    if (mode === "work") setRemainingSec(workMin * 60); else if (mode === "short_break") setRemainingSec(shortBreakMin * 60); else setRemainingSec(longBreakMin * 60);
    scheduledRef.current = false;
  }, [mode, workMin, shortBreakMin, longBreakMin]);

  const setSettings = useCallback(async (s: SettingsShape) => {
    setWorkMin(s.workMin); setShortBreakMin(s.shortBreakMin); setLongBreakMin(s.longBreakMin); setSessionsBeforeLong(s.sessionsBeforeLong);
    try { persistPomodoroSettingsSync({ workMin: s.workMin, shortBreakMin: s.shortBreakMin, longBreakMin: s.longBreakMin, sessionsBeforeLong: s.sessionsBeforeLong }); } catch {}
    if (!running && !isPaused && !endTimestamp) {
      if (mode === "work") setRemainingSec(s.workMin * 60);
      else if (mode === "short_break") setRemainingSec(s.shortBreakMin * 60);
      else setRemainingSec(s.longBreakMin * 60);
    }
  }, [mode, running, isPaused, endTimestamp]);

  return {
    workMin, shortBreakMin, longBreakMin, sessionsBeforeLong,
    mode, remainingSec, running, isPaused,
    start, pause, reset, setMode,
    setWorkMin, setShortBreakMin, setLongBreakMin, setSessionsBeforeLong,
    setSettings,
    _debug: { loadPomodoroSettingsSync, persistPomodoroSettingsSync },
  };
}
