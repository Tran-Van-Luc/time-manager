import { db } from './database';
import { scheduled_notifications } from './schema';
import { eq, and } from 'drizzle-orm';

export interface ScheduledNotificationRecord {
  id?: number;
  task_id?: number;
  reminder_id?: number;
  recurrence_id?: number;
  occurrence_start_at?: number; // ms epoch
  occurrence_end_at?: number;   // ms epoch
  schedule_time?: number;       // ms epoch
  notification_id?: string;     // expo id
  lead_minutes?: number;
  status?: string;              // scheduled | fired | cancelled
  created_at?: number;
}

// Insert one record, return id
export async function createScheduledNotification(data: Omit<ScheduledNotificationRecord, 'id' | 'created_at'>) {
  const result = await db.insert(scheduled_notifications).values({
    ...data,
    occurrence_start_at: data.occurrence_start_at ? new Date(data.occurrence_start_at) : undefined,
    occurrence_end_at: data.occurrence_end_at ? new Date(data.occurrence_end_at) : undefined,
    schedule_time: data.schedule_time ? new Date(data.schedule_time) : undefined,
    created_at: new Date(),
  }).returning({ id: scheduled_notifications.id });
  return result[0].id;
}

export async function bulkInsertScheduledNotifications(rows: Omit<ScheduledNotificationRecord, 'id' | 'created_at'>[]) {
  if (!rows.length) return [] as number[];
  const mapped = rows.map(r => ({
    ...r,
    occurrence_start_at: r.occurrence_start_at ? new Date(r.occurrence_start_at) : undefined,
    occurrence_end_at: r.occurrence_end_at ? new Date(r.occurrence_end_at) : undefined,
    schedule_time: r.schedule_time ? new Date(r.schedule_time) : undefined,
    created_at: new Date(),
  }));
  const inserted = await db.insert(scheduled_notifications).values(mapped).returning({ id: scheduled_notifications.id });
  return inserted.map(r => r.id);
}

export async function getAllScheduledNotifications() {
  return db.select().from(scheduled_notifications).all();
}

export async function deleteAllScheduledNotifications() {
  return db.delete(scheduled_notifications).run();
}

export async function deleteScheduledByTask(taskId: number) {
  return db.delete(scheduled_notifications).where(eq(scheduled_notifications.task_id, taskId)).run();
}

export async function markNotificationFired(notificationId: string) {
  return db.update(scheduled_notifications)
    .set({ status: 'fired' })
    .where(eq(scheduled_notifications.notification_id, notificationId))
    .run();
}

export async function cancelScheduledNotification(notificationId: string) {
  return db.update(scheduled_notifications)
    .set({ status: 'cancelled' })
    .where(eq(scheduled_notifications.notification_id, notificationId))
    .run();
}

export async function getUpcomingScheduled(nowMs: number) {
  return db.select().from(scheduled_notifications)
    .where(and(
      eq(scheduled_notifications.status, 'scheduled')
    ))
    .all();
}
