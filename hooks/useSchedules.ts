// hooks/useSchedules.ts
import { useState, useCallback } from "react";
import { eq } from "drizzle-orm";
import { db } from "../database/database";
import {
  createSchedule,
  getAllSchedulesSync,
  CreateScheduleParams,
} from "../database/schedule";
import { schedule_entries, courses } from "../database/schema";

export interface ScheduleItem {
  id: number;
  subject: string;
  instructorName: string | null;
  location: string | null;
  type: string;
  startAt: Date;
  endAt: Date;
}

export function useSchedules() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading]     = useState(false);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const rows = getAllSchedulesSync();
      setSchedules(
        rows.map(r => ({
          id:             r.id,
          subject:        r.subject ?? "",
          instructorName: r.instructor_name ?? null,
          location:       r.location ?? null,
          type:           r.type ?? "",
          startAt:        new Date(r.start_at),
          endAt:          new Date(r.end_at),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const addSchedule = useCallback(
    async (params: CreateScheduleParams) => {
      setLoading(true);
      try {
        const count = await createSchedule(params);
        await loadSchedules();
        return count;
      } finally {
        setLoading(false);
      }
    },
    [loadSchedules]
  );

  const deleteSchedule = useCallback(
    async (id: number) => {
      setLoading(true);
      try {
        await db
          .delete(schedule_entries)
          .where(eq(schedule_entries.id, id))
          .run();
        await loadSchedules();
      } finally {
        setLoading(false);
      }
    },
    [loadSchedules]
  );

  const deleteAllByCourse = useCallback(
    async (subject: string) => {
      setLoading(true);
      try {
        // tìm course_id tương ứng
        const found = await db
          .select({ id: courses.id })
          .from(courses)
          .where(eq(courses.name, subject))
          .get();
        if (found) {
          await db
            .delete(schedule_entries)
            .where(eq(schedule_entries.course_id, found.id))
            .run();
          await loadSchedules();
        }
      } finally {
        setLoading(false);
      }
    },
    [loadSchedules]
  );

  const updateSchedule = useCallback(
    async (id: number, params: CreateScheduleParams) => {
      setLoading(true);
      try {
        // 1) find or create course row
        let courseId: number;
        const trimmedName = params.courseName.trim();
        const found = await db
          .select({ id: courses.id })
          .from(courses)
          .where(eq(courses.name, trimmedName))
          .get();

        if (found) {
          courseId = found.id;
          await db
            .update(courses)
            .set({
              instructor_name: params.instructorName ?? null,
              location:        params.location       ?? null,
            })
            .where(eq(courses.id, courseId))
            .run();
        } else {
          const code = trimmedName
            .split(/\s+/)
            .map(w => w[0].toUpperCase())
            .join("")
            .slice(0, 6)
            || `UNK${Date.now().toString().slice(-4)}`;

          const ins = await db
            .insert(courses)
            .values({
              code,
              name:            trimmedName,
              instructor_name: params.instructorName ?? null,
              location:        params.location       ?? null,
              color_tag:       null,
            })
            .returning({ id: courses.id })
            .get();
          courseId = ins.id;
        }

        // 2) compute new start/end
        const baseDate = params.singleDate ?? params.startDate!;
        const s = new Date(`${baseDate}T${params.startTime}:00`);
        const e = new Date(`${baseDate}T${params.endTime}:00`);

        // 3) update entry
        await db
          .update(schedule_entries)
          .set({
            course_id: courseId,
            type:      params.type,
            start_at:  s,
            end_at:    e,
          })
          .where(eq(schedule_entries.id, id))
          .run();

        await loadSchedules();
      } finally {
        setLoading(false);
      }
    },
    [loadSchedules]
  );

  return {
    schedules,
    loading,
    loadSchedules,
    addSchedule,
    deleteSchedule,
    deleteAllByCourse,
    updateSchedule,
  };
}
