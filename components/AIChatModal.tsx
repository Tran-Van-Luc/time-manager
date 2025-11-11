import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLanguage } from '../context/LanguageContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  initialPrompt?: string;
};

// Component này tự động đọc API key từ biến môi trường
export default function AIChatModal({ visible, onClose, initialPrompt }: Props) {
  const { language, t } = useLanguage();
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const [expandedMessages, setExpandedMessages] = useState<Record<number, boolean>>({});
  const [input, setInput] = useState(''); // <-- Luôn bắt đầu rỗng
  const [inputHeight, setInputHeight] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!visible) return;

    // Nếu có tin nhắn ban đầu
    if (initialPrompt) {
      // 1. Hiển thị tin nhắn của người dùng
      setMessages([{ role: 'user', text: initialPrompt }]);
      // reset expanded state (only first message may be expandable)
      setExpandedMessages({});
      // 2. Xóa ô nhập liệu
      setInput(''); 
      
      // 3. Tự động gọi API để lấy câu trả lời
      const triggerInitialSend = async () => {
        const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
        if (!apiKey) {
          append(
            'model',
            language === 'en'
              ? 'Error: API key not found. Please configure EXPO_PUBLIC_GEMINI_API_KEY in your .env and restart the app.'
              : 'Lỗi: Không tìm thấy API Key. Vui lòng cấu hình file .env (ví dụ: EXPO_PUBLIC_GEMINI_API_KEY) và khởi động lại ứng dụng.'
          );
          return;
        }

        setLoading(true);
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

          // Vì đây là tin nhắn ĐẦU TIÊN, lịch sử trò chuyện (contents) rỗng
          // Chúng ta chỉ gửi tin nhắn ban đầu
          const contents = [
            {
              role: 'user',
              parts: [{ text: initialPrompt }]
            }
          ];
          const body = { contents };

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          const rawText = await res.text();
          console.log('--- API Response (Initial) ---');
          console.log('Status Code:', res.status);
          console.log('Raw Response Body:', rawText);
          console.log('--------------------');

          if (!rawText) throw new Error('API trả về phản hồi trống.');
          
          let json;
          try {
            json = JSON.parse(rawText);
          } catch (parseError) {
            throw new Error(`Lỗi phân tích JSON. Phản hồi thô nhận được: ${rawText}`);
          }

          if (!res.ok) {
            const errorMessage = json?.error?.message || rawText;
            throw new Error(errorMessage);
          }

          const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text || 'Không nhận được phản hồi hợp lệ từ AI.';
          append('model', reply);

        } catch (e: any) {
          append('model', language === 'en' ? `API Error: ${String(e?.message || e)}` : `Lỗi API: ${String(e?.message || e)}`);
          console.error('API error details:', e);
        } finally {
          setLoading(false);
        }
      };
      
      triggerInitialSend(); // <-- Gọi hàm vừa định nghĩa
      
    } else {
      // Nếu không có tin nhắn ban đầu, chỉ reset
      setMessages([]);
      setInput('');
      setExpandedMessages({});
    }
  }, [visible, initialPrompt]); // <-- Chạy lại khi các prop này thay đổi

  const append = (role: 'user' | 'model', text: string) => {
    // sanitize AI model text to remove markdown asterisks/bullets if present
    const sanitizeAIResponse = (t: string) => {
      try {
        // Replace markdown list asterisks at line starts with a dash for readability
        t = t.replace(/^\s*\*\s+/gm, '- ');
        // Remove emphasis/bold markers like *text* or **text** or ***text***
        t = t.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
      } catch (e) {
        // fallback: return original
      }
      return t;
    };

    const finalText = role === 'model' ? sanitizeAIResponse(text) : text;
    setMessages((s) => [...s, { role, text: finalText }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Hàm 'send' này giờ chỉ dùng khi người dùng tự bấm nút
  const send = async () => {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    const currentInput = input.trim();

    if (!currentInput) return;
    if (!apiKey) {
      append(
        'model',
        language === 'en'
          ? 'Error: API key not found. Please configure EXPO_PUBLIC_GEMINI_API_KEY in your .env and restart the app.'
          : 'Lỗi: Không tìm thấy API Key. Vui lòng cấu hình file .env (ví dụ: EXPO_PUBLIC_GEMINI_API_KEY) và khởi động lại ứng dụng.'
      );
      return;
    }

    append('user', currentInput);
    setInput('');
    setLoading(true);

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      // Lấy toàn bộ lịch sử trò chuyện (bao gồm cả tin nhắn ban đầu nếu có)
      const contents = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));
      
      // Thêm tin nhắn MỚI NHẤT (mà người dùng vừa gõ)
      contents.push({
          role: 'user',
          parts: [{ text: currentInput }]
      });

      const body = { contents };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const rawText = await res.text();
      console.log('--- API Response (Manual) ---');
      console.log('Status Code:', res.status);
      console.log('Raw Response Body:', rawText);
      console.log('--------------------');


      if (!rawText) {
        throw new Error('API trả về phản hồi trống.');
      }

      let json;
      try {
        json = JSON.parse(rawText);
      } catch (parseError) {
        throw new Error(`Lỗi phân tích JSON. Phản hồi thô nhận được: ${rawText}`);
      }


      if (!res.ok) {
        const errorMessage = json?.error?.message || rawText;
        throw new Error(errorMessage);
      }

      const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text || 'Không nhận được phản hồi hợp lệ từ AI.';
      append('model', reply);

    } catch (e: any) {
      append('model', language === 'en' ? `API Error: ${String(e?.message || e)}` : `Lỗi API: ${String(e?.message || e)}`);
      console.error('API error details:', e);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setMessages([]);
    setInput('');
  };

  // --- Giao diện Modal (không đổi) ---
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, padding: 12, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>{language === 'en' ? 'AI Chat' : 'AI Chat'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Small info badge: shows that conversation will be cleared after leaving */}
            <TouchableOpacity
              onPress={() => Alert.alert(language === 'en' ? 'Note' : 'Lưu ý', language === 'en' ? 'Conversation will be cleared after you leave this chat.' : 'Cuộc trò chuyện sẽ bị xóa sau khi bạn rời khỏi đoạn chat này.')}
              activeOpacity={0.8}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#f59e0b',
                backgroundColor: 'transparent',
                marginRight: 8,
              }}
            >
              <Text style={{ color: '#f59e0b', fontWeight: '800' }}>!</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={clear}
              activeOpacity={0.8}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#ef4444',
                backgroundColor: 'transparent',
                marginRight: 8,
              }}
            >
              <Text style={{ color: '#ef4444', fontWeight: '700' }}>{language === 'en' ? 'Clear' : 'Xóa'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.9}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: '#2563EB',
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{language === 'en' ? 'Close' : 'Đóng'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1, marginBottom: 8, borderWidth: 1, borderColor: '#eee', borderRadius: 6, padding: 8 }} contentContainerStyle={{ paddingBottom: 20 }}>
          {messages.map((m, i) => {
            // Render message text line-by-line; optionally highlight leading numbered prefixes (e.g. "1.") in red
            const renderLines = (text: string, highlightNumbers: boolean) => {
              const lines = String(text).split('\n');
              return lines.map((line, li) => {
                const match = line.match(/^\s*(\d+)\.\s*(.*)$/);
                if (match) {
                  const number = match[1];
                  const rest = match[2];
                  if (highlightNumbers) {
                    return (
                      <Text key={`l-${i}-${li}`} style={{ marginBottom: li === lines.length - 1 ? 0 : 4 }}>
                        <Text style={{ color: '#ef4444', fontWeight: '700' }}>{number + '. '}</Text>
                        <Text>{rest}</Text>
                      </Text>
                    );
                  }
                  return (
                    <Text key={`l-${i}-${li}`} style={{ marginBottom: li === lines.length - 1 ? 0 : 4 }}>{number + '. ' + rest}</Text>
                  );
                }
                return (
                  <Text key={`l-${i}-${li}`} style={{ marginBottom: li === lines.length - 1 ? 0 : 4 }}>{line}</Text>
                );
              });
            };

            const isUser = m.role === 'user';
            const fullText = String(m.text || '');
            const fullLines = fullText.split('\n');
            const lineLimit = 6; // show up to 6 lines before truncating
            const charLimit = 600; // safety fallback
            const isLong = fullLines.length > lineLimit || fullText.length > charLimit;
            const expanded = !!expandedMessages[i];
            // Only allow truncation & toggle for the very first prompt (index 0)
            const shouldTruncate = isUser && isLong && i === 0 && !expanded;
            const shownText = shouldTruncate ? fullLines.slice(0, lineLimit).join('\n') : fullText;

            const toggleExpanded = () =>
              setExpandedMessages((s) => ({ ...s, [i]: !s[i] }));

            return (
              <View key={i} style={{ marginBottom: 12, alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
                <Text style={{ fontWeight: '700', color: isUser ? '#0b5cff' : '#0b8a44' }}>{isUser ? (language === 'en' ? 'You' : 'Bạn') : 'AI'}</Text>
                <View style={{
                  backgroundColor: isUser ? '#eef2ff' : '#f0fdf4',
                  padding: 10,
                  borderRadius: 8,
                  marginTop: 4,
                  maxWidth: '90%',
                }}>
                  {renderLines(shownText, isUser)}
                  {isUser && isLong && i === 0 ? (
                    <TouchableOpacity onPress={toggleExpanded} style={{ marginTop: 8 }}>
                      <Text style={{ color: '#2563EB', fontWeight: '700' }}>
                        {expanded
                          ? language === 'en'
                            ? 'Collapse'
                            : 'Thu gọn'
                          : language === 'en'
                          ? 'Show more'
                          : 'Xem thêm'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })}
          {loading && (
            <View style={{ paddingVertical: 8, alignItems: 'flex-start' }}>
              <ActivityIndicator />
            </View>
          )}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={language === 'en' ? 'Type your question...' : 'Gõ câu hỏi của bạn...'}
            multiline
            // limit visual height to ~5 lines; after that TextInput scrolls internally
            onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#ddd',
              padding: 10,
              borderRadius: 8,
              // enforce a max height (approx 5 lines). Use measured height when available.
              maxHeight: 120,
              height: Math.min(Math.max(40, inputHeight || 40), 120),
              textAlignVertical: 'top',
            }}
            scrollEnabled={true}
          />
          <TouchableOpacity onPress={send} disabled={loading} style={{ padding: 10, backgroundColor: '#2563EB', borderRadius: 8, opacity: loading ? 0.5 : 1 }}>
            <Text style={{ color: '#fff' }}>{loading ? '...' : (language === 'en' ? 'Send' : 'Gửi')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}