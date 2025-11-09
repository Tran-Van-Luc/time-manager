import { db } from "./database";
import { courses, schedule_entries } from "./schema";
import { eq, and, lt, gt, or } from "drizzle-orm";

export type ScheduleType =
  | "Lịch học lý thuyết"
  | "Lịch học thực hành"
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

// ✅ CHỈ TẠO hoặc TÌM course - KHÔNG CẬP NHẬT
async function findOrCreateCourse(name: string) {
  const found = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.name, name))
    .get();

  if (found) {
    return found.id;  // ✅ CHỈ TRẢ VỀ ID, KHÔNG UPDATE
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
      instructor_name: null, // ✅ Không lưu ở đây nữa
      location:        null, // ✅ Không lưu ở đây nữa
      color_tag:       null,
    })
    .returning({ id: courses.id })
    .get();

  return inserted.id;
}

// Kiểm tra xung đột
async function checkOverlap(userId: number, start: Date, end: Date) {
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

function isRecurringType(t: ScheduleType) {
  return t === "Lịch học lý thuyết" || t === "Lịch học thực hành";
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

  // ✅ CHỈ TÌM hoặc TẠO course, không update
  const courseId = await findOrCreateCourse(courseName);

  const slots: Array<{ start: Date; end: Date; insertType?: ScheduleType }> = [];
  
  if (isRecurringType(type)) {
    const S = new Date(`${startDate}T00:00:00`);
    const E = new Date(`${endDate}T00:00:00`);
    while (S <= E) {
      const [hS, mS] = startTime.split(":").map(Number);
      const [hE, mE] = endTime.split(":").map(Number);
      const s = new Date(S); s.setHours(hS, mS, 0, 0);
      const e = new Date(S); e.setHours(hE, mE, 0, 0);
      slots.push({ start: s, end: e, insertType: type });
      S.setDate(S.getDate() + 7);
    }
  } else if (type === "Lịch tạm ngưng") {
    const day = singleDate!;
    const s = new Date(`${day}T${startTime}:00`);
    const e = new Date(`${day}T${endTime}:00`);
    slots.push({ start: s, end: e, insertType: "Lịch tạm ngưng" });

    const regulars = await db
      .select({
        id: schedule_entries.id,
        start_at: schedule_entries.start_at,
        end_at: schedule_entries.end_at,
        type: schedule_entries.type,
      })
      .from(schedule_entries)
      .where(
        and(
          eq(schedule_entries.course_id, courseId),
          or(
            eq(schedule_entries.type, "Lịch học lý thuyết"),
            eq(schedule_entries.type, "Lịch học thực hành")
          )
        )
      )
      .all();

    const [hS, mS] = [s.getHours(), s.getMinutes()];
    const [hE, mE] = [e.getHours(), e.getMinutes()];
    const targetDay = s.getDay();

    const futureRegulars = regulars
      .map(r => ({
        ...r,
        start: new Date(r.start_at),
        end: new Date(r.end_at),
      }))
      .filter(r =>
        r.start > s &&
        r.start.getDay() === targetDay &&
        r.start.getHours() === hS &&
        r.start.getMinutes() === mS &&
        r.end.getHours() === hE &&
        r.end.getMinutes() === mE
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    let insertAfter: Date;
    if (futureRegulars.length > 0) {
      insertAfter = futureRegulars[futureRegulars.length - 1].start;
    } else {
      insertAfter = s;
    }
    const s2 = new Date(insertAfter);
    s2.setDate(s2.getDate() + 7);
    s2.setHours(hS, mS, 0, 0);
    const e2 = new Date(insertAfter);
    e2.setDate(e2.getDate() + 7);
    e2.setHours(hE, mE, 0, 0);

    const conflict = await checkOverlap(userId, s2, e2);
    if (!conflict) {
      const insertType: ScheduleType =
        futureRegulars.length > 0 && (futureRegulars[0].type === "Lịch học thực hành")
          ? "Lịch học thực hành"
          : "Lịch học lý thuyết";
      slots.push({ start: s2, end: e2, insertType });
    }
  } else {
    const day = singleDate!;
    const s = new Date(`${day}T${startTime}:00`);
    const e = new Date(`${day}T${endTime}:00`);
    slots.push({ start: s, end: e, insertType: type });
  }

  let sessionsCreated = 0;
  for (const { start, end, insertType } of slots) {
    const conflict = await checkOverlap(userId, start, end);
    if (conflict) {
      if (insertType !== type) {
        continue;
      }
      throw new Error(
        `Trùng lịch với "${conflict.subject}" từ ` +
        `${new Date(conflict.existingStart).toLocaleTimeString()} đến ` +
        `${new Date(conflict.existingEnd).toLocaleTimeString()}`
      );
    }

    try {
      // ✅ LƯU instructor và location vào schedule_entries
      await db.insert(schedule_entries).values({
        course_id:       courseId,
        user_id:         userId,
        type:            insertType ?? type,
        start_at:        start,
        end_at:          end,
        instructor_name: instructorName ?? null, // ✅ LƯU RIÊNG CHO ENTRY NÀY
        location:        location ?? null,       // ✅ LƯU RIÊNG CHO ENTRY NÀY
        recurrence_id:   isRecurringType(insertType ?? type) ? Date.now() : null,
        status:          "active",
        cancel_reason:   null,
        created_at:      new Date(),
      }).run();
    } catch (e: any) {
      if (insertType !== type && e.message && e.message.includes("OVERLAP")) {
        continue;
      }
      if (e.message && e.message.includes("OVERLAP")) {
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
      c.name                AS subject,
      se.instructor_name,   -- ✅ LẤY TỪ schedule_entries
      se.location,          -- ✅ LẤY TỪ schedule_entries
      se.type,
      se.start_at           AS start_at,
      se.end_at             AS end_at
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
    instructor_name:  r.instructor_name,  // ✅ TỪ schedule_entries
    location:         r.location,         // ✅ TỪ schedule_entries
    type:             r.type,
    start_at:         toISO(r.start_at),
    end_at:           toISO(r.end_at),
  }));
}
