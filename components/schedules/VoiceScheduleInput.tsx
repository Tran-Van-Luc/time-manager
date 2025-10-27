import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { parseVoiceWithGemini } from '../../utils/voiceScheduleService';
import { CreateScheduleParams } from '../../database/schedule';

interface Props {
  onParsed: (data: Partial<CreateScheduleParams>) => void;
}

export default function VoiceScheduleInput({ onParsed }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [showInputModal, setShowInputModal] = useState(false);
  const [tempInput, setTempInput] = useState('');

  const handleOpenInput = () => {
    setTempInput('');
    setShowInputModal(true);
  };

  const handleSubmit = async () => {
    if (!tempInput.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập thông tin lịch học');
      return;
    }

    setShowInputModal(false);
    setTranscript(tempInput);
    await processTranscript(tempInput);
  };

  const processTranscript = async (text: string) => {
    setIsProcessing(true);
    try {
      console.log('Processing:', text);
      const parsed = await parseVoiceWithGemini(text);
      console.log('Parsed result:', parsed);
      
      const scheduleData: Partial<CreateScheduleParams> = {};
      
      if (parsed.courseName) scheduleData.courseName = parsed.courseName;
      if (parsed.instructor) scheduleData.instructorName = parsed.instructor;
      if (parsed.location) scheduleData.location = parsed.location;
      if (parsed.type) scheduleData.type = parsed.type as any;
      if (parsed.startTime) scheduleData.startTime = parsed.startTime;
      if (parsed.endTime) scheduleData.endTime = parsed.endTime;
      if (parsed.startDate) scheduleData.startDate = parsed.startDate;
      if (parsed.endDate) scheduleData.endDate = parsed.endDate;
      if (parsed.singleDate) scheduleData.singleDate = parsed.singleDate;

      console.log('Schedule data to pass:', scheduleData);
      
      if (Object.keys(scheduleData).length === 0) {
        throw new Error('AI không phân tích được thông tin. Vui lòng thử lại với mô tả chi tiết hơn.');
      }
      
      onParsed(scheduleData);
      Alert.alert('Thành công', `Đã điền ${Object.keys(scheduleData).length} trường thông tin!`);
    } catch (error: any) {
      console.error('Process error:', error);
      Alert.alert('Lỗi', error.message || 'Không thể phân tích. Vui lòng kiểm tra API key.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
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
            <Text style={styles.buttonText}>Thêm nhanh bằng AI</Text>
          </>
        )}
      </TouchableOpacity>

      {transcript && (
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptLabel}>✅ Đã phân tích:</Text>
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      )}

      {/* Input Modal */}
      <Modal
        visible={showInputModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInputModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nhập thông tin lịch học</Text>
              <TouchableOpacity onPress={() => setShowInputModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.textInput}
              placeholder="VD: Học Toán cao cấp thứ 2 và thứ 4 từ 7 giờ đến 9 giờ, phòng A101, thầy Nguyễn Văn A, từ ngày 1/11 đến 31/12"
              placeholderTextColor="#999"
              value={tempInput}
              onChangeText={setTempInput}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />

            <View style={styles.exampleBox}>
              <Text style={styles.exampleTitle}>💡 Các ví dụ:</Text>
              <TouchableOpacity onPress={() => setTempInput('Lịch thi Lập trình Python ngày 15 tháng 11, 9 giờ đến 11 giờ, phòng B203')}>
                <Text style={styles.exampleText}>• Lịch thi Lập trình Python ngày 15/11, 9h-11h, phòng B203</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTempInput('Học bù môn Vật lý ngày mai 14 giờ đến 16 giờ')}>
                <Text style={styles.exampleText}>• Học bù môn Vật lý ngày mai 14h-16h</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTempInput('Thực hành Hóa học thứ 3 từ 13h đến 15h30, phòng lab 2')}>
                <Text style={styles.exampleText}>• Thực hành Hóa học thứ 3, 13h-15h30, lab 2</Text>
              </TouchableOpacity>
            </View>

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
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
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
    maxHeight: '80%',
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
  exampleBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cce5ff',
  },
  exampleTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066cc',
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 12,
    color: '#0066cc',
    marginBottom: 6,
    lineHeight: 18,
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