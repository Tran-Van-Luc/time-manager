import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  initialPrompt?: string;
};

// Component này tự động đọc API key từ biến môi trường
export default function AIChatModal({ visible, onClose, initialPrompt }: Props) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const [input, setInput] = useState(''); // <-- Luôn bắt đầu rỗng
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!visible) return;

    // Nếu có tin nhắn ban đầu
    if (initialPrompt) {
      // 1. Hiển thị tin nhắn của người dùng
      setMessages([{ role: 'user', text: initialPrompt }]);
      // 2. Xóa ô nhập liệu
      setInput(''); 
      
      // 3. Tự động gọi API để lấy câu trả lời
      const triggerInitialSend = async () => {
        const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
        if (!apiKey) {
          append('model', 'Lỗi: Không tìm thấy API Key. Vui lòng cấu hình file .env (ví dụ: EXPO_PUBLIC_GEMINI_API_KEY) và khởi động lại ứng dụng.');
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
          append('model', `Lỗi API: ${String(e?.message || e)}`);
          console.error("Lỗi chi tiết khi gọi API:", e);
        } finally {
          setLoading(false);
        }
      };
      
      triggerInitialSend(); // <-- Gọi hàm vừa định nghĩa
      
    } else {
      // Nếu không có tin nhắn ban đầu, chỉ reset
      setMessages([]);
      setInput('');
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
    const currentInput = input.trim(); // <-- Lấy từ ô input

    if (!currentInput) return; // <-- Kiểm tra input, không phải initialPrompt
    if (!apiKey) {
      append('model', 'Lỗi: Không tìm thấy API Key. Vui lòng cấu hình file .env (ví dụ: EXPO_PUBLIC_GEMINI_API_KEY) và khởi động lại ứng dụng.');
      return;
    }

    // Thêm tin nhắn MỚI của người dùng vào
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
      append('model', `Lỗi API: ${String(e?.message || e)}`);
      console.error("Lỗi chi tiết khi gọi API:", e);
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
          <Text style={{ fontSize: 18, fontWeight: '700' }}>AI Chat</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={clear} style={{ padding: 6 }}>
              <Text>Xóa</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Text>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1, marginBottom: 8, borderWidth: 1, borderColor: '#eee', borderRadius: 6, padding: 8 }} contentContainerStyle={{ paddingBottom: 20 }}>
          {messages.map((m, i) => (
            <View key={i} style={{ marginBottom: 12, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <Text style={{ fontWeight: '700', color: m.role === 'user' ? '#0b5cff' : '#0b8a44' }}>{m.role === 'user' ? 'Bạn' : 'AI'}</Text>
              <View style={{
                backgroundColor: m.role === 'user' ? '#eef2ff' : '#f0fdf4',
                padding: 10,
                borderRadius: 8,
                marginTop: 4,
                maxWidth: '90%',
              }}>
                <Text>{m.text}</Text>
              </View>
            </View>
          ))}
          {loading && (
            <View style={{ paddingVertical: 8, alignItems: 'flex-start' }}>
              <ActivityIndicator />
            </View>
          )}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput value={input} onChangeText={setInput} placeholder="Gõ câu hỏi của bạn..." style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8 }} multiline />
          <TouchableOpacity onPress={send} disabled={loading} style={{ padding: 10, backgroundColor: '#2563EB', borderRadius: 8, opacity: loading ? 0.5 : 1 }}>
            <Text style={{ color: '#fff' }}>{loading ? '...' : 'Gửi'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}