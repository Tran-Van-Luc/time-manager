import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { parseVoiceWithGemini } from '../../utils/voiceScheduleService';

// Note: NewTaskData type above is not exported in that hook file currently. The component
// uses a loose typing for the parsed payload to avoid tight coupling. Parent should
// accept the shape returned in onParsed.

type ReminderConfig = { enabled: boolean; time?: number; method?: string };
type RecurrenceConfig = {
  enabled: boolean;
  frequency?: "daily" | "weekly" | "monthly" | "yearly" | string;
  interval?: number;
  daysOfWeek?: string[];
  daysOfMonth?: string[];
  endDate?: number;
  yearlyCount?: number;
  habitMerge?: boolean;
};

type ParsedTaskPayload = {
  // task contains fields the parent handleAddTask expects: title, description, start_at (ms), end_at (ms), priority, status
  task?: Record<string, any>;
  reminder: ReminderConfig;
  recurrence: RecurrenceConfig;
};

interface Props {
  onParsed: (payload: ParsedTaskPayload) => void;
}

export default function VoiceTaskInput({ onParsed }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [showInputModal, setShowInputModal] = useState(false);
  const [tempInput, setTempInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const VoiceRef = useRef<any>(null);

  useEffect(() => {
    try {
      // dynamic import to avoid hard dependency
      // eslint-disable-next-line global-require
      const V = require('@react-native-voice/voice');
      VoiceRef.current = V.default || V;
      setVoiceAvailable(true);
    } catch (err) {
      VoiceRef.current = null;
      setVoiceAvailable(false);
    }
    return () => {
      try {
        if (VoiceRef.current && VoiceRef.current.destroy) VoiceRef.current.destroy();
      } catch {}
    };
  }, []);

  const requestAndroidRecordPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Quyền ghi âm',
        message: 'Ứng dụng cần quyền ghi âm để nhận diện giọng nói',
        buttonPositive: 'Cho phép',
        buttonNegative: 'Hủy',
      });
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      return false;
    }
  };

  const onSpeechResults = (e: any) => {
    try {
      const parts = e?.value || e?.results || [];
      const text = Array.isArray(parts) ? parts.join(' ') : String(parts || '');
      setTranscript(text);
      handleProcess(text);
    } catch (err) {
      console.warn('speech results error', err);
    } finally {
      setIsRecording(false);
    }
  };

  const onSpeechError = (e: any) => {
    console.error('speech error', e);
    Alert.alert('Lỗi nhận diện giọng nói', (e && e.error && e.error.message) || 'Không thể nhận diện giọng nói');
    setIsRecording(false);
  };

  const startRecording = async () => {
    if (!voiceAvailable || !VoiceRef.current) {
      Alert.alert('Không hỗ trợ', 'Tính năng nhận diện giọng nói chưa được cài đặt trên thiết bị này.');
      return;
    }
    const ok = await requestAndroidRecordPermission();
    if (!ok) {
      Alert.alert('Quyền bị từ chối', 'Không thể ghi âm vì quyền bị từ chối');
      return;
    }
    try {
      const V = VoiceRef.current;
      if (V && V.onSpeechResults) V.onSpeechResults = onSpeechResults;
      if (V && V.onSpeechError) V.onSpeechError = onSpeechError;
      const locale = Platform.OS === 'ios' ? 'vi_VN' : 'vi-VN';
      await V.start(locale).catch(async () => await V.start('en-US'));
      setIsRecording(true);
    } catch (err) {
      console.error('start recording failed', err);
      setIsRecording(false);
      Alert.alert('Lỗi', 'Không thể bắt đầu nhận diện giọng nói');
    }
  };

  const stopRecording = async () => {
    try {
      const V = VoiceRef.current;
      if (!V) return;
      await V.stop();
    } catch (err) {
      console.warn('stop recording error', err);
    } finally {
      setIsRecording(false);
    }
  };

  const handleProcess = async (text: string) => {
    setIsProcessing(true);
    try {
      // --- Helpers for extended mappings (minimal, local) ---
      const mapFrequency = (s: any): RecurrenceConfig["frequency"] | undefined => {
        if (s == null) return undefined;
        const v = String(s).toLowerCase();
        if (v.includes("tuần") || v.includes("tuan") || v.includes("weekly")) return "weekly";
        if (v.includes("tháng") || v.includes("thang") || v.includes("monthly")) return "monthly";
        if (v.includes("năm") || v.includes("nam") || v.includes("year")) return "yearly";
        if (v.includes("ngày") || v.includes("ngay") || v.includes("daily")) return "daily";
        return undefined;
      };
      const mapMethod = (s: any) => {
        if (!s && s !== 0) return undefined;
        const v = String(s).toLowerCase();
        if (v.includes("chuông") || v.includes("alarm")) return "alarm";
        return "notification";
      };
      const mapDowToken = (t: string) => {
        if (!t) return null;
        const v = String(t).trim().toLowerCase();
        if (v === "t2" || v.includes("thứ 2") || v.includes("thu 2")) return "Mon";
        if (v === "t3" || v.includes("thứ 3")) return "Tue";
        if (v === "t4" || v.includes("thứ 4")) return "Wed";
        if (v === "t5" || v.includes("thứ 5")) return "Thu";
        if (v === "t6" || v.includes("thứ 6")) return "Fri";
        if (v === "t7" || v.includes("thứ 7")) return "Sat";
        if (v === "cn" || v.includes("chủ nhật") || v.includes("chu nhat")) return "Sun";
        return null;
      };
      const parseDowsFromString = (s: any): string[] => {
        if (!s) return [];
        if (Array.isArray(s)) return s.map(String).map(mapDowToken).filter(Boolean) as string[];
        return String(s).split(",").map(mapDowToken).filter(Boolean) as string[];
      };
      const parseDomFromString = (s: any): string[] => {
        if (!s) return [];
        if (Array.isArray(s)) return s.map(String).map(x => x.trim()).filter(Boolean);
        return String(s).split(",").map(x => x.trim()).filter(Boolean);
      };
      const parseDateOnly = (s: any): number | undefined => {
        if (s == null) return undefined;
        if (typeof s === "number") return s;
        if (s instanceof Date) return s.getTime();
        const v = String(s).trim();
        const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
        const n = Date.parse(v);
        if (!isNaN(n)) return n;
        return undefined;
      };

      // parse forms like "29 tháng 11 năm 2025"
      const parseDateVietnameseLong = (s: any): number | undefined => {
        if (!s) return undefined;
        const v = String(s).trim().toLowerCase();
        const m = v.match(/(\d{1,2})\s*(?:tháng|thang)\s*(\d{1,2})\s*(?:năm|nam)?\s*(\d{4})/i);
        if (m) {
          const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
          return new Date(yyyy, mm - 1, dd).getTime();
        }
        return undefined;
      };

      const parseTimeOnly = (s: any): { h: number; m: number } | undefined => {
        if (s == null) return undefined;
        if (typeof s === "number") {
          const frac = s % 1;
          const totalSeconds = Math.round(frac * 24 * 3600);
          return { h: Math.floor(totalSeconds / 3600), m: Math.floor((totalSeconds % 3600) / 60) };
        }
        const v = String(s).trim();
        const m = v.match(/(\d{1,2})\s*[:h]\s*(\d{1,2})?/i);
        if (m) return { h: Number(m[1]), m: m[2] ? Number(m[2]) : 0 };
        return undefined;
      };
      const combineDateTime = (dateMs?: number, t?: { h: number; m: number }) => {
        if (!dateMs || !t) return undefined;
        const d = new Date(dateMs);
        d.setHours(t.h, t.m, 0, 0);
        return d.getTime();
      };
      // --- end helpers ---

      // Call the looser Gemini parser but include today's date in a hidden form
      // so the model can resolve relative dates like "hôm nay", "thứ 3", "tuần sau".
      const todayISO = new Date().toISOString().split('T')[0];
      const todayHuman = new Date().toLocaleDateString('vi-VN');
      const augmented = `${text}\n\nHIDDEN_TODAY_ISO: ${todayISO}\nHIDDEN_TODAY_HUMAN: ${todayHuman}`;
      const parsedAny: any = await parseVoiceWithGemini(augmented);
      const parsed: any = (typeof parsedAny === 'string' || parsedAny == null) ? { summary: String(parsedAny || text) } : parsedAny;
      // If parsed is still a string or missing expected keys, normalize below.
      const payload: ParsedTaskPayload = {
        task: {},
        reminder: { enabled: false },
        recurrence: { enabled: false },
      };

      // Normalizers
      const mapPriority = (v: any) => {
        if (!v) return undefined;
        const s = String(v).toLowerCase();
        if (/cao|khẩn|quan trọng|high/i.test(s)) return 'high';
        if (/trung bình|tb|medium/i.test(s)) return 'medium';
        if (/thấp|low|ít quan trọng/i.test(s)) return 'low';
        return undefined;
      };
      const mapStatus = (v: any) => {
        if (!v) return undefined;
        const s = String(v).toLowerCase();
        if (/hoàn thành|completed|done|xong/i.test(s)) return 'completed';
        if (/đang làm|in[- ]?progress|in progress/i.test(s)) return 'in-progress';
        if (/đang chờ|pending|chờ/i.test(s)) return 'pending';
        return undefined;
      };

      // Title / description
      if (parsed.title) payload.task!.title = String(parsed.title).trim();
      else if (parsed.taskTitle) payload.task!.title = String(parsed.taskTitle).trim();
      else if (parsed.courseName) payload.task!.title = String(parsed.courseName).trim(); // fallback

      if (parsed.description) payload.task!.description = String(parsed.description).trim();
      else if (parsed.note) payload.task!.description = String(parsed.note).trim();

      // Dates/times: if the strict parser was used it may provide epoch ms fields
      const toMs = (v: any): number | undefined => {
        if (v == null) return undefined;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          // try numeric string
          const parsedNum = Number(v);
          if (!isNaN(parsedNum) && parsedNum > 1000000000) return parsedNum;
          const n = Date.parse(v);
          if (!isNaN(n)) return n;
        }
        return undefined;
      };

      // If AI returned the strict task schema (startAtMs / endAtMs), prefer those
      const startDate = toMs(parsed.startAtMs ?? parsed.startAt ?? parsed.startTime ?? parsed.startDate ?? parsed.begin);
      const endDate = toMs(parsed.endAtMs ?? parsed.endAt ?? parsed.endTime ?? parsed.endDate ?? parsed.finish);
      if (startDate) payload.task!.start_at = startDate;
      if (endDate) payload.task!.end_at = endDate;

      // Also attempt to capture separate date-only / time-only pieces if provided
      const maybeStartDateOnly = parseDateOnly(parsed.startDate ?? parsed.start_date ?? parsed.date);
      const maybeStartTimeOnly = parseTimeOnly(parsed.startTime ?? parsed.start_time ?? parsed.time);
      const maybeEndDateOnly = parseDateOnly(parsed.endDate ?? parsed.end_date);
      const maybeEndTimeOnly = parseTimeOnly(parsed.endTime ?? parsed.end_time);
      if (!payload.task!.start_at && maybeStartDateOnly && maybeStartTimeOnly) {
        payload.task!.start_at = combineDateTime(maybeStartDateOnly, maybeStartTimeOnly);
      }
      if (!payload.task!.end_at && maybeEndDateOnly && maybeEndTimeOnly) {
        payload.task!.end_at = combineDateTime(maybeEndDateOnly, maybeEndTimeOnly);
      }
      // expose separate fields so caller can show "Ngày bắt đầu", "Giờ bắt đầu", "Giờ kết thúc" if needed
      if (maybeStartDateOnly) payload.task!['startDateOnly'] = maybeStartDateOnly;
      if (maybeStartTimeOnly) payload.task!['startTime'] = maybeStartTimeOnly;
      if (maybeEndTimeOnly) payload.task!['endTime'] = maybeEndTimeOnly;

      // Fallback: if no startDate / recurrence / reminder found from AI structured output,
      // try to heuristically parse the original text (Vietnamese-friendly) to extract weekday, time, reminder and weekly repeat.
      const maybeText = (parsed.summary || parsed.text || text || '').toString();
      const needsStart = !payload.task!.start_at;
      const needsRecurrence = !payload.recurrence && /lặp|hàng tuần|mỗi tuần|tuần/i.test(maybeText);
      const needsReminder = !payload.reminder && /nhắc|nhắc nhở|nhắc trước/i.test(maybeText);
      if (needsStart || needsRecurrence || needsReminder) {
        const heur = parseTaskFromFreeText(maybeText);
        if (needsStart && heur.startAt) payload.task!.start_at = heur.startAt;
        if (needsStart && heur.endAt) payload.task!.end_at = heur.endAt;
        if (needsReminder && heur.reminderMinutes != null) payload.reminder = { enabled: true, time: heur.reminderMinutes, method: 'notification' };
        if (needsRecurrence && heur.recurrence) payload.recurrence = { ...heur.recurrence, enabled: true };
      }

      // --- EXTRA heuristics: extract description, priority, recurrence end date, habitMerge from free text ---
      // 1) description in quotes after "mô tả" or first quoted string
      if (!payload.task!.description) {
        const descMatch =
          maybeText.match(/mô tả\s*(?:là|:)?\s*[“"«']([^“"«']+)[”"»']?/i) ||
          maybeText.match(/[“"«']([^“"«']+)[”"»']/);
        if (descMatch) payload.task!.description = String(descMatch[1]).trim();
      }
      
      // 2) priority keywords in free text
      if (!payload.task!.priority) {
        const prMatch = maybeText.match(/(?:mức độ|ưu tiên|ưu tiên là|mức độ ưu tiên)\s*(cao|trung bình|trung binh|thấp)/i)
          || maybeText.match(/\b(cao|trung bình|trung binh|thấp)\b/i);
        if (prMatch) {
          const tok = String(prMatch[1] || prMatch[0]).toLowerCase();
          if (tok.includes('cao')) payload.task!.priority = 'high';
          else if (tok.includes('trung')) payload.task!.priority = 'medium';
          else if (tok.includes('thấp')) payload.task!.priority = 'low';
        }
      }
      
      // 3) recurrence end date: accept dd/mm/yyyy and "dd tháng mm năm yyyy" and variants like "kết thúc chu kỳ lặp vào ngày ..."
      const recEndRegex1 = /(?:kết thúc(?: chu kỳ)?(?: lặp)?(?: vào ngày)?|ngày kết thúc lặp|kết thúc vào ngày|kết thúc)\s*[:\s]*([0-3]?\d\/[0-1]?\d\/\d{4})/i;
      const recEndRegex2 = /(?:kết thúc(?: chu kỳ)?(?: lặp)?(?: vào ngày)?|ngày kết thúc lặp|kết thúc vào ngày|kết thúc)\s*[:\s]*((\d{1,2})\s*(?:tháng|thang)\s*(\d{1,2})\s*(?:năm|nam)?\s*(\d{4}))/i;
      const recEndMatch1 = maybeText.match(recEndRegex1);
      const recEndMatch2 = maybeText.match(recEndRegex2);
      if (recEndMatch1) {
        const ed = parseDateOnly(recEndMatch1[1]);
        if (ed) {
          payload.recurrence = payload.recurrence || { enabled: true };
          payload.recurrence.endDate = ed;
          payload.recurrence.enabled = true;
        }
      } else if (recEndMatch2) {
        const dd = Number(recEndMatch2[2]), mm = Number(recEndMatch2[3]), yyyy = Number(recEndMatch2[4]);
        const ed = new Date(yyyy, mm - 1, dd).getTime();
        payload.recurrence = payload.recurrence || { enabled: true };
        payload.recurrence.endDate = ed;
        payload.recurrence.enabled = true;
      }

      // 4) habit merge: detect "gộp nhiều ngày" / "gộp"
      if (/(gộp nhiều ngày|gop nhieu ngay|gộp ngày|gộp)/i.test(maybeText)) {
        payload.recurrence = payload.recurrence || { enabled: true };
        payload.recurrence.habitMerge = true;
        payload.task!['habitMerge'] = true;
        payload.recurrence.enabled = true;
      }
      
      // ensure recurrence.enabled true if explicit repeat words present but no structured recurrence set
      if (!payload.recurrence.enabled && /\b(lặp|lặp lại|lặp theo|hàng tuần|mỗi tuần|tuần|hàng ngày|mỗi ngày|ngày|tháng|năm)\b/i.test(maybeText)) {
        payload.recurrence.enabled = true;
      }
      // --- end EXTRA heuristics ---

      // Priority / status (try normalized values from parsed data)
      const p = mapPriority(parsed.priority || parsed.priorityLevel || parsed.level || parsed.urgency || parsed.importance);
      if (p) payload.task!.priority = p;
      const st = mapStatus(parsed.status || parsed.state || parsed.statusText);
      if (st) payload.task!.status = st;

      // Reminder: structured or free-form; always ensure payload.reminder.enabled boolean present
      if (parsed.reminder && typeof parsed.reminder === "object") {
        const r = parsed.reminder;
        const minutes = r?.minutesBefore ?? r?.minutes ?? r?.time ?? null;
        const method = r?.method ?? r?.type ?? null;
        payload.reminder = { enabled: minutes != null || !!method, time: minutes != null ? Number(minutes) : undefined, method: mapMethod(method) ?? "notification" };
      } else if (parsed.reminderEnabled === true || parsed.reminderEnabled === false) {
        payload.reminder.enabled = !!parsed.reminderEnabled;
        if (parsed.reminderMinutes != null) payload.reminder.time = Number(parsed.reminderMinutes);
        if (parsed.reminderMethod) payload.reminder.method = mapMethod(parsed.reminderMethod) ?? payload.reminder.method;
      } else if (parsed.reminder || parsed.reminders) {
        const r = parsed.reminder || (Array.isArray(parsed.reminders) ? parsed.reminders[0] : parsed.reminders);
        const minutes = r?.minutesBefore ?? r?.minutes ?? r?.time ?? null;
        const method = r?.method ?? r?.type ?? null;
        payload.reminder = { enabled: minutes != null || !!method, time: minutes != null ? Number(minutes) : undefined, method: mapMethod(method) ?? "notification" };
      } else {
        const txt = (parsed.text || parsed.summary || text || "").toString().toLowerCase();
        if (/nhắc|nhắc trước|thông báo|chuông|alarm/.test(txt)) {
          payload.reminder.enabled = true;
          if (/(\d+)\s*phút/.test(txt)) {
            const mm = txt.match(/(\d+)\s*phút/);
            if (mm) payload.reminder.time = Number(mm[1]);
          }
          if (/chuông|alarm/.test(txt)) payload.reminder.method = "alarm";
        }
      }

      // Recurrence: try to map common props and detect interval/period keywords
      // Recurrence: prefer strict parser shape (frequency, interval, daysOfWeek, daysOfMonth, endDateMs)
      if (parsed.recurrence && typeof parsed.recurrence === "object") {
         const rec = parsed.recurrence;
         const rc: RecurrenceConfig = { enabled: true };
         if (rec.frequency) rc.frequency = mapFrequency(rec.frequency) ?? String(rec.frequency);
         if (rec.interval) rc.interval = Number(rec.interval) || 1;
         if (rec.daysOfWeek) rc.daysOfWeek = parseDowsFromString(rec.daysOfWeek);
         if (rec.daysOfMonth) rc.daysOfMonth = parseDomFromString(rec.daysOfMonth);
         if (rec.endDateMs) {
           const ed = toMs(rec.endDateMs);
           if (ed) rc.endDate = ed;
         } else if (rec.endDate) {
           const ed = toMs(rec.endDate) ?? parseDateOnly(rec.endDate) ?? parseDateVietnameseLong(rec.endDate);
           if (ed) rc.endDate = ed;
         }
         if (rec.yearlyCount || rec.yearly_count) rc.yearlyCount = Number(rec.yearlyCount ?? rec.yearly_count) || undefined;
         if (typeof rec.habitMerge === "boolean") rc.habitMerge = rec.habitMerge;
         if (!rc.interval) rc.interval = 1;
         payload.recurrence = rc;
       } else if (parsed.recurrence || parsed.repeat || parsed.repeatConfig) {
         const rec = parsed.recurrence || parsed.repeat || parsed.repeatConfig;
         const rc: RecurrenceConfig = { enabled: true };
         if (rec.frequency) rc.frequency = mapFrequency(rec.frequency) ?? String(rec.frequency);
         if (rec.interval) rc.interval = Number(rec.interval) || 1;
         if (rec.daysOfWeek) rc.daysOfWeek = parseDowsFromString(rec.daysOfWeek);
         if (rec.daysOfMonth) rc.daysOfMonth = parseDomFromString(rec.daysOfMonth);
         if (rec.endDate) {
           const ed = toMs(rec.endDate) ?? parseDateOnly(rec.endDate) ?? parseDateVietnameseLong(rec.endDate);
           if (ed) rc.endDate = ed;
         }
         if (rec.yearlyCount || rec.yearly_count) rc.yearlyCount = Number(rec.yearlyCount ?? rec.yearly_count) || undefined;
         if (typeof rec.habitMerge === "boolean") rc.habitMerge = rec.habitMerge;
         if (!rc.interval) rc.interval = 1;
         payload.recurrence = rc;
       }

      // habitMerge if provided by strict parser
      if (parsed.habitMerge === true || parsed.habitMerge === false) {
        payload.task!['habitMerge'] = parsed.habitMerge;
      }
      // also try recurrence.habitMerge -> task.habitMerge (mirror)
      if (payload.recurrence && typeof payload.recurrence.habitMerge === "boolean") {
        payload.task!['habitMerge'] = payload.recurrence.habitMerge;
      }

      // If AI didn't provide a title, but provided a short text, use it as title
      if (!payload.task!.title && parsed.title) payload.task!.title = String(parsed.title).trim();
      if (!payload.task!.title && parsed.summary) payload.task!.title = String(parsed.summary).slice(0, 200);
      if (!payload.task!.title && transcript) payload.task!.title = transcript.slice(0, 140);

      // --- Sanitize description: remove trailing scheduling sentences and noisy fragments ---
      if (payload.task!.description) {
        let d = String(payload.task!.description).trim();
        // Remove segments that start with common segue phrases indicating scheduling/details rather than description
        // e.g. "Công việc này sẽ ...", "Bạn muốn ...", "Bạn sẽ ..." etc.
        d = d.replace(/\b(Công việc này|Bạn muốn|Bạn sẽ|Công việc này sẽ|Bạn cần)\b[\s\S]*$/i, '').trim();
        // Remove any trailing sentence that contains explicit date/time patterns (dd/mm/yyyy or HH:MM or 'ngày' 'giờ')
        d = d.replace(/([.?!]\s*)(?=[^\n]*\d{1,2}\/\d{1,2}\/\d{4}|[0-2]?\d[:h]\d{2}|ngày|giờ)[\s\S]*$/i, '').trim();
        // If description now empty, clear it
        if (!d) delete payload.task!['description'];
        else {
          // limit length and avoid identical to title
          d = d.slice(0, 300).trim();
          if (payload.task!.title && String(payload.task!.title).trim() === d) {
            delete payload.task!['description'];
          } else {
            payload.task!.description = d;
          }
        }
      }
      // --- end sanitize ---

      setTranscript(text);
      onParsed(payload);
    } catch (err: any) {
      console.error('Process error (task)', err);
      Alert.alert('Lỗi', err?.message || 'Không thể phân tích. Vui lòng thử lại.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Heuristic parser for Vietnamese short commands like "Gặp khách hàng, thứ 3 lúc 14:00, nhắc 30 phút trước, lặp hàng tuần"
  function parseTaskFromFreeText(src: string): { startAt?: number; endAt?: number; reminderMinutes?: number | null; recurrence?: any } {
    const out: any = { reminderMinutes: null, recurrence: null };
    const s = src.toLowerCase();

    // weekday: match 'thứ 2' .. 'thứ 7' or 'thứ hai' etc., and 'cn' / 'chủ nhật'
    const weekdayMap: Record<string, number> = {
      'thứ 2': 1, 'thu 2': 1, 'thứ 3': 2, 'thu 3': 2, 'thứ 4': 3, 'thu 4': 3,
      'thứ 5': 4, 'thu 5': 4, 'thứ 6': 5, 'thu 6': 5, 'thứ 7': 6, 'thu 7': 6,
      'thứ 8': 0, // unlikely
      'chủ nhật': 0, 'chu nhat': 0, 'cn': 0,
    };
    let foundWeekday: number | null = null;
    for (const k of Object.keys(weekdayMap)) {
      if (s.includes(k)) { foundWeekday = weekdayMap[k]; break; }
    }

    // time patterns: HH:MM or H giờ MM hoặc H giờ
    let hour: number | null = null, minute: number | null = 0;
    const timeMatch = s.match(/(\d{1,2})\s*[:h giờH]\s*(\d{1,2})?/i) || s.match(/(\d{1,2})h(?:\s*(\d{1,2}))?/i) || s.match(/(\d{1,2})\:(\d{2})/);
    if (timeMatch) {
      hour = Number(timeMatch[1]);
      if (timeMatch[2]) minute = Number(timeMatch[2]);
      if (isNaN(hour)) hour = null;
      if (isNaN(minute as number)) minute = 0;
    }

    // reminder: 'nhắc 30 phút' or 'nhắc 30 phút trước'
    const remMatch = s.match(/nhắc\s*(?:trước\s*)?(\d{1,4})\s*phút/);
    if (remMatch) {
      out.reminderMinutes = Number(remMatch[1]);
    }

    // recurrence: weekly/daily/monthly/yearly
    let recurrence: any = null;
    if (/hàng tuần|mỗi tuần|tuần|hằng tuần/i.test(s)) {
      recurrence = { enabled: true, frequency: 'weekly', interval: 1 };
      // try include weekday key in daysOfWeek using TaskModal mapping: Mon/Tue/... based on foundWeekday
      const dowNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      if (foundWeekday !== null) {
        recurrence.daysOfWeek = [dowNames[foundWeekday]];
      }
    } else if (/hàng ngày|mỗi ngày|ngày/i.test(s)) {
      recurrence = { enabled: true, frequency: 'daily', interval: 1 };
    } else if (/hàng tháng|mỗi tháng|tháng/i.test(s)) {
      recurrence = { enabled: true, frequency: 'monthly', interval: 1 };
    } else if (/hàng năm|mỗi năm|năm/i.test(s)) {
      recurrence = { enabled: true, frequency: 'yearly', interval: 1 };
    }

    // compute next date for found weekday + time
    const now = new Date();
    let startAt: number | undefined;
    if (foundWeekday !== null || hour !== null) {
      let target = new Date(now.getTime());
      if (foundWeekday !== null) {
        // JS: 0=Sun..6=Sat, our map uses same
        const targetDow = foundWeekday;
        const delta = (targetDow - target.getDay() + 7) % 7 || 7; // next occurrence (not today)
        target.setDate(target.getDate() + delta);
      }
      if (hour !== null) {
        target.setHours(hour, minute ?? 0, 0, 0);
        // if we matched weekday and delta computed as 7 when same day, we already moved to next; if not weekday, ensure time in future
        if (foundWeekday === null && target.getTime() <= now.getTime()) {
          // schedule for next day
          target.setDate(target.getDate() + 1);
        }
      }
      startAt = target.getTime();
    }

    // default end at +1h if startAt
    let endAt: number | undefined;
    if (startAt) endAt = startAt + 60 * 60 * 1000;

    if (recurrence) out.recurrence = recurrence;
    if (startAt) out.startAt = startAt;
    if (endAt) out.endAt = endAt;

    return out;
  }

  const handleOpenInput = () => {
    setTempInput('');
    setShowInputModal(true);
  };

  const handleSubmit = async () => {
    if (!tempInput.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập mô tả công việc');
      return;
    }
    setShowInputModal(false);
    setTranscript(tempInput);
    await handleProcess(tempInput);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={[styles.button, isProcessing && styles.buttonDisabled]}
          onPress={handleOpenInput}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.buttonIcon}>✨</Text>
              <Text style={styles.buttonText}>Thêm công việc bằng AI</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.micButton, (isRecording ? styles.micButtonActive : {}), (!voiceAvailable || isProcessing) ? styles.micButtonDisabled : {}]}
          onPress={() => { if (isRecording) stopRecording(); else startRecording(); }}
          disabled={!voiceAvailable || isProcessing}
        >
          {isRecording ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.micIcon}>🎤</Text>
          )}
        </TouchableOpacity>
      </View>

      {isRecording ? (
        <View style={[styles.transcriptBox, { backgroundColor: '#fff3f3', borderColor: '#ff5252' }]}> 
          <Text style={[styles.transcriptLabel, { color: '#b71c1c' }]}>🔴 Đang ghi âm...</Text>
          <Text style={[styles.transcriptText, { color: '#b71c1c' }]}>Nói để thêm công việc — quá trình sẽ tự động phân tích khi dừng.</Text>
        </View>
      ) : transcript ? (
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptLabel}>✅ Đã phân tích:</Text>
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      ) : null}

      <Modal
        visible={showInputModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInputModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nhập mô tả công việc</Text>
              <TouchableOpacity onPress={() => setShowInputModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.textInput}
              placeholder="VD: Gặp khách hàng, thứ 3 lúc 14:00, nhắc 30 phút trước, lặp hàng tuần"
              placeholderTextColor="#999"
              value={tempInput}
              onChangeText={setTempInput}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowInputModal(false)}
              >
                <Text style={styles.cancelButtonText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleSubmit}
              >
                <Text style={styles.submitButtonText}>Phân tích</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 8,
    padding: 8,
    width: '100%'
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-between',
    gap: 8,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    elevation: 2,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  micButton: {
    marginLeft: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#34C759',
    elevation: 2,
  },
  micButtonActive: {
    backgroundColor: '#E53935',
  },
  micButtonDisabled: {
    backgroundColor: '#999',
  },
  micIcon: {
    fontSize: 18,
    color: '#fff',
  },
  transcriptBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 6,
    width: '100%',
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  transcriptLabel: {
    fontSize: 11,
    color: '#2e7d32',
    marginBottom: 4,
    fontWeight: '600',
  },
  transcriptText: {
    fontSize: 13,
    color: '#1b5e20',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    maxHeight: '80%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 100,
    backgroundColor: '#fafafa',
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 15,
  },
  submitButton: {
    backgroundColor: '#007AFF',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
