import axios from 'axios';

export interface ParsedScheduleData {
  courseName?: string;
  instructor?: string;
  location?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  singleDate?: string;
  startTime?: string;
  endTime?: string;
  dayOfWeek?: string;
}

// Lấy key từ biến môi trường (Expo / React Native: EXPO_PUBLIC_*)
const OPENAI_API_KEY = String(process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? "");
const GEMINI_API_KEY = String(process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "");

// Nếu muốn test mà không cần API, bật mock
const USE_MOCK_FOR_GEMINI = false; // đổi thành false khi đã có key và muốn gọi thật
const USE_MOCK_FOR_OPENAI = false; // đổi thành false khi đã có key và muốn gọi thật

export async function parseVoiceToSchedule(
  transcript: string
): Promise<ParsedScheduleData> {
  if (USE_MOCK_FOR_OPENAI) return mockParse(transcript);

  if (!OPENAI_API_KEY) {
    throw new Error("Missing OpenAI API key. Set EXPO_PUBLIC_OPENAI_API_KEY in your environment.");
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Bạn là trợ lý phân tích lịch học. Trích xuất thông tin từ câu nói thành JSON với các trường:
- courseName: Tên môn học
- instructor: Tên giảng viên (nếu có)
- location: Địa điểm (nếu có)
- type: Loại lịch ("Lịch học lý thuyết", "Lịch học thực hành", "Lịch thi", "Lịch học bù")
- startDate: YYYY-MM-DD (nếu là lịch định kỳ)
- endDate: YYYY-MM-DD (nếu là lịch định kỳ)
- singleDate: YYYY-MM-DD (nếu là lịch một lần)
- startTime: HH:mm
- endTime: HH:mm
- dayOfWeek: Thứ trong tuần (nếu được đề cập)

Trả về ONLY JSON, không có text khác.`,
          },
          {
            role: 'user',
            content: `Hôm nay là ${new Date().toLocaleDateString('vi-VN')}. Phân tích: "${transcript}"`,
          },
        ],
        temperature: 0.3,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    const content = response.data.choices[0].message.content;
    const parsed = JSON.parse(content);
    return parsed;
  } catch (error: any) {
    console.error('Parse error:', error.response?.data || error.message);
    throw new Error('Không thể phân tích giọng nói');
  }
}

// Alternative: Sử dụng Gemini API
export async function parseVoiceWithGemini(
  transcript: string
): Promise<ParsedScheduleData> {
  if (USE_MOCK_FOR_GEMINI) return mockParse(transcript);

  if (!GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key. Set EXPO_PUBLIC_GEMINI_API_KEY in your environment.");
  }

  const MODEL = 'gemini-2.5-flash';

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Bạn là trợ lý phân tích lịch học. Phân tích câu nói và trả về JSON.

CÁC TRƯỜNG CẦN TRÍCH XUẤT:
- courseName: Tên môn học
- instructor: Tên giảng viên (nếu có)
- location: Địa điểm (phòng học)
- type: Chọn CHÍNH XÁC 1 trong 4 giá trị:
  * "Lịch học lý thuyết"
  * "Lịch học thực hành"
  * "Lịch thi"
  * "Lịch học bù"
- startTime, endTime: Định dạng HH:mm
- Nếu là lịch định kỳ: startDate và endDate (YYYY-MM-DD)
- Nếu là lịch một lần: singleDate (YYYY-MM-DD)

QUY TẮC NGÀY THÁNG:
- Hôm nay: ${new Date().toISOString().split('T')[0]}
- "ngày mai" → +1 ngày
- "thứ 2" → thứ 2 tuần này
- "tuần sau" → +7 ngày

QUAN TRỌNG: Chỉ trả về JSON, KHÔNG có markdown hay text khác.

CÂU NÓI:
"${transcript}"`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      }
    );

    const text = response.data.candidates[0].content.parts[0].text;
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error: any) {
    console.error('Gemini parse error:', error.response?.data || error);
    if (error.response?.status === 400) {
      throw new Error('API Key không hợp lệ hoặc đã hết quota. Kiểm tra lại key.');
    }
    if (error.response?.status === 429) {
      throw new Error('Đã vượt giới hạn request. Vui lòng thử lại sau vài phút.');
    }
    if (error.message.includes('JSON')) {
      throw new Error('AI trả về format không đúng. Vui lòng thử mô tả chi tiết hơn.');
    }
    throw new Error(error.response?.data?.error?.message || 'Không thể phân tích giọng nói');
  }
}

