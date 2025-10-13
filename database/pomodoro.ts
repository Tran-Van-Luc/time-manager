// database/pomodoro.ts
import { db } from "./database";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PomodoroSettings = {
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  sessionsBeforeLong: number;
  muteNotifications?: number;
};

const LOCAL_USER_ID = 1;
const CACHE_KEY = "@pomodoro_settings_cache";

function safeInt(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && !Number.isNaN(n) ? Math.floor(n) : fallback;
}

export function loadPomodoroSettingsSync(): PomodoroSettings {
  try {
    const sql = `
      SELECT work_minutes, short_break_minutes, long_break_minutes, sessions_before_long_break, mute_notifications
      FROM pomodoro_settings
      WHERE user_id = ${LOCAL_USER_ID}
      LIMIT 1;
    `;
    const res = db.$client.execSync(sql);
    if (res && Array.isArray(res) && res.length > 0) {
      const first = res[0];
      const rows = first.values ?? first.rows ?? [];
      if (Array.isArray(rows) && rows.length > 0) {
        const r = rows[0];
        return {
          workMin: safeInt(r[0], 25),
          shortBreakMin: safeInt(r[1], 5),
          longBreakMin: safeInt(r[2], 15),
          sessionsBeforeLong: safeInt(r[3], 4),
          muteNotifications: safeInt(r[4], 1),
        };
      }
    }
  } catch (e) {
    // silent fail -> fallback to defaults / async fallback in hook
  }
  return { workMin: 25, shortBreakMin: 5, longBreakMin: 15, sessionsBeforeLong: 4, muteNotifications: 1 };
}

export async function loadPomodoroSettingsFallbackAsync(): Promise<PomodoroSettings> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        workMin: safeInt(parsed.workMin, 25),
        shortBreakMin: safeInt(parsed.shortBreakMin, 5),
        longBreakMin: safeInt(parsed.longBreakMin, 15),
        sessionsBeforeLong: safeInt(parsed.sessionsBeforeLong, 4),
        muteNotifications: safeInt(parsed.muteNotifications, 1),
      };
    }
  } catch (e) {
    // silent
  }
  return { workMin: 25, shortBreakMin: 5, longBreakMin: 15, sessionsBeforeLong: 4, muteNotifications: 1 };
}

export function persistPomodoroSettingsSync(s: PomodoroSettings) {
  const work = Math.max(1, Math.floor(s.workMin));
  const shortB = Math.max(1, Math.floor(s.shortBreakMin));
  const longB = Math.max(1, Math.floor(s.longBreakMin));
  const sess = Math.max(1, Math.floor(s.sessionsBeforeLong));
  const mute = s.muteNotifications ? Math.floor(s.muteNotifications) : 1;

  const upsertSql = `
    INSERT INTO pomodoro_settings
      (user_id, work_minutes, short_break_minutes, long_break_minutes, sessions_before_long_break, mute_notifications, created_at, updated_at)
    VALUES
      (${LOCAL_USER_ID}, ${work}, ${shortB}, ${longB}, ${sess}, ${mute}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      work_minutes = excluded.work_minutes,
      short_break_minutes = excluded.short_break_minutes,
      long_break_minutes = excluded.long_break_minutes,
      sessions_before_long_break = excluded.sessions_before_long_break,
      mute_notifications = excluded.mute_notifications,
      updated_at = CURRENT_TIMESTAMP;
  `;
  try {
    db.$client.execSync(upsertSql);
  } catch (e) {
    try {
      const replaceSql = `
        INSERT OR REPLACE INTO pomodoro_settings
          (id, user_id, work_minutes, short_break_minutes, long_break_minutes, sessions_before_long_break, mute_notifications, created_at, updated_at)
        VALUES (
          (SELECT id FROM pomodoro_settings WHERE user_id = ${LOCAL_USER_ID}),
          ${LOCAL_USER_ID}, ${work}, ${shortB}, ${longB}, ${sess}, ${mute}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );
      `;
      db.$client.execSync(replaceSql);
    } catch (err) {
      // silent
    }
  }

  try {
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ workMin: work, shortBreakMin: shortB, longBreakMin: longB, sessionsBeforeLong: sess, muteNotifications: mute }));
  } catch (e) {
    // silent
  }
}

export function insertPomodoroSessionSync(params: { userId?: number; type: "work" | "short_break" | "long_break"; startedAt: number; endedAt?: number | null; completed?: number }) {
  const userId = params.userId ?? LOCAL_USER_ID;
  const started = Math.floor(params.startedAt);
  const ended = params.endedAt ? Math.floor(params.endedAt) : null;
  const completed = params.completed ? Math.floor(params.completed) : 0;

  const sql = `
    INSERT INTO pomodoro_sessions (user_id, type, started_at, ended_at, completed, created_at)
    VALUES (${userId}, '${params.type}', ${started}, ${ended === null ? "NULL" : ended}, ${completed}, CURRENT_TIMESTAMP);
  `;
  try {
    db.$client.execSync(sql);
  } catch (e) {
    // silent
  }
}

export function debugAllPomodoroSettings() {
  try {
    const sql = `SELECT id, user_id, work_minutes, short_break_minutes, long_break_minutes, sessions_before_long_break, mute_notifications FROM pomodoro_settings;`;
    return db.$client.execSync(sql);
  } catch (e) {
    return null;
  }
}
