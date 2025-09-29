// Type cho Course
export interface Course {
  id?: number;
  code: string;
  name: string;
  instructor_name?: string;
  location?: string;
  color_tag?: string;
  created_at?: Date;
}

// Type cho Schedule Entry
export interface ScheduleEntry {
  id?: number;
  course_id: number;
  user_id: number;
  type: 'Lịch học thường xuyên' | 'Lịch thi' | 'Lịch học bù' | 'Lịch tạm ngưng';
  start_at: Date | string;
  end_at: Date | string;
  recurrence_id?: number;
  status?: string;
  cancel_reason?: string;
  created_at?: Date;
}

// Type cho Schedule (kết hợp ScheduleEntry + Course info)
export interface Schedule {
  id?: number;
  course_id: number;
  user_id: number;
  type: 'Lịch học thường xuyên' | 'Lịch thi' | 'Lịch học bù' | 'Lịch tạm ngưng';
  start_at: Date | string;
  end_at: Date | string;
  recurrence_id?: number;
  status?: string;
  cancel_reason?: string;
  created_at?: Date;
  
  // Thông tin course được join
  course_code?: string;
  course_name?: string;
  instructor_name?: string;
  location?: string;
  color_tag?: string;
  
  // Computed properties
  startAt: Date; // Alias cho start_at dạng Date
  endAt: Date;   // Alias cho end_at dạng Date
  subject?: string; // Alias cho course_name
}

// Type cho việc tạo schedule mới
export interface CreateScheduleRequest {
  course_id: number;
  user_id: number;
  type: 'Lịch học thường xuyên' | 'Lịch thi' | 'Lịch học bù' | 'Lịch tạm ngưng';
  start_at: Date | string;
  end_at: Date | string;
  recurrence_id?: number;
  status?: string;
}

// Type cho việc cập nhật schedule
export interface UpdateScheduleRequest {
  course_id?: number;
  type?: 'Lịch học thường xuyên' | 'Lịch thi' | 'Lịch học bù' | 'Lịch tạm ngưng';
  start_at?: Date | string;
  end_at?: Date | string;
  recurrence_id?: number;
  status?: string;
  cancel_reason?: string;
}

// Type cho lọc schedule
export interface ScheduleFilter {
  user_id?: number;
  course_id?: number;
  type?: string;
  status?: string;
  start_date?: Date;
  end_date?: Date;
}

// Enum cho schedule types
export enum ScheduleType {
  REGULAR = 'Lịch học thường xuyên',
  EXAM = 'Lịch thi', 
  MAKEUP = 'Lịch học bù',
  CANCELLED = 'Lịch tạm ngưng'
}

// Enum cho schedule status
export enum ScheduleStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed'
}

// Default export
export default Schedule;

// Helper function để convert ScheduleEntry + Course thành Schedule
export const createScheduleFromEntry = (
  entry: ScheduleEntry, 
  course?: Course
): Schedule => {
  return {
    ...entry,
    course_code: course?.code,
    course_name: course?.name,
    instructor_name: course?.instructor_name,
    location: course?.location,
    color_tag: course?.color_tag,
    startAt: typeof entry.start_at === 'string' ? new Date(entry.start_at) : entry.start_at,
    endAt: typeof entry.end_at === 'string' ? new Date(entry.end_at) : entry.end_at,
    subject: course?.name,
  };
};

// Helper function để validate schedule time
export const validateScheduleTime = (schedule: CreateScheduleRequest): string | null => {
  const startTime = typeof schedule.start_at === 'string' 
    ? new Date(schedule.start_at) 
    : schedule.start_at;
  const endTime = typeof schedule.end_at === 'string' 
    ? new Date(schedule.end_at) 
    : schedule.end_at;

  if (startTime >= endTime) {
    return 'Thời gian kết thúc phải sau thời gian bắt đầu';
  }

  return null;
};