// Mock function để test UI không cần API
function mockParse(transcript: string): ParsedScheduleData {
  console.log('Using MOCK mode for:', transcript);

  const lowerText = transcript.toLowerCase();
  const dates = extractDates(transcript);

  return {
    courseName: extractCourseName(transcript),
    type: lowerText.includes('thi') ? 'Lịch thi' :
          lowerText.includes('thực hành') || lowerText.includes('lab') ? 'Lịch học thực hành' :
          lowerText.includes('bù') ? 'Lịch học bù' : 'Lịch học lý thuyết',
    startTime: extractTime(transcript, 'start') || '07:00',
    endTime: extractTime(transcript, 'end') || '09:00',
    location: extractLocation(transcript),
    instructor: extractInstructor(transcript),
    ...dates
  };
}

function extractCourseName(text: string): string {
  let cleaned = text
    .replace(/^(học|môn|lịch)\s+/gi, '')
    .replace(/\s+(từ|ngày|tháng|thứ|giờ|phòng|lab|thầy|cô|giáo viên|gv)\s+.*/gi, '')
    .trim();

  const fromIndex = cleaned.toLowerCase().indexOf('từ ngày');
  if (fromIndex > 0) {
    cleaned = cleaned.substring(0, fromIndex).trim();
  }

  if (!cleaned) {
    const words = text.split(/\s+/);
    const stopWords = ['học', 'môn', 'lịch', 'thi', 'thực', 'hành', 'bù'];
    cleaned = words.find(w => !stopWords.includes(w.toLowerCase())) || 'Môn học';
  }

  console.log('Extracted course name:', cleaned);
  return cleaned;
}

function extractTime(text: string, type: 'start' | 'end'): string | undefined {
  const timeRegex = /(\d{1,2})[h:](\d{2})?/gi;
  const matches = [...text.matchAll(timeRegex)];
  if (matches.length === 0) return undefined;

  const idx = type === 'start' ? 0 : Math.min(1, matches.length - 1);
  const [_, hour, min] = matches[idx];
  const hh = String(Number(hour)).padStart(2, '0');
  const mm = String(min || '00').padStart(2, '0');
  return `${hh}:${mm}`;
}

function extractLocation(text: string): string | undefined {
  const match = text.match(/phòng\s+([A-Z0-9-\.]+)/i) || text.match(/lab\s+(\d+)/i);
  return match ? match[1] : undefined;
}

function extractInstructor(text: string): string | undefined {
  const match = text.match(/(?:thầy|cô|giáo viên|gv)\s+([^,]+)/i);
  return match ? match[1].trim() : undefined;
}

function extractDates(text: string): { startDate?: string; endDate?: string; singleDate?: string } {
  const lowerText = text.toLowerCase();

  const datePattern = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/g;
  const monthPattern = /(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*năm\s*(\d{4}))?/gi;

  const slashMatches = [...text.matchAll(datePattern)];
  const monthMatches = [...text.matchAll(monthPattern)];
  const allMatches = [...slashMatches, ...monthMatches];

  console.log('Date matches found:', allMatches);

  if (allMatches.length === 0) {
    if (lowerText.includes('thứ')) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        startDate: formatDate(startOfMonth),
        endDate: formatDate(endOfMonth)
      };
    }
    return { singleDate: formatDate(new Date()) };
  }

  const parsedDates = allMatches.map(m => {
    const day = parseInt(m[1]);
    const month = parseInt(m[2]) - 1;
    const year = m[3] ? parseInt(m[3]) : new Date().getFullYear();
    const date = new Date(year, month, day);
    console.log(`Parsed: ${m[0]} → ${formatDate(date)}`);
    return date;
  });

  const isRecurring = parsedDates.length >= 2 ||
                      lowerText.includes('đến') ||
                      lowerText.includes('tới') ||
                      lowerText.includes('thứ');

  if (isRecurring && parsedDates.length >= 1) {
    return {
      startDate: formatDate(parsedDates[0]),
      endDate: formatDate(parsedDates[1] || parsedDates[0])
    };
  } else {
    return { singleDate: formatDate(parsedDates[0]) };
  }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}