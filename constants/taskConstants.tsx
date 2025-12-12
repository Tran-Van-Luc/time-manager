export const PRIORITY_OPTIONS = [
  { label: "Mức độ thấp", value: "low" },
  { label: "Mức độ trung bình", value: "medium" },
  { label: "Mức độ cao", value: "high" },
];

export const STATUS_OPTIONS = [
  { label: "Chờ thực hiện", value: "pending" },
  { label: "Đang thực hiện", value: "in-progress" },
  { label: "Hoàn thành", value: "completed" },
];

export const REMINDER_OPTIONS = [
  { label: "5 phút", value: 5 },
  { label: "15 phút", value: 15 },
  { label: "30 phút", value: 30 },
  { label: "1 giờ", value: 60 },
  { label: "2 giờ", value: 120 },
  { label: "1 ngày", value: 1440 },
];

export const REPEAT_OPTIONS = [
  { label: "Hàng ngày", value: "daily" },
  { label: "Hàng tuần", value: "weekly" },
  { label: "Hàng tháng", value: "monthly" },
  { label: "Hàng năm", value: "yearly" },
];

// Localized option builders for comboboxes.
// Use these in components with `const { t } = useLanguage()`.
export const getPriorityOptions = (t: any) => [
  { label: t?.tasks?.modal?.priorityLow ?? "Mức độ thấp", value: "low" },
  { label: t?.tasks?.modal?.priorityMedium ?? "Mức độ trung bình", value: "medium" },
  { label: t?.tasks?.modal?.priorityHigh ?? "Mức độ cao", value: "high" },
];

export const getStatusOptions = (t: any) => [
  { label: t?.tasks?.item?.statusPending ?? "Chờ thực hiện", value: "pending" },
  { label: t?.tasks?.item?.statusInProgress ?? "Đang thực hiện", value: "in-progress" },
  { label: t?.tasks?.item?.statusCompleted ?? "Hoàn thành", value: "completed" },
];

export const getReminderOptions = (t: any) => [
  { label: `5 ${t?.tasks?.modal?.minutes ?? "phút"}`, value: 5 },
  { label: `15 ${t?.tasks?.modal?.minutes ?? "phút"}`, value: 15 },
  { label: `30 ${t?.tasks?.modal?.minutes ?? "phút"}`, value: 30 },
  { label: `1 ${t?.tasks?.modal?.hours ?? "giờ"}`, value: 60 },
  { label: `2 ${t?.tasks?.modal?.hours ?? "giờ"}`, value: 120 },
  { label: `1 ${t?.tasks?.modal?.days ?? "ngày"}`, value: 1440 },
];

export const getRepeatOptions = (t: any) => [
  { label: t?.tasks?.modal?.repeatDaily ?? "Hàng ngày", value: "daily" },
  { label: t?.tasks?.modal?.repeatWeekly ?? "Hàng tuần", value: "weekly" },
  { label: t?.tasks?.modal?.repeatMonthly ?? "Hàng tháng", value: "monthly" },
  { label: t?.tasks?.modal?.repeatYearly ?? "Hàng năm", value: "yearly" },
];