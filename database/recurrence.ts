import { db } from "./database";
import { recurrences } from "./schema";
import { eq } from "drizzle-orm";

// Create recurrence
export async function createRecurrence(data: {
  type?: string;
  interval?: number;
  days_of_week?: string;
  day_of_month?: string;
  start_date?: number;
  end_date?: number;
}) {
  const result = await db.insert(recurrences).values({
    ...data,
    start_date: data.start_date !== undefined ? new Date(data.start_date) : undefined,
    end_date: data.end_date !== undefined ? new Date(data.end_date) : undefined,
    created_at: new Date(),
  }).returning({ id: recurrences.id });

  return result[0].id;
}


// Get all recurrences
export async function getAllRecurrences() {
	return db.select().from(recurrences).all();
}

// Get recurrence by id
export async function getRecurrenceById(id: number) {
	return db.select().from(recurrences).where(eq(recurrences.id, id)).get();
}

// Update recurrence
export async function updateRecurrence(id: number, data: {
	type?: string;
	interval?: number;
	days_of_week?: string;
	day_of_month?: string;
	start_date?: number;
	end_date?: number;
}) {
	return db.update(recurrences)
		.set({
			...data,
			start_date: data.start_date !== undefined ? new Date(data.start_date) : undefined,
			end_date: data.end_date !== undefined ? new Date(data.end_date) : undefined,
		})
		.where(eq(recurrences.id, id))
		.run();
}

// Delete recurrence
export async function deleteRecurrence(id: number) {
	return db.delete(recurrences).where(eq(recurrences.id, id)).run();
}
