export interface Recurrence {
	id?: number;
	type?: string; 
	interval?: number; // khoảng cách, ví dụ mỗi 2 ngày
	days_of_week?: string; // JSON string: ["Mon","Wed"]
	day_of_month?: string;
	start_date?: number; // timestamp (ms)
	end_date?: number;   // timestamp (ms)
	created_at?: number; // timestamp (ms)
}
