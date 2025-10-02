import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getAllTasks } from '../database/task';
import { getAllReminders } from '../database/reminder';
import { getAllRecurrences } from '../database/recurrence';
import { generateOccurrences } from '../utils/taskValidation';
import { deleteAllScheduledNotifications, bulkInsertScheduledNotifications } from '../database/scheduledNotification';

// Định dạng khoảng thời gian nhắc trước (phút) thành chuỗi "x ngày x giờ x phút"
function formatLeadMinutes(minutes: number) {
  if (minutes <= 0) return 'ít phút';
  const d = Math.floor(minutes / (60 * 24));
  const h = Math.floor((minutes % (60 * 24)) / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} ngày`);
  if (h) parts.push(`${h} giờ`);
  if (m) parts.push(`${m} phút`);
  return parts.join(' ');
}

let initialized = false;

export async function initNotifications() {
  if (initialized) return;
  // Cấu hình handler (chỉ hiện thông báo, không play sound nếu không cần)
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      // Các field mới trên iOS 17 / API mới của Expo
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Thông báo chung',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('Quyền thông báo chưa được cấp, bỏ qua lập lịch.');
    return;
  }
  initialized = true;
}

// Hạn chế lập lịch quá xa: 30 ngày tới
const HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

// Lập lịch lại toàn bộ thông báo công việc dựa vào bảng tasks + reminders + recurrences
export async function rescheduleTaskNotifications() {
  try {
    await initNotifications();
    // Nếu chưa cấp quyền sẽ return ở init
    if (!initialized) return;

    // Hủy toàn bộ thông báo đã lập lịch trước đó để tránh trùng / rác
    await Notifications.cancelAllScheduledNotificationsAsync();
    // Xoá bản ghi cũ trong DB
    await deleteAllScheduledNotifications();

    const [tasks, reminders, recurrences] = await Promise.all([
      getAllTasks(),
      getAllReminders(),
      getAllRecurrences(),
    ]);

    const recMap: Record<number, any> = {};
    recurrences.forEach((r: any) => { if (r.id != null) recMap[r.id] = r; });

    const now = Date.now();
    const horizon = now + HORIZON_MS;

  const records: any[] = [];
  for (const reminder of reminders) {
      if (!reminder.is_active) continue;
      if (!reminder.task_id) continue;
      const task = tasks.find((t: any) => t.id === reminder.task_id);
      if (!task) continue;
      if (!task.start_at) continue;

      const startAt = new Date(task.start_at).getTime();
      const endAt = task.end_at ? new Date(task.end_at).getTime() : startAt + 60 * 60 * 1000; // default 1h duration
      const leadMinutes: number = reminder.remind_before ?? 0;
      const leadMs = leadMinutes * 60 * 1000;

      // Nếu có lặp lại
      if (task.recurrence_id && recMap[task.recurrence_id]) {
        const rec = recMap[task.recurrence_id];
        const recConfig = {
          enabled: true,
          frequency: rec.type || 'daily',
            interval: rec.interval || 1,
            daysOfWeek: rec.days_of_week ? JSON.parse(rec.days_of_week) : [],
            daysOfMonth: rec.day_of_month ? JSON.parse(rec.day_of_month) : [],
            endDate: rec.end_date ? new Date(rec.end_date).getTime() : undefined,
        } as any;
        if (!recConfig.endDate) {
          // Không có endDate thì chỉ lập lịch cho lần gốc
          const scheduleTime = startAt - leadMs;
          if (scheduleTime > now && scheduleTime < horizon) {
            const notificationId = await scheduleNotification(task.title, leadMinutes, scheduleTime, startAt);
            records.push({
              task_id: task.id,
              reminder_id: reminder.id,
              recurrence_id: null,
              occurrence_start_at: startAt,
              occurrence_end_at: endAt,
              schedule_time: scheduleTime,
              notification_id: notificationId,
              lead_minutes: leadMinutes,
              status: 'scheduled',
            });
          }
        } else {
          const occs = generateOccurrences(startAt, endAt, recConfig);
          for (const occ of occs) {
            if (occ.startAt > horizon) break;
            const scheduleTime = occ.startAt - leadMs;
            if (scheduleTime <= now) continue; // bỏ nếu đã qua
            if (scheduleTime > horizon) continue; // ngoài tầm
            const notificationId = await scheduleNotification(task.title, leadMinutes, scheduleTime, occ.startAt);
            records.push({
              task_id: task.id,
              reminder_id: reminder.id,
              recurrence_id: task.recurrence_id,
              occurrence_start_at: occ.startAt,
              occurrence_end_at: occ.endAt,
              schedule_time: scheduleTime,
              notification_id: notificationId,
              lead_minutes: leadMinutes,
              status: 'scheduled',
            });
          }
        }
      } else {
        // Không lặp
        const scheduleTime = startAt - leadMs;
        if (scheduleTime > now && scheduleTime < horizon) {
          const notificationId = await scheduleNotification(task.title, leadMinutes, scheduleTime, startAt);
          records.push({
            task_id: task.id,
            reminder_id: reminder.id,
            recurrence_id: null,
            occurrence_start_at: startAt,
            occurrence_end_at: endAt,
            schedule_time: scheduleTime,
            notification_id: notificationId,
            lead_minutes: leadMinutes,
            status: 'scheduled',
          });
        }
      }
    }

    if (records.length) {
      await bulkInsertScheduledNotifications(records);
    }
  } catch (e) {
    console.warn('Lỗi lập lịch thông báo:', e);
  }
}

async function scheduleNotification(taskTitle: string, leadMinutes: number, triggerTimeMs: number, startAtMs: number) {
  const triggerDate = new Date(triggerTimeMs);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sắp đến hạn công việc',
      body: `${taskTitle} bắt đầu trong ${formatLeadMinutes(leadMinutes)} (lúc ${formatTime(new Date(startAtMs))})`,
      sound: undefined,
      data: { taskTitle, startAt: startAtMs },
    },
  // Cast Date trực tiếp cho trigger (Expo chấp nhận Date object). Nếu TS báo lỗi type, ép any.
  trigger: triggerDate as any,
  });
  return id;
}

function formatTime(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

// Tiện ích public để cho các nơi khác gọi nhanh
export async function refreshNotifications() {
  return rescheduleTaskNotifications();
}
