import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { getAllTasks } from '../database/task';
import { getAllReminders } from '../database/reminder';
import { getAllRecurrences } from '../database/recurrence';
import { generateOccurrences } from '../utils/taskValidation';
import { deleteAllScheduledNotifications, bulkInsertScheduledNotifications } from '../database/scheduledNotification';
import { plannedHabitOccurrences, getHabitCompletions, fmtYMD, markHabitToday } from '../utils/habits';
import { updateTask } from '../database/task';

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
let responseSub: Notifications.Subscription | null = null;

export async function initNotifications() {
  if (initialized) return;
  // Cấu hình handler (chỉ hiện thông báo, không play sound nếu không cần)
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // Phát âm thanh chỉ cho chế độ "alarm" (dựa vào data.method hoặc channelId)
      const data = notification?.request?.content?.data as any;
      const channelId = (notification?.request?.content as any)?.channelId;
      const isAlarm = data?.method === 'alarm' || channelId === 'alarm';
      return {
        shouldShowAlert: true,
        shouldPlaySound: !!isAlarm,
        shouldSetBadge: false,
        // Các field mới trên iOS 17 / API mới của Expo
        shouldShowBanner: true,
        shouldShowList: true,
      } as any;
    },
  });

  if (Platform.OS === 'android') {
    // Kênh mặc định cho thông báo bình thường (không chuông lớn)
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Thông báo chung',
      importance: Notifications.AndroidImportance.DEFAULT,
      enableVibrate: true,
    });
    // Kênh riêng cho "chuông báo" (hiện heads-up + phát nhạc chuông)
    await Notifications.setNotificationChannelAsync('alarm', {
      name: 'Chuông báo',
      importance: Notifications.AndroidImportance.MAX,
      // Dùng âm thanh tuỳ chỉnh dài cho Android
      sound: 'alarm_android.wav',
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
  // Category for daily digest with action buttons
  try {
    await Notifications.setNotificationCategoryAsync?.('daily-digest', [
      { identifier: 'MARK_ALL_TODAY_DONE', buttonTitle: 'Đánh dấu tất cả xong', options: { opensAppToForeground: false } } as any,
      { identifier: 'OPEN_COMPLETED', buttonTitle: 'Xem chi tiết', options: { opensAppToForeground: true } } as any,
    ]);
  } catch {}
  // Thiết lập action "Tắt chuông" cho thông báo ALARM
  try {
    await Notifications.setNotificationCategoryAsync?.('alarm-actions', [
      {
        identifier: 'STOP_ALARM',
        buttonTitle: 'Tắt chuông',
        options: { opensAppToForeground: true },
      } as any,
    ]);
  } catch (e) {
    // Một số nền tảng có thể không hỗ trợ categories, bỏ qua
  }
  try {
    if (!responseSub) {
      responseSub = Notifications.addNotificationResponseReceivedListener((resp) => {
        const id = resp.actionIdentifier;
        const data = resp?.notification?.request?.content?.data as any;
        const notifId = resp?.notification?.request?.identifier as string | undefined;
        if (id === 'STOP_ALARM') {
          // Huỷ thông báo đang hiển thị, hành vi này thường dừng luôn âm thanh kênh trên Android
          Notifications.dismissAllNotificationsAsync?.();
        } else if (id === 'MARK_ALL_TODAY_DONE') {
          // Complete all today's pending tasks/occurrences
          completeAllToday().catch(() => {});
          // Dismiss this notification immediately
          if (notifId) Notifications.dismissNotificationAsync?.(notifId).catch(() => {});
        } else if (id === 'OPEN_COMPLETED' || id === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          // Open Completed screen via deep link
          try {
            const url = (data && data.link) ? String(data.link) : Linking.createURL('/completed');
            Linking.openURL(url);
          } catch {}
          // Dismiss this notification immediately
          if (notifId) Notifications.dismissNotificationAsync?.(notifId).catch(() => {});
        }
      });
    }
  } catch {}
  initialized = true;
}

// Public helper: ask notification permission only if needed (Android 13+/iOS)
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    const granted = (current as any)?.granted || current.status === (Notifications as any).AuthorizationStatus?.GRANTED || current.status === 'granted';
    if (granted) return true;
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    } as any);
    return (req as any)?.granted || req.status === (Notifications as any).AuthorizationStatus?.GRANTED || req.status === 'granted';
  } catch (e) {
    console.warn('[Notif] ensureNotificationPermission error', e);
    return false;
  }
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
    const method: string = reminder.method || 'notification';

      // Nếu có lặp lại
      if (task.recurrence_id && recMap[task.recurrence_id]) {
        const rec = recMap[task.recurrence_id];
        const recConfig = {
          enabled: true,
          frequency: rec.type || 'daily',
            interval: rec.interval || 1,
            daysOfWeek: rec.days_of_week ? JSON.parse(rec.days_of_week) : [],
            daysOfMonth: rec.day_of_month ? JSON.parse(rec.day_of_month) : [],
            endDate: rec.end_date ? (() => { const d = new Date(rec.end_date); d.setHours(23,59,59,999); return d.getTime(); })() : undefined,
        } as any;
        if (!recConfig.endDate) {
          // Không có endDate thì chỉ lập lịch cho lần gốc
          const scheduleTime = startAt - leadMs;
          if (scheduleTime > now && scheduleTime < horizon) {
            const notificationId = await scheduleNotification(task.title, leadMinutes, scheduleTime, startAt, method);
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
            const notificationId = await scheduleNotification(task.title, leadMinutes, scheduleTime, occ.startAt, method);
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
          const notificationId = await scheduleNotification(task.title, leadMinutes, scheduleTime, startAt, method);
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

    // Daily digest for today's pending tasks
    try {
      const digestRecord = await scheduleTodayDigest(tasks as any[], recurrences as any[]);
      if (digestRecord) records.push(digestRecord);
    } catch (e) {
      console.warn('Lỗi lập lịch daily digest:', e);
    }

    if (records.length) {
      await bulkInsertScheduledNotifications(records);
    }
  } catch (e) {
    console.warn('Lỗi lập lịch thông báo:', e);
  }
}

async function scheduleNotification(
  taskTitle: string,
  leadMinutes: number,
  triggerTimeMs: number,
  startAtMs: number,
  method: string,
  options?: { title?: string; body?: string; data?: Record<string, any>; categoryId?: string }
) {
  const triggerDate = new Date(triggerTimeMs);
  const isAlarm = (method === 'alarm');
  const channelId = Platform.OS === 'android' ? (isAlarm ? 'alarm' : 'default') : undefined;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: options?.title ?? 'Sắp đến hạn công việc',
      body: options?.body ?? `${taskTitle} bắt đầu trong ${formatLeadMinutes(leadMinutes)} (lúc ${formatTime(new Date(startAtMs))})`,
      // iOS: phát âm thanh custom khi là alarm; Android: dùng kênh để cấu hình âm thanh
      sound: isAlarm ? (Platform.OS === 'ios' ? 'alarm_ios.wav' : 'alarm_android.wav') : undefined,
      data: { taskTitle, startAt: startAtMs, method, ...(options?.data || {}) },
      categoryIdentifier: options?.categoryId ?? (isAlarm ? 'alarm-actions' : undefined),
      // Android: chọn kênh thông báo
      ...(channelId ? { channelId } : {}),
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

// ---------------- Daily Digest helpers ----------------

function startOfDay(ms: number) {
  const d = new Date(ms); d.setHours(0,0,0,0); return d.getTime();
}
function endOfDay(ms: number) {
  const d = new Date(ms); d.setHours(23,59,59,999); return d.getTime();
}

async function scheduleTodayDigest(tasks: any[], recurrences: any[]) {
  const now = Date.now();
  const sDay = startOfDay(now);
  const eDay = endOfDay(now);

  // Build map for recurrences
  const recMap: Record<number, any> = {};
  for (const r of recurrences) { if (r.id != null) recMap[r.id] = r; }

  const pendingTitles: string[] = [];
  let latestEnd: number | null = null;

  // Non-recurring tasks scheduled today and not completed
  for (const t of tasks) {
    try {
      if (t.is_deleted) continue;
      if (!t.start_at) continue;
      const s = new Date(t.start_at).getTime();
      const e = t.end_at ? new Date(t.end_at).getTime() : (s + 60*60*1000);
      const sameDay = s >= sDay && s <= eDay;
      if (!t.recurrence_id && sameDay && t.status !== 'completed') {
        pendingTitles.push(t.title || 'Không tiêu đề');
        if (latestEnd == null || e > latestEnd) latestEnd = e;
      }
    } catch {}
  }

  // Recurring occurrences for today that are not done
  for (const t of tasks) {
    try {
      if (!t.recurrence_id) continue;
      const rec = recMap[t.recurrence_id];
      if (!rec) continue;
      const occs = plannedHabitOccurrences(t as any, rec as any);
      if (!occs || !occs.length) continue;
      // Prefetch completions
      const comp: Set<string> = rec.id ? await getHabitCompletions(rec.id) : new Set();
      for (const o of occs) {
        const s = o.startAt;
        if (s < sDay || s > eDay) continue;
        const ymd = fmtYMD(new Date(s));
        if (comp.has(ymd)) continue; // already done
        pendingTitles.push(t.title || 'Không tiêu đề');
        if (latestEnd == null || o.endAt > latestEnd) latestEnd = o.endAt;
      }
    } catch {}
  }

  if (!pendingTitles.length || latestEnd == null) return null;
  if (latestEnd <= now) return null; // too late for today

  // Build notification content
  const maxLines = 5;
  const first = pendingTitles.slice(0, maxLines);
  const extra = pendingTitles.length - first.length;
  const listBody = `• ${first.join('\n• ')}${extra > 0 ? `\n… và ${extra} công việc khác` : ''}`;
  const title = `Công việc hôm nay chưa hoàn thành (${pendingTitles.length})`;
  const link = Linking.createURL('/completed');
  const nid = await scheduleNotification(
    'Daily Digest',
    0,
    latestEnd,
    latestEnd,
    'notification',
    { title, body: listBody, data: { link, digest: true }, categoryId: 'daily-digest' }
  );
  return {
    task_id: null,
    reminder_id: null,
    recurrence_id: null,
    occurrence_start_at: sDay,
    occurrence_end_at: latestEnd,
    schedule_time: latestEnd,
    notification_id: nid,
    lead_minutes: 0,
    status: 'scheduled',
  } as any;
}

async function completeAllToday() {
  try {
    const [tasks, recurrences] = await Promise.all([getAllTasks(), getAllRecurrences()]);
    const now = Date.now();
    const sDay = startOfDay(now);
    const eDay = endOfDay(now);
    const recMap: Record<number, any> = {};
    for (const r of recurrences) { if (r.id != null) recMap[r.id] = r; }

    // Non-recurring
    for (const t of tasks) {
      try {
        if (t.is_deleted) continue;
        if (t.recurrence_id) continue;
        if (t.status === 'completed') continue;
        if (!t.start_at) continue;
        const s = new Date(t.start_at).getTime();
        const sameDay = s >= sDay && s <= eDay;
        if (!sameDay) continue;
        await updateTask(t.id, { status: 'completed', completed_at: new Date() } as any);
      } catch {}
    }

    // Recurring: mark today's occurrences
    for (const t of tasks) {
      try {
        if (!t.recurrence_id) continue;
        const rec = recMap[t.recurrence_id];
        if (!rec || !rec.id) continue;
        const occs = plannedHabitOccurrences(t as any, rec as any).filter(o => o.startAt >= sDay && o.startAt <= eDay);
        if (!occs.length) continue;
        // Mark today (may be multiple, but markHabitToday uses ymd, so it's idempotent)
        await markHabitToday(rec.id, new Date(sDay));
      } catch {}
    }

    // Optionally refresh notifications to remove stale digest
    try { await refreshNotifications(); } catch {}
  } catch {}
}
