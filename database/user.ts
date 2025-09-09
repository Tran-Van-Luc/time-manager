import { db } from "./database";
import { users } from "./schema";
import { eq } from "drizzle-orm";

// Create user
export async function createUser(name: string, avatar_url?: string) {
  return db.insert(users).values({
    name,
    avatar_url,
    created_at: new Date(),
    updated_at: new Date(),
  }).run();
}

// Get all users
export async function getAllUsers() {
  return db.select().from(users).all();
}

// Get user by id
export async function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

// Update user
export async function updateUser(id: number, data: { name?: string; avatar_url?: string }) {
  return db.update(users)
    .set({ ...data, updated_at: new Date() })
    .where(eq(users.id, id))
    .run();
}

// Delete user
export async function deleteUser(id: number) {
  return db.delete(users).where(eq(users.id, id)).run();
}
