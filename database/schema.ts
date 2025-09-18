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
