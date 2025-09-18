// taskService.ts
import { db } from "./database";
import { tasks } from "./schema";
import { eq } from "drizzle-orm";

// Create task
// Create task
export async function createTask(data: {
  user_id?: number;
  title: string;
  description?: string;
  start_at?: Date;
  end_at?: Date;
  priority?: string;
  status?: string;
  recurrence_id?: number;
}) {
  const result = await db
    .insert(tasks)
    .values({
      ...data,
      start_at: data.start_at ? new Date(data.start_at) : undefined,
      end_at: data.end_at ? new Date(data.end_at) : undefined,
      is_deleted: 0,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning({ id: tasks.id }) 
    .get();

  return result?.id; 
}


// Get all tasks
export async function getAllTasks() {
  return db.select().from(tasks).all();
}

// Get task by id
export async function getTaskById(id: number) {
  return db.select().from(tasks).where(eq(tasks.id, id)).get();
}

// Get tasks by user
export async function getTasksByUser(userId: number) {
  return db.select().from(tasks).where(eq(tasks.user_id, userId)).all();
}

// Update task
export async function updateTask(id: number, data: {
  title?: string;
  description?: string;
  start_at?: Date;
  end_at?: Date;
  priority?: string;
  status?: string;
  recurrence_id?: number;
  is_deleted?: number;
}) {
  return db.update(tasks)
    .set({
      ...data,
      start_at: data.start_at ? new Date(data.start_at) : undefined,
      end_at: data.end_at ? new Date(data.end_at) : undefined,
      updated_at: new Date(),
    })
    .where(eq(tasks.id, id))
    .run();
}

// Soft delete task (đặt is_deleted = 1)
export async function softDeleteTask(id: number) {
  return db.update(tasks)
    .set({ is_deleted: 1, updated_at: new Date() })
    .where(eq(tasks.id, id))
    .run();
}

// Hard delete task
export async function deleteTask(id: number) {
  return db.delete(tasks).where(eq(tasks.id, id)).run();
}
