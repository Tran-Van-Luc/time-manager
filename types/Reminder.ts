export interface Reminder {
	id?: number;
	task_id?: number;
	calendar_event_id?: number;
	remind_before?: number; // số phút nhắc trước
	method?: string; // phương thức (noti/email/…)
	repeat_count?: number; // số lần lặp lại nhắc
	is_active?: number; // 0 = off, 1 = on
	created_at?: number; // timestamp (ms)
}
