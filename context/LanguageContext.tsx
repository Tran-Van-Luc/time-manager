// context/LanguageContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_LANG = 'appLanguage';

type Language = 'vi' | 'en';

interface Translations {
  // Settings Screen
  settings: {
    close: string;
    title: string;
    notifications: string;
    appearance: string;
    language: string;
    detailedSettings: string;
    utilities: string;
    dataManagement: string;
    help: string;
    contactSupport: string;
    joinSurvey: string;
    rateApp: string;
    inviteFriends: string;
    termsOfUse: string;
    privacyPolicy: string;
  };
  // Language Settings
  languageSettings: {
    title: string;
    close: string;
    english: string;
    vietnamese: string;
  };
  // Appearance Settings
  appearanceSettings: {
    title: string;
    close: string;
    system: string;
    dark: string;
    light: string;
    primaryColor: string;
  };
  // Widget Settings
  widgetSettings: {
    title: string;
    close: string;
  };
  // Primary Color Picker
  primaryColorPicker: {
    title: string;
    close: string;
    apply: string;
    day: string;
    week: string;
    month: string;
    monthLabel: (month: Date) => string;
    weekLabels: string[];
    simpleBlue: string;
    simpleGreen: string;
    simplePurple: string;
    simpleOrange: string;
    simpleRose: string;
  };
  // Schedule Screen
  schedule: {
    pageTitle: string;
    loading: string;
    noScheduleToday: string;
    importExcel: string;
    importSchedule: string;
    confirmDelete: string;
    confirmDeleteMessage: string;
    cancel: string;
    deleteSubject: string;
    deleteSuccess: string;
    // Schedule Types
    types: {
      theory: string;
      practice: string;
      exam: string;
      suspended: string;
      makeup: string;
    };
    // Day names
    dayNames: string[];
    // Info labels
    noInstructor: string;
    noLocation: string;
    // Import errors
    importError: string;
    noData: string;
    headerNotFound: string;
    missingColumns: string;
    downloadTemplate: string;
    noDataRows: string;
    importResult: string;
    addedSuccess: (count: number) => string;
    skippedRows: (count: number) => string;
    conflictRows: (count: number) => string;
    andMoreErrors: (count: number) => string;
    importFailed: string;
    noValidData: string;
    invalidScheduleType: (type: string, validTypes: string) => string;
    missingField: (row: number, fields: string) => string;
    parseError: (row: number, message: string) => string;
    addError: (row: number, message: string) => string;
    conflict: (row: number, message: string) => string;
  };
}

