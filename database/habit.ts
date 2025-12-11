// database/habit.ts
import { db } from "./database";
import { habit_completions } from "./schema";
import { eq } from "drizzle-orm";
import type { HabitTimes } from "../utils/habits";

/**
 * Lấy tất cả các ngày hoàn thành và thời gian hoàn thành cho một habit.
 */
export async function getHabitData(recurrenceId: number): Promise<{ completions: Set<string>, times: HabitTimes }> {
  const results = await db
    .select()
    .from(habit_completions)
    .where(eq(habit_completions.recurrence_id, recurrenceId));

  const completions = new Set<string>();
  const times: HabitTimes = {};

  for (const row of results) {
    completions.add(row.completion_date);
    // Ensure the timestamp is a number (ms); if it's a Date convert to milliseconds.
    const ts = row.completion_timestamp instanceof Date ? row.completion_timestamp.getTime() : (row.completion_timestamp as number);
    times[row.completion_date] = ts;
  }

  return { completions, times };
}

/**
 * Ghi đè tất cả dữ liệu hoàn thành cho một habit.
 */
export async function setHabitData(
  recurrenceId: number,
  completions: Set<string>,
  times: HabitTimes
) {
    await db.transaction(async (tx) => {
        await tx.delete(habit_completions).where(eq(habit_completions.recurrence_id, recurrenceId));

        const valuesToInsert = Array.from(completions).map(date => {
            const ts = times[date] ?? Date.now();
            return {
                recurrence_id: recurrenceId,
                completion_date: date,
                // Convert numeric timestamp to Date so it matches Drizzle's expected type
                completion_timestamp: new Date(ts),
            };
        });

        if (valuesToInsert.length > 0) {
            await tx.insert(habit_completions).values(valuesToInsert);
        }
    });
}