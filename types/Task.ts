// types/Task.ts
export interface Task {
  id: number;
  user_id?: number;
  title: string;
  description?: string;
  start_at?: string;   // ISO string khi đưa ra UI
  end_at?: string;     // ISO string khi đưa ra UI
  priority?: string;
  status?: string;
  recurrence_id?: number;
  completed_at?: string;
  completion_diff_minutes?: number; // âm = sớm, dương = trễ
  completion_status?: 'early' | 'on_time' | 'late';
  is_deleted: number;
  created_at: string;
  updated_at: string;
}