const translations: Record<Language, Translations> = {
  vi: {
    settings: {
      close: 'Đóng',
      title: 'Cài đặt',
      notifications: 'Thông báo',
      appearance: 'Giao diện',
      language: 'Ngôn ngữ',
      detailedSettings: 'Thiết lập chi tiết',
      utilities: 'Tiện ích',
      dataManagement: 'Quản lý dữ liệu',
      help: 'Trợ giúp',
      contactSupport: 'Liên hệ hỗ trợ',
      joinSurvey: 'Tham gia khảo sát',
      rateApp: 'Đánh giá ứng dụng',
      inviteFriends: 'Mời bạn bè',
      termsOfUse: 'Điều khoản sử dụng',
      privacyPolicy: 'Chính sách bảo mật',
    },
    languageSettings: {
      title: 'Ngôn ngữ',
      close: 'Đóng',
      english: 'English',
      vietnamese: 'Tiếng Việt',
    },
    appearanceSettings: {
      title: 'Giao diện',
      close: 'Đóng',
      system: 'Hệ thống',
      dark: 'Tối',
      light: 'Sáng',
      primaryColor: 'Màu chủ đạo',
    },
    widgetSettings: {
      title: 'Tiện ích',
      close: 'Đóng',
    },
    primaryColorPicker: {
      title: 'Chọn màu chủ đạo',
      close: 'Đóng',
      apply: 'Áp dụng',
      day: 'Ngày',
      week: 'Tuần',
      month: 'Tháng',
      // Updated: include comma to match "Tháng 11, 2025"
      monthLabel: (month: Date) => `Tháng ${month.getMonth() + 1}, ${month.getFullYear()}`,
      weekLabels: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      simpleBlue: 'Xanh dương',
      simpleGreen: 'Xanh lá',
      simplePurple: 'Tím',
      simpleOrange: 'Cam',
      simpleRose: 'Hồng',
    },
    schedule: {
      pageTitle: 'Thời khóa biểu',
      loading: 'Đang tải...',
      noScheduleToday: 'Không có lịch hôm nay.',
      importExcel: 'Excel',
      importSchedule: 'Lịch',
      confirmDelete: 'Xác nhận xóa',
      confirmDeleteMessage: 'Bạn có chắc muốn xóa toàn bộ lịch của môn này?',
      cancel: 'Hủy',
      deleteSubject: 'Xóa môn',
      deleteSuccess: 'Xóa thành công',
      types: {
        theory: 'Lịch học lý thuyết',
        practice: 'Lịch học thực hành',
        exam: 'Lịch thi',
        suspended: 'Lịch tạm ngưng',
        makeup: 'Lịch học bù',
      },
      dayNames: ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'],
      noInstructor: 'Chưa có giảng viên',
      noLocation: 'Chưa có địa điểm',
      importError: 'Lỗi import',
      noData: 'File Excel không có dữ liệu',
      headerNotFound: 'Không tìm thấy dòng tiêu đề.\n\nVui lòng đảm bảo có cột \'Tên môn học\' trong file Excel.',
      missingColumns: 'Thiếu cột bắt buộc',
      downloadTemplate: 'Vui lòng tải file mẫu để xem định dạng đúng.',
      noDataRows: 'File Excel không có dữ liệu.\n\nVui lòng thêm ít nhất 1 dòng dữ liệu sau dòng tiêu đề.',
      importResult: 'Kết quả import',
      addedSuccess: (count: number) => `✅ Đã thêm thành công ${count} buổi học!`,
      skippedRows: (count: number) => `⚠️ Bỏ qua ${count} dòng do lỗi dữ liệu:`,
      conflictRows: (count: number) => `❌ Không thêm được ${count} buổi do trùng lịch:`,
      andMoreErrors: (count: number) => `... và ${count} lỗi khác`,
      importFailed: 'Import thất bại',
      noValidData: 'Không có dữ liệu hợp lệ để import.',
      invalidScheduleType: (type: string, validTypes: string) => 
        `Loại lịch không hợp lệ "${type}". Chỉ chấp nhận: ${validTypes}`,
      missingField: (row: number, fields: string) => `Dòng ${row}: Thiếu ${fields}`,
      parseError: (row: number, message: string) => `Dòng ${row}: Lỗi parse ngày/giờ (${message})`,
      addError: (row: number, message: string) => `Dòng ${row}: Không thể thêm (${message})`,
      conflict: (row: number, message: string) => `Dòng ${row}: ${message}`,
    },
  },
  en: {
    settings: {
      close: 'Close',
      title: 'Settings',
      notifications: 'Notifications',
      appearance: 'Appearance',
      language: 'Language',
      detailedSettings: 'Detailed Settings',
      utilities: 'Utilities',
      dataManagement: 'Data Management',
      help: 'Help',
      contactSupport: 'Contact Support',
      joinSurvey: 'Join Survey',
      rateApp: 'Rate App',
      inviteFriends: 'Invite Friends',
      termsOfUse: 'Terms of Use',
      privacyPolicy: 'Privacy Policy',
    },
    languageSettings: {
      title: 'Language',
      close: 'Close',
      english: 'English',
      vietnamese: 'Tiếng Việt',
    },
    appearanceSettings: {
      title: 'Appearance',
      close: 'Close',
      system: 'System',
      dark: 'Dark',
      light: 'Light',
      primaryColor: 'Primary Color',
    },
    widgetSettings: {
      title: 'Widget',
      close: 'Close',
    },
    primaryColorPicker: {
      title: 'Select Primary Color',
      close: 'Close',   
      apply: 'Apply',
      day: 'Day',
      week: 'Week',
      month: 'Month',
      monthLabel: (month: Date) => `${month.toLocaleString('default', { month: 'long' })} ${month.getFullYear()}`,                
      weekLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      simpleBlue: 'Blue',
      simpleGreen: 'Green',
      simplePurple: 'Purple',
      simpleOrange: 'Orange',
      simpleRose: 'Rose',
    },
    schedule: {
      pageTitle: 'Schedule',
      loading: 'Loading...',
      noScheduleToday: 'No schedule for today.',
      importExcel: 'Excel',
      importSchedule: 'Schedule',
      confirmDelete: 'Confirm Delete',
      confirmDeleteMessage: 'Are you sure you want to delete all schedules for this subject?',
      cancel: 'Cancel',
      deleteSubject: 'Delete Subject',
      deleteSuccess: 'Deleted successfully',
      types: {
        theory: 'Theory Class',
        practice: 'Practice Class',
        exam: 'Exam',
        suspended: 'Suspended',
        makeup: 'Makeup Class',
      },
      dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      noInstructor: 'No instructor',
      noLocation: 'No location',
      importError: 'Import Error',
      noData: 'Excel file has no data',
      headerNotFound: 'Header row not found.\n\nPlease ensure the file has a \'Subject Name\' column.',
      missingColumns: 'Missing Required Columns',
      downloadTemplate: 'Please download the template file to see the correct format.',
      noDataRows: 'Excel file has no data.\n\nPlease add at least 1 data row after the header.',
      importResult: 'Import Result',
      addedSuccess: (count: number) => `✅ Successfully added ${count} session${count > 1 ? 's' : ''}!`,
      skippedRows: (count: number) => `⚠️ Skipped ${count} row${count > 1 ? 's' : ''} due to data errors:`,
      conflictRows: (count: number) => `❌ Could not add ${count} session${count > 1 ? 's' : ''} due to conflicts:`,
      andMoreErrors: (count: number) => `... and ${count} more error${count > 1 ? 's' : ''}`,
      importFailed: 'Import Failed',
      noValidData: 'No valid data to import.',
      invalidScheduleType: (type: string, validTypes: string) => 
        `Invalid schedule type "${type}". Only accepts: ${validTypes}`,
      missingField: (row: number, fields: string) => `Row ${row}: Missing ${fields}`,
      parseError: (row: number, message: string) => `Row ${row}: Date/time parsing error (${message})`,
      addError: (row: number, message: string) => `Row ${row}: Cannot add (${message})`,
      conflict: (row: number, message: string) => `Row ${row}: ${message}`,
    },
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: Translations;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('vi');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLanguage();
  }, []);

  async function loadLanguage() {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY_LANG);
      if (saved === 'vi' || saved === 'en') {
        setLanguageState(saved);
      }
    } catch (error) {
      console.error('Error loading language:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function setLanguage(lang: Language) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LANG, lang);
      setLanguageState(lang);
    } catch (error) {
      console.error('Error saving language:', error);
    }
  }

  const value: LanguageContextType = {
    language,
    setLanguage,
    t: translations[language],
    isLoading,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
