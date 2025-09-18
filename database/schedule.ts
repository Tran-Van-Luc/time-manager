// database/schedule.ts
import { db } from "./database";
import { courses, schedule_entries } from "./schema";
import { eq, and, lt, gt } from "drizzle-orm";

export type ScheduleType =
  | "Lịch học thường xuyên"
  | "Lịch thi"
  | "Lịch học bù"
  | "Lịch tạm ngưng";

export interface CreateScheduleParams {
  courseName:     string;
  instructorName?: string;
  location?:       string;
  type:            ScheduleType;
  startDate?:      string; // YYYY-MM-DD
  endDate?:        string; // YYYY-MM-DD
  singleDate?:     string; // YYYY-MM-DD
  startTime:       string; // HH:mm
  endTime:         string; // HH:mm
  userId?:         number;
}

// Tạo hoặc cập nhật course
async function findOrCreateCourse(
  name: string,
  instructor?: string,
  location?: string
) {
  const found = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.name, name))
    .get();

  if (found) {
    await db
      .update(courses)
      .set({ instructor_name: instructor ?? null, location: location ?? null })
      .where(eq(courses.id, found.id))
      .run();
    return found.id;
  }

  const code = name
    .trim()
    .split(/\s+/)
    .map(w => w[0].toUpperCase())
    .join("")
    .slice(0, 6) || `UNK${Date.now().toString().slice(-4)}`;

  const inserted = await db
    .insert(courses)
    .values({
      code,
      name,
      instructor_name: instructor ?? null,
      location:        location ?? null,
      color_tag:       null,
    })
    .returning({ id: courses.id })
    .get();

  return inserted.id;
}

// Kiểm tra xung đột để trả về thông báo chi tiết
async function checkOverlap(
  userId: number,
  start:  Date,
  end:    Date
) {
  return db
    .select({
      subject:       courses.name,
      existingStart: schedule_entries.start_at,
      existingEnd:   schedule_entries.end_at,
    })
    .from(schedule_entries)
    .leftJoin(courses, eq(courses.id, schedule_entries.course_id))
    .where(
      and(
        eq(schedule_entries.user_id, userId),
        lt(schedule_entries.start_at, end),
        gt(schedule_entries.end_at, start)
      )
    )
    .get();
}

export async function createSchedule(
  params: CreateScheduleParams
): Promise<{ courseId: number; sessionsCreated: number }> {
  const {
    courseName,
    instructorName,
    location,
    type,
    startDate,
    endDate,
    singleDate,
    startTime,
    endTime,
    userId = 0,
  } = params;

  const courseId = await findOrCreateCourse(
    courseName,
    instructorName,
    location
  );

  // Tập hợp tất cả sessions cần tạo
  const slots: Array<{ start: Date; end: Date }> = [];
  if (type === "Lịch học thường xuyên") {
    const S = new Date(`${startDate}T00:00:00`);
    const E = new Date(`${endDate}T00:00:00`);
    while (S <= E) {
      const [hS, mS] = startTime.split(":").map(Number);
      const [hE, mE] = endTime.split(":").map(Number);
      const s = new Date(S); s.setHours(hS, mS, 0, 0);
      const e = new Date(S); e.setHours(hE, mE, 0, 0);
      slots.push({ start: s, end: e });
      S.setDate(S.getDate() + 7);
    }
  } else {
    const day = singleDate!;
    const s = new Date(`${day}T${startTime}:00`);
    const e = new Date(`${day}T${endTime}:00`);
    slots.push({ start: s, end: e });
  }

  let sessionsCreated = 0;
  for (const { start, end } of slots) {
    // 1) Kiểm tra xung đột chi tiết
    const conflict = await checkOverlap(userId, start, end);
    if (conflict) {
      throw new Error(
        `Xung đột với "${conflict.subject}" từ ` +
        `${new Date(conflict.existingStart).toLocaleTimeString()} đến ` +
        `${new Date(conflict.existingEnd).toLocaleTimeString()}`
      );
    }

    // 2) Thực thi insert — trigger `no_overlap_schedule` sẽ abort nếu vẫn overlap
    try {
      await db.insert(schedule_entries).values({
        course_id:     courseId,
        user_id:       userId,
        type,
        start_at:      start,
        end_at:        end,
        recurrence_id: type === "Lịch học thường xuyên" ? Date.now() : null,
        status:        "active",
        cancel_reason: null,
        created_at:    new Date(),
      }).run();
    } catch (e: any) {
      if (e.message.includes("OVERLAP")) {
        throw new Error("Xung đột khung giờ (trigger phát hiện)");
      }
      throw e;
    }

    sessionsCreated++;
  }

  return { courseId, sessionsCreated };
}


export interface ScheduleRow {
  id: number;
  subject: string | null;
  instructor_name: string | null;
  location: string | null;
  type: string | null;
  start_at: string;
  end_at: string;
}

export function getAllSchedulesSync(): ScheduleRow[] {
  const raw = db.$client.getAllSync(`
    SELECT
      se.id,
      c.name            AS subject,
      c.instructor_name,
      c.location,
      se.type,
      se.start_at       AS start_at,
      se.end_at         AS end_at
    FROM schedule_entries se
    LEFT JOIN courses c ON se.course_id = c.id
    ORDER BY se.start_at ASC;
  `);

  const toISO = (v: any) => {
    if (typeof v === "number") {
      const ms = v < 1e12 ? v * 1000 : v;
      return new Date(ms).toISOString();
    }
    if (typeof v === "string") {
      if (/^\d+$/.test(v)) {
        const n = parseInt(v, 10);
        const ms = n < 1e12 ? n * 1000 : n;
        return new Date(ms).toISOString();
      }
      return v.replace(" ", "T");
    }
    return new Date(v).toISOString();
  };

  return raw.map((r: any) => ({
    id:               r.id,
    subject:          r.subject,
    instructor_name:  r.instructor_name,
    location:         r.location,
    type:             r.type,
    start_at:         toISO(r.start_at),
    end_at:           toISO(r.end_at),
  }));
}
