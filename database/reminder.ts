import { db } from "./database";
import { reminders } from "./schema";
import { eq } from "drizzle-orm";

// Create reminder
export async function createReminder(data: {
	task_id?: number;
	calendar_event_id?: number;
	remind_before?: number;
	method?: string;
	repeat_count?: number;
	is_active?: number;
}) {
	return db.insert(reminders).values({
		...data,
		created_at: new Date(),
	}).run();
}

// Get all reminders
export async function getAllReminders() {
	return db.select().from(reminders).all();
}

// Get reminder by id
export async function getReminderById(id: number) {
	return db.select().from(reminders).where(eq(reminders.id, id)).get();
}

// Get reminders by task
export async function getRemindersByTask(taskId: number) {
	return db.select().from(reminders).where(eq(reminders.task_id, taskId)).all();
}

// Update reminder
export async function updateReminder(id: number, data: {
	remind_before?: number;
	method?: string;
	repeat_count?: number;
	is_active?: number;
}) {
	return db.update(reminders)
		.set({ ...data })
		.where(eq(reminders.id, id))
		.run();
}

// Delete reminder
export async function deleteReminder(id: number) {
	return db.delete(reminders).where(eq(reminders.id, id)).run();
}
