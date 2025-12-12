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
import axios from 'axios';

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
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
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
    // Check mic permission status on Android to avoid re-prompting if already granted
    (async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          setHasMicPermission(granted);
        } catch {
          setHasMicPermission(null);
        }
      }
    })();
    return () => {
      try {
        if (VoiceRef.current && VoiceRef.current.destroy) VoiceRef.current.destroy();
      } catch {}
    };
  }, []);

  const requestAndroidRecordPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      // First check current status to avoid asking again unnecessarily
      const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (already) {
        setHasMicPermission(true);
        return true;
      }
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Quyền ghi âm',
        message: 'Ứng dụng cần quyền ghi âm để nhận diện giọng nói',
        buttonPositive: 'Cho phép',
        buttonNegative: 'Hủy',
      });
      const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
      setHasMicPermission(ok);
      return ok;
    } catch (err) {
      setHasMicPermission(false);
      return false;
    }
  };

  const onSpeechResults = (e: any) => {
    try {
      const parts = e?.value || e?.results || [];
      const text = Array.isArray(parts) ? parts.join(' ') : String(parts || '');
      // Do not auto-analyze; show full transcript in the input modal for user confirmation
      setTranscript(text);
      setTempInput(text);
      setShowInputModal(true);
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
      if (V && V.onSpeechEnd) V.onSpeechEnd = () => setIsRecording(false);
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
      // Local Gemini caller for task parsing (no external import)
      const parseTaskWithGemini = async (prompt: string): Promise<any> => {
        const GEMINI_API_KEY = String(process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "");
        if (!GEMINI_API_KEY) {
          throw new Error('Thiếu khóa Gemini. Hãy đặt EXPO_PUBLIC_GEMINI_API_KEY trong môi trường.');
        }
        const MODEL = 'gemini-2.0-flash';
        try { console.log('[AI] Sending prompt:', prompt); } catch {}
        const resp = await axios.post(
          `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
          {
            contents: [
              { parts: [ { text: prompt } ] }
            ],
            generationConfig: { temperature: 0.1, maxOutputTokens: 700 },
          }
        );
        const textOut: string = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        try { console.log('[AI] Raw response text:', textOut); } catch {}
        const jsonStr = textOut.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        try {
          const parsed = JSON.parse(jsonStr);
          try { console.log('[AI] Parsed JSON:', parsed); } catch {}
          return parsed;
        } catch (e) {
          try { console.warn('[AI] JSON parse failed. Raw string:', jsonStr); } catch {}
          throw new Error('AI trả về không đúng JSON.');
        }
      };
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
        const vRaw = String(t).trim().toLowerCase();
        // normalize common variants
        let v = vRaw
          .replace(/chủ nhật|chu nhat/g, "cn")
          .replace(/thứ|thu/g, "t");
        // accept single digits 2..7
        if (v === "2" || v === "t2") return "Mon";
        if (v === "3" || v === "t3") return "Tue";
        if (v === "4" || v === "t4") return "Wed";
        if (v === "5" || v === "t5") return "Thu";
        if (v === "6" || v === "t6") return "Fri";
        if (v === "7" || v === "t7") return "Sat";
        if (v === "cn" || v.includes("cn")) return "Sun";
        // english fallbacks
        if (v.includes("mon")) return "Mon";
        if (v.includes("tue")) return "Tue";
        if (v.includes("wed")) return "Wed";
        if (v.includes("thu") && !v.includes("thur")) return "Thu"; // handle overlap with từ/thu
        if (v.includes("fri")) return "Fri";
        if (v.includes("sat")) return "Sat";
        if (v.includes("sun")) return "Sun";
        return null;
      };
      const parseDowsFromString = (s: any): string[] => {
        if (!s) return [];
        const out: string[] = [];
        const pushToken = (tok: string) => {
          const mapped = mapDowToken(tok);
          if (mapped && !out.includes(mapped)) out.push(mapped);
        };
        if (Array.isArray(s)) {
          (s as any[]).forEach((item) => {
            if (typeof item === "string") {
              // tokenize strings inside arrays as well (e.g., "T2 T4")
              const v = item.toLowerCase();
              // special case: compact digits like "234"
              if (/^[234567]+$/.test(v)) v.split("").forEach(pushToken);
              else v.split(/[^a-z0-9]+/g).filter(Boolean).forEach(pushToken);
            } else pushToken(String(item));
          });
          return out;
        }
        const v0 = String(s).toLowerCase().trim()
          .replace(/chủ nhật|chu nhat/g, "cn")
          .replace(/và|&/g, ",")
          .replace(/[\/;\-]/g, ",")
          .replace(/\s+/g, ",")
          .replace(/thứ|thu/g, "t");
        if (/^[234567]+$/.test(v0)) {
          v0.split("").forEach(pushToken);
        } else {
          v0.split(/,+/).filter(Boolean).forEach((tok) => {
            if (/^[234567]$/.test(tok)) pushToken(tok);
            else pushToken(tok);
          });
        }
        return out;
      };
      const parseDomFromString = (s: any): string[] => {
        if (!s) return [];
        const push = (arr: string[], val: string) => { if (!arr.includes(val)) arr.push(val); };
        if (Array.isArray(s)) return (s as any[]).reduce<string[]>((acc, it) => {
          const v = String(it).trim();
          // extract all 1..31 numbers from token
          const m = v.match(/\b(3[01]|[12]?\d)\b/g);
          if (m) m.forEach((d) => push(acc, String(Number(d))));
          else if (/^\d+$/.test(v)) push(acc, String(Math.min(31, Math.max(1, Number(v)))));
          return acc;
        }, []);
        const v = String(s).toLowerCase();
        const matches = v.match(/\b(3[01]|[12]?\d)\b/g) || [];
        const result: string[] = [];
        matches.forEach((d) => push(result, String(Number(d))));
        return result;
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

      // Build strict task prompt and include today's markers for resolving relative dates
      const todayISO = new Date().toISOString().split('T')[0];
      const todayHuman = new Date().toLocaleDateString('vi-VN');
      const composedText = `${text}\n\nHIDDEN_TODAY_ISO: ${todayISO}\nHIDDEN_TODAY_HUMAN: ${todayHuman}`;
      const fullTaskPrompt = `Bạn là trợ lý phân tích cho MODAL THÊM CÔNG VIỆC dưới đây. Các trường thực tế người dùng có trong giao diện:
1. Tiêu đề (title)
2. Mô tả (description)
3. Ngày bắt đầu (date) + Giờ bắt đầu (time)
4. Giờ kết thúc (end time) hoặc ngày+giờ kết thúc nếu được nói rõ
5. Mức độ ưu tiên: thấp | trung bình | cao (map sang low | medium | high)
6. Nhắc trước (reminder): bật/tắt + số phút trước (5,15,30,60,120,1440, hoặc người dùng nói "39 phút", "2 giờ", "1 ngày", "2 ngày" v.v.) + phương thức ("chuông" => alarm, mặc định notification)
7. Lặp lại (recurrence): bật/tắt + kiểu (ngày/tuần/tháng/năm) => daily/weekly/monthly/yearly + interval nếu nói "mỗi 2 tuần", "3 tháng một lần" (interval=2,3 ...). Nếu tuần và nói cụ thể thứ thì trả về daysOfWeek array (Mon..Sun). Nếu tháng và nói "ngày 5,10" thì trả về daysOfMonth ["5","10"].
8. Ngày kết thúc lặp (recurrence end date) nếu nói rõ ("đến hết tháng 12", "đến ngày 25/12/2025"). Nếu nói "đến hết năm 2026" đặt endDateMs = cuối ngày 31/12/2026.
9. Tùy chọn "Gộp các ngày lặp thành một lần hoàn thành" => habitMerge true/false nếu người dùng nói "gộp", "tính một lần", "gom lại".
10. Tùy chọn "Tự động đánh hoàn thành nếu hết hạn" => habitAuto true/false nếu người dùng nói "tự động hoàn thành", "hết hạn tự đánh xong", hoặc "không tự động" => false.

Bạn PHẢI TRẢ VỀ CHỈ JSON theo schema sau (đầy đủ khóa, dùng null khi không có):
{
  "title": string | null,
  "description": string | null,
  "startAtMs": number | null,
  "endAtMs": number | null,
  "startDate": string | null,      // YYYY-MM-DD nếu chỉ có ngày
  "startTime": string | null,      // HH:mm nếu chỉ có giờ
  "endDate": string | null,
  "endTime": string | null,
  "priority": "high" | "medium" | "low" | null,
  "reminder": {
    "enabled": boolean,
    // minutesBefore là tổng phút trước (chuyển mọi đơn vị giờ/ngày sang phút). VD "2 giờ" => 120, "1 ngày" => 1440
    "minutesBefore": number | null,
    "method": "notification" | "alarm" | null
  },
  "recurrence": {
    "enabled": boolean,
    "frequency": "daily" | "weekly" | "monthly" | "yearly" | null,
    "interval": number | null,
    "daysOfWeek": ("Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun")[] | null,
    "daysOfMonth": string[] | null,
    "endDateMs": number | null,
    "habitMerge": boolean | null
  },
  "habitMerge": boolean | null,
  "habitAuto": boolean | null
}

QUY TẮC:
- Không tự suy diễn. Chỉ điền khi người dùng nói rõ. Nếu không nhắc tới REMINDER hoặc LẶP thì đặt reminder.enabled=false, recurrence.enabled=false.
- Nếu chỉ nói "14:00" và không có ngày, cố gắng dùng ngày hôm nay (HIDDEN_TODAY_ISO) làm startDate + tạo startAtMs nếu cả giờ và ngày có. Nếu chỉ có ngày mà không có giờ, trả về startDate, startTime=null.
- Nếu nói "kết thúc lúc 16:00" cùng ngày => endAtMs dùng cùng ngày với startDate. Nếu nói "đến ngày mai 10 giờ" => tạo endAtMs từ ngày mai + 10:00.
- Nếu khoảng giờ nói như "14:00-16:00" => startTime=14:00, endTime=16:00 và nếu có ngày thì tạo startAtMs/endAtMs.
- Ưu tiên: "cao" => high, "trung bình" => medium, "thấp" => low.
- Reminder diễn đạt ví dụ: "nhắc 30 phút trước" => reminder.enabled=true, minutesBefore=30. "nhắc 2 giờ trước" => 120. "nhắc 1 ngày trước" => 1440.
- Nếu nói "chuông" hoặc "chuông báo" => method="alarm"; nếu chỉ nói "nhắc" không có chuông => method="notification".
- Recurrence: "hàng ngày" => daily interval=1; "mỗi 2 tuần" => weekly interval=2; "3 tháng một lần" => monthly interval=3. Nếu nói "thứ 2 và thứ 4" => daysOfWeek=["Mon","Wed"]. Nếu nói "ngày 5,10" trong ngữ cảnh tháng => daysOfMonth=["5","10"].
- Ngày kết thúc lặp: chuyển lời nói thành endDateMs bằng epoch millis cuối ngày đó (23:59). "đến hết tháng 12" (trong năm hiện tại) => 31/12 (năm hiện tại) 23:59.
- habitMerge: nếu có từ khóa "gộp", "gom", "tính một lần" => true.
- habitAuto: nếu có từ khóa "tự động hoàn thành", "hết hạn tự đánh xong" => true; "không tự động" => false; nếu không nói => null.
- Luôn trả về tất cả khóa (dùng null) để UI dễ mapping. Không bỏ sót.
- HIDDEN_TODAY_ISO và HIDDEN_TODAY_HUMAN cung cấp ngày hôm nay để hiểu "hôm nay", "mai", "tuần này", "tháng này".

CHỈ JSON, KHÔNG GIẢI THÍCH:
VĂN BẢN GỐC:
"${composedText}"`;
  const parsedAny: any = await parseTaskWithGemini(fullTaskPrompt);
  try { console.log('[AI] Parsed Any (before mapping):', parsedAny); } catch {}
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
  // Only use explicitly provided title; do not infer from other fields

      if (parsed.description) payload.task!.description = String(parsed.description).trim();
  // Only use explicitly provided description; do not infer

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

  // Also accept separate date-only / time-only pieces if AI provided them
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

      // CONSISTENCY OVERRIDE (epoch vs textual pieces)
      // If AI supplied both date + time pieces AND an epoch (start_at) that disagrees by calendar day
      // or drifts >= 30 minutes, prefer the recomputed epoch from pieces. This fixes cases where
      // startAtMs comes back (e.g. 2024) but startDate/startTime indicate another date (e.g. 2025 09:00).
      const recomputedStart = (maybeStartDateOnly && maybeStartTimeOnly)
        ? combineDateTime(maybeStartDateOnly, maybeStartTimeOnly)
        : undefined;
      if (recomputedStart && payload.task!.start_at) {
        try {
          const original = new Date(payload.task!.start_at);
          const recomputed = new Date(recomputedStart);
          const calendarMismatch = original.getFullYear() !== recomputed.getFullYear() || original.getMonth() !== recomputed.getMonth() || original.getDate() !== recomputed.getDate();
          const diffMinutes = Math.abs(payload.task!.start_at - recomputedStart) / 60000;
          if (calendarMismatch || diffMinutes >= 30) {
            console.log('[AI] Consistency override start_at. originalEpoch:', payload.task!.start_at, '-> recomputedFromPieces:', recomputedStart, 'calendarMismatch?', calendarMismatch, 'diffMinutes:', diffMinutes);
            payload.task!.start_at = recomputedStart;
          }
        } catch (e) { console.warn('[AI] start override error', e); }
      } else if (recomputedStart && !payload.task!.start_at) {
        // If we never set start_at from epoch but have pieces, set it now.
        payload.task!.start_at = recomputedStart;
        try { console.log('[AI] Applied start_at from pieces (no epoch provided):', recomputedStart); } catch {}
      }

      // Attempt to compute end from pieces; if only end time but no end date given, assume same date as start.
      const recomputedEnd = (() => {
        if (maybeEndDateOnly && maybeEndTimeOnly) return combineDateTime(maybeEndDateOnly, maybeEndTimeOnly);
        if (!maybeEndDateOnly && maybeStartDateOnly && maybeEndTimeOnly) return combineDateTime(maybeStartDateOnly, maybeEndTimeOnly);
        return undefined;
      })();
      if (recomputedEnd && payload.task!.end_at) {
        try {
          const originalE = new Date(payload.task!.end_at);
          const recomputedE = new Date(recomputedEnd);
          const calendarMismatchE = originalE.getFullYear() !== recomputedE.getFullYear() || originalE.getMonth() !== recomputedE.getMonth() || originalE.getDate() !== recomputedE.getDate();
          const diffMinutesE = Math.abs(payload.task!.end_at - recomputedEnd) / 60000;
          if (calendarMismatchE || diffMinutesE >= 30) {
            console.log('[AI] Consistency override end_at. originalEpoch:', payload.task!.end_at, '-> recomputedFromPieces:', recomputedEnd, 'calendarMismatch?', calendarMismatchE, 'diffMinutes:', diffMinutesE);
            payload.task!.end_at = recomputedEnd;
          }
        } catch (e) { console.warn('[AI] end override error', e); }
      } else if (recomputedEnd && !payload.task!.end_at) {
        payload.task!.end_at = recomputedEnd;
        try { console.log('[AI] Applied end_at from pieces (no epoch provided):', recomputedEnd); } catch {}
      }

      // Expose end date only piece if present (parallel to startDateOnly)
      if (maybeEndDateOnly) payload.task!['endDateOnly'] = maybeEndDateOnly;

      // No heuristic fallback: do not parse from raw text

      // No extra heuristics from free text

      // Priority / status (try normalized values from parsed data)
      const p = mapPriority(parsed.priority || parsed.priorityLevel || parsed.level || parsed.urgency || parsed.importance);
      if (p) payload.task!.priority = p;
      const st = mapStatus(parsed.status || parsed.state || parsed.statusText);
      if (st) payload.task!.status = st;

      // Reminder: use only AI-structured values. Do not infer from plain text.
      if (parsed.reminder && typeof parsed.reminder === "object") {
        const r = parsed.reminder;
        const minutes = r?.minutesBefore ?? r?.minutes ?? r?.time ?? null;
        const method = r?.method ?? r?.type ?? null;
        payload.reminder.time = minutes != null ? Number(minutes) : undefined;
        if (method) payload.reminder.method = mapMethod(method) ?? "notification";
        if (typeof r.enabled === 'boolean') payload.reminder.enabled = !!r.enabled;
      }
      if (parsed.reminderEnabled === true || parsed.reminderEnabled === false) {
        payload.reminder.enabled = !!parsed.reminderEnabled;
      }
      if (parsed.reminderMinutes != null) payload.reminder.time = Number(parsed.reminderMinutes);
      if (parsed.reminderMethod) payload.reminder.method = mapMethod(parsed.reminderMethod) ?? payload.reminder.method;

      // Recurrence: try to map common props and detect interval/period keywords
      // Recurrence: prefer strict parser shape (frequency, interval, daysOfWeek, daysOfMonth, endDateMs)
      if (parsed.recurrence && typeof parsed.recurrence === "object") {
         const rec = parsed.recurrence;
         const rc: RecurrenceConfig = { enabled: false };
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
         if (typeof rec.enabled === 'boolean') rc.enabled = !!rec.enabled;
         if (!rc.interval) rc.interval = 1;
         payload.recurrence = rc;
       }

      // Habit flags: only accept explicit AI booleans
      if (parsed.habitMerge === true || parsed.habitMerge === false) {
        payload.task!['habitMerge'] = parsed.habitMerge;
      }
      if (parsed.habitAuto === true || parsed.habitAuto === false) {
        (payload as any).habitAuto = parsed.habitAuto;
        (payload.task as any).habitAuto = parsed.habitAuto;
      }

      // If AI didn't provide a title, but provided a short text, use it as title
  // Do not infer title from summary/transcript

      // Do not sanitize or infer anything from free text

  setTranscript(text);
  try { console.log('[AI] Final payload to modal:', payload); } catch {}
  onParsed(payload);
    } catch (err: any) {
      console.error('Process error (task)', err);
      Alert.alert('Lỗi', err?.message || 'Không thể phân tích. Vui lòng thử lại.');
    } finally {
      setIsProcessing(false);
    }
  };

  // No heuristic parser; rely strictly on AI structured fields

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
            placeholder="VD: Chuẩn bị báo cáo tiến độ tuần — bắt đầu 09:00, kết thúc 11:30 ngày 15/11, ưu tiên cao, nhắc 40 phút trước, lặp hàng tháng, tự động hoàn thành."
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
