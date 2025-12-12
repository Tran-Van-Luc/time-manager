import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  initialPrompt?: string;
};

export default function AIChatModal({ visible, onClose, initialPrompt }: Props) {
  const { language, t } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const colors = {
    background: isDark ? '#071226' : '#ffffff',
    surface: isDark ? '#0b1220' : '#ffffff',
    text: isDark ? '#E6EEF8' : '#111827',
    muted: isDark ? '#C6D4E1' : '#374151',
    cardBorder: isDark ? '#223049' : '#eee',
    inputBg: isDark ? '#0f1a2c' : '#ffffff',
    inputBorder: isDark ? '#223049' : '#ddd',
    userBubbleBg: isDark ? '#13233f' : '#eef2ff',
    modelBubbleBg: isDark ? '#0f2a23' : '#f0fdf4',
    primary: '#2563EB',
    danger: '#ef4444',
    warning: '#f59e0b',
  };
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const [expandedMessages, setExpandedMessages] = useState<Record<number, boolean>>({});
  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!visible) return;

    if (initialPrompt) {
      setMessages([{ role: 'user', text: initialPrompt }]);
      setExpandedMessages({});
      setInput(''); 
      
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
      
      triggerInitialSend();
      
    } else {
      setMessages([]);
      setInput('');
      setExpandedMessages({});
    }
  }, [visible, initialPrompt]);

  const append = (role: 'user' | 'model', text: string) => {
    const sanitizeAIResponse = (t: string) => {
      try {
        t = t.replace(/^\s*\*\s+/gm, '- ');
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

      const contents = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));
      
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ 
        flex: 1, 
        backgroundColor: colors.surface,
        paddingTop: insets.top,
      }}>
        {/* Header - fixed position */}
        <View style={{ 
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: colors.surface,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
              {language === 'en' ? 'AI Chat' : 'AI Chat'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => Alert.alert(
                  language === 'en' ? 'Note' : 'Lưu ý', 
                  language === 'en' ? 'Conversation will be cleared after you leave this chat.' : 'Cuộc trò chuyện sẽ bị xóa sau khi bạn rời khỏi đoạn chat này.'
                )}
                activeOpacity={0.8}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.warning,
                  backgroundColor: 'transparent',
                }}
              >
                <Text style={{ color: colors.warning, fontWeight: '800' }}>!</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={clear}
                activeOpacity={0.8}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.danger,
                  backgroundColor: 'transparent',
                }}
              >
                <Text style={{ color: colors.danger, fontWeight: '700' }}>
                  {language === 'en' ? 'Clear' : 'Xóa'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.9}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: colors.primary,
                  shadowColor: '#000',
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {language === 'en' ? 'Close' : 'Đóng'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Messages area - scrollable */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ 
            padding: 12,
            paddingBottom: 20,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          {messages.map((m, i) => {
            const renderLines = (text: string, highlightNumbers: boolean) => {
              const lines = String(text).split('\n');
              return lines.map((line, li) => {
                const match = line.match(/^\s*(\d+)\.\s*(.*)$/);
                if (match) {
                  const number = match[1];
                  const rest = match[2];
                  if (highlightNumbers) {
                    return (
                      <Text key={`l-${i}-${li}`} style={{ marginBottom: li === lines.length - 1 ? 0 : 4, color: colors.text }}>
                        <Text style={{ color: colors.danger, fontWeight: '700' }}>{number + '. '}</Text>
                        <Text style={{ color: colors.text }}>{rest}</Text>
                      </Text>
                    );
                  }
                  return (
                    <Text key={`l-${i}-${li}`} style={{ marginBottom: li === lines.length - 1 ? 0 : 4, color: colors.text }}>
                      {number + '. ' + rest}
                    </Text>
                  );
                }
                return (
                  <Text key={`l-${i}-${li}`} style={{ marginBottom: li === lines.length - 1 ? 0 : 4, color: colors.text }}>
                    {line}
                  </Text>
                );
              });
            };

            const isUser = m.role === 'user';
            const fullText = String(m.text || '');
            const fullLines = fullText.split('\n');
            const lineLimit = 6;
            const charLimit = 600;
            const isLong = fullLines.length > lineLimit || fullText.length > charLimit;
            const expanded = !!expandedMessages[i];
            const shouldTruncate = isUser && isLong && i === 0 && !expanded;
            const shownText = shouldTruncate ? fullLines.slice(0, lineLimit).join('\n') : fullText;

            const toggleExpanded = () =>
              setExpandedMessages((s) => ({ ...s, [i]: !s[i] }));

            return (
              <View key={i} style={{ marginBottom: 12, alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
                <Text style={{ fontWeight: '700', color: isUser ? '#0b5cff' : '#0b8a44' }}>
                  {isUser ? (language === 'en' ? 'You' : 'Bạn') : 'AI'}
                </Text>
                <View style={{
                  backgroundColor: isUser ? colors.userBubbleBg : colors.modelBubbleBg,
                  padding: 10,
                  borderRadius: 8,
                  marginTop: 4,
                  maxWidth: '90%',
                }}>
                  {renderLines(shownText, isUser)}
                  {isUser && isLong && i === 0 ? (
                    <TouchableOpacity onPress={toggleExpanded} style={{ marginTop: 8 }}>
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>
                        {expanded
                          ? language === 'en' ? 'Collapse' : 'Thu gọn'
                          : language === 'en' ? 'Show more' : 'Xem thêm'}
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

        {/* Input area - wrapped with KeyboardAvoidingView */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={{ 
            flexDirection: 'row', 
            gap: 8, 
            alignItems: 'flex-end',
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.cardBorder,
          }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={language === 'en' ? 'Type your question...' : 'Gõ câu hỏi của bạn...'}
              placeholderTextColor={colors.muted}
              multiline
              onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.inputBorder,
                padding: 10,
                borderRadius: 8,
                maxHeight: 120,
                minHeight: 40,
                height: Math.min(Math.max(40, inputHeight || 40), 120),
                textAlignVertical: 'top',
                backgroundColor: colors.inputBg,
                color: colors.text,
              }}
              scrollEnabled={true}
            />
            <TouchableOpacity 
              onPress={send} 
              disabled={loading} 
              style={{ 
                padding: 10, 
                backgroundColor: colors.primary, 
                borderRadius: 8, 
                opacity: loading ? 0.5 : 1,
                minHeight: 40,
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff' }}>
                {loading ? '...' : (language === 'en' ? 'Send' : 'Gửi')}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}