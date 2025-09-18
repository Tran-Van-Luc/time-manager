// database/schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Bảng users
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  avatar_url: text("avatar_url"),
  created_at: integer("created_at", { mode: "timestamp" }).default(new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" }).default(new Date()),
});

// Bảng tasks
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: integer("user_id"),
  title: text("title").notNull(),
  description: text("description"),
  start_at: integer("start_at", { mode: "timestamp" }),
  end_at: integer("end_at", { mode: "timestamp" }),
  priority: text("priority"),
  status: text("status"),
  recurrence_id: integer("recurrence_id"),
  is_deleted: integer("is_deleted").default(0),
  created_at: integer("created_at", { mode: "timestamp" }).default(new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" }).default(new Date()),
});

// Bảng courses
export const courses = sqliteTable("courses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  instructor_name: text("instructor_name"),
  location: text("location"),
  color_tag: text("color_tag"),
  created_at: integer("created_at", { mode: "timestamp" }).default(new Date()),
});

// Bảng schedule_entries
export const schedule_entries = sqliteTable("schedule_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  course_id: integer("course_id"),
  user_id: integer("user_id"),
  type: text("type"),
  start_at: integer("start_at", { mode: "timestamp" }).notNull(),
  end_at: integer("end_at", { mode: "timestamp" }).notNull(),
  recurrence_id: integer("recurrence_id"),
  status: text("status").default("active"),
  cancel_reason: text("cancel_reason"),
  created_at: integer("created_at", { mode: "timestamp" }).default(new Date()),
});

// Bảng calendar_events
export const calendar_events = sqliteTable("calendar_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  start_at: integer("start_at", { mode: "timestamp" }).notNull(),
  end_at: integer("end_at", { mode: "timestamp" }).notNull(),
  source_type: text("source_type").notNull(),
  source_id: integer("source_id"),
  created_at: integer("created_at", { mode: "timestamp" }).default(new Date()),
});

// Bảng cancelled_events
export const cancelled_events = sqliteTable("cancelled_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  calendar_event_id: integer("calendar_event_id").notNull(),
  canceled_at: integer("canceled_at", { mode: "timestamp" }).default(new Date()),
  cancel_reason: text("cancel_reason"),
  source_type: text("source_type"),
  created_at: integer("created_at", { mode: "timestamp" }).default(new Date()),
});

// Bảng reminders
export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  task_id: integer("task_id"),               // FK -> tasks.id
  calendar_event_id: integer("calendar_event_id"), // FK -> calendar_events.id
  remind_before: integer("remind_before"),   // số phút nhắc trước
  method: text("method").default("notification"), // phương thức (noti/email/…)
  repeat_count: integer("repeat_count"),     // số lần lặp lại nhắc
  is_active: integer("is_active").default(1), // 0 = off, 1 = on
  created_at: integer("created_at", { mode: "timestamp" }).default(new Date()),
});

// Bảng recurrences
export const recurrences = sqliteTable("recurrences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type"),        // daily, weekly, monthly, yearly
  interval: integer("interval").default(1), // khoảng cách, ví dụ mỗi 2 ngày
  days_of_week: text("days_of_week"),       // JSON string: ["Mon","Wed"]
  day_of_month: text("day_of_month"),
  start_date: integer("start_date", { mode: "timestamp" }),
  end_date: integer("end_date", { mode: "timestamp" }),
  created_at: integer("created_at", { mode: "timestamp" }).default(new Date()),
});
