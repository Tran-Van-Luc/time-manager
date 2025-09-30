import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";

// Khởi tạo SQLite và Drizzle một lần
const sqlite = openDatabaseSync("time_manager.db");
export const db = drizzle(sqlite);

// ------------------ BẢNG USERS ------------------
db.$client.execSync(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ------------------ BẢNG TASKS ------------------
db.$client.execSync(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    start_at DATETIME,
    end_at DATETIME,
    priority TEXT,
    status TEXT,
    recurrence_id INTEGER,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ------------------ BẢNG COURSES ------------------
db.$client.execSync(`
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    instructor_name TEXT,
    location TEXT,
    color_tag TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ------------------ BẢNG SCHEDULE_ENTRIES ------------------
db.$client.execSync(`
  CREATE TABLE IF NOT EXISTS schedule_entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id     INTEGER NOT NULL,
    user_id       INTEGER NOT NULL,
    type          TEXT    NOT NULL
                  CHECK(type IN (
                    'Lịch học thường xuyên',
                    'Lịch thi',
                    'Lịch học bù',
                    'Lịch tạm ngưng'
                  )),
    start_at      DATETIME NOT NULL,
    end_at        DATETIME NOT NULL,
    recurrence_id INTEGER,
    status        TEXT    DEFAULT 'active',
    cancel_reason TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(course_id) REFERENCES courses(id),
    FOREIGN KEY(user_id)   REFERENCES users(id),
    CHECK(start_at < end_at),
    UNIQUE(user_id, course_id, start_at, end_at)
  );
`);

// Trigger ngăn chặn overlap cùng user, cùng ngày
db.$client.execSync(`
  CREATE TRIGGER IF NOT EXISTS no_overlap_schedule
  BEFORE INSERT ON schedule_entries
  BEGIN
    SELECT
      CASE
        WHEN EXISTS (
          SELECT 1 FROM schedule_entries
          WHERE user_id = NEW.user_id
            AND date(start_at) = date(NEW.start_at)
            AND NOT (
              end_at <= NEW.start_at OR
              start_at >= NEW.end_at
            )
        )
        THEN RAISE(ABORT, 'OVERLAP')
      END;
  END;
`);

// ------------------ BẢNG CALENDAR_EVENTS ------------------
db.$client.execSync(`
  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    start_at DATETIME NOT NULL,
    end_at DATETIME NOT NULL,
    source_type TEXT NOT NULL, -- 'task' hoặc 'schedule_entry'
    source_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ------------------ BẢNG CANCELLED_EVENTS ------------------
db.$client.execSync(`
  CREATE TABLE IF NOT EXISTS cancelled_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_event_id INTEGER NOT NULL,
    canceled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    cancel_reason TEXT,
    source_type TEXT CHECK(source_type IN ('task','schedule_entry')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id)
  );
`);

// ------------------ BẢNG REMINDERS ------------------
db.$client.execSync(`
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    calendar_event_id INTEGER,
    remind_before INTEGER, -- phút nhắc trước
    method TEXT DEFAULT 'notification',
    repeat_count INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id)
  );
`);

// ------------------ BẢNG RECURRENCES ------------------
db.$client.execSync(`
  CREATE TABLE IF NOT EXISTS recurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,              -- daily, weekly, monthly
    interval INTEGER DEFAULT 1,
    days_of_week TEXT,      -- JSON string: ["Mon","Wed"]
    day_of_month TEXT,
    start_date DATETIME,
    end_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ------------------ BẢNG POMODORO ------------------
db.$client.execSync(`
  CREATE TABLE IF NOT EXISTS pomodoro_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    work_minutes INTEGER NOT NULL DEFAULT 25,
    short_break_minutes INTEGER NOT NULL DEFAULT 5,
    long_break_minutes INTEGER NOT NULL DEFAULT 15,
    sessions_before_long_break INTEGER NOT NULL DEFAULT 4,
    mute_notifications INTEGER NOT NULL DEFAULT 1, -- 1 = khi bật Pomodoro ứng dụng tắt noti
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(user_id)
  );
`);

db.$client.execSync(`
  CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('work','short_break','long_break')),
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    completed INTEGER DEFAULT 0, -- 0 = không hoàn thành, 1 = hoàn thành
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);
console.log("✅ Database initialized with all tables!");

// Hàm initDatabase trả về DB đã khởi tạo
export function initDatabase() {
  return db;
}
