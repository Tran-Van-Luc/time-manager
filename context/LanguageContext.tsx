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
  // Tasks Screen
  tasks?: {
    title: string;
    viewCalendar: string;
    viewList: string;
    searchPlaceholder: string;
    allPriorities: string;
    allStatuses: string;
    addTask: string;
    addManual: string;
    addFromFile: string;
    importFromExcel: string;
    pathLabel: string;
    filePathPlaceholder: string;
    downloadTemplate: string;
    confirm: string;
    cancel: string;
    noFile: string;
    chooseFileMsg: string;
    // TaskModal specific
    modal: {
      addTitle: string;
      editTitle: string;
      titleLabel: string;
      descriptionLabel: string;
      startDateLabel: string;
      startTimeLabel: string;
      endTimeLabel: string;
      priorityLabel: string;
      reminderToggle: string;
      reminderLeadLabel: string;
      reminderCustomLabel: string;
      reminderCustomHint: string;
      reminderCustomLimit: string;
      reminderMethodLabel: string;
      methodNotification: string;
      methodAlarm: string;
      repeatToggle: string;
      completionOptions: string;
      autoCompleteExpired: string;
      mergeStreak: string;
      repeatFrequencyLabel: string;
      weeklyPickDays: string;
      monthlyPickDays: string;
      selectAll: string;
      yearlyCountLabel: string;
      yearlyCountPlaceholder: string;
      autoEndDateLabel: (dateText: string) => string;
      repeatEndDateLabel: string;
      addButton: string;
      saveButton: string;
      cancelButton: string;
      // Validation messages
      invalidStartTitle: string;
      invalidStartMessage: string;
      invalidTimeTitle: string;
      invalidTimeMessageEndAfterStart: string;
      missingWeeklyDaysTitle: string;
      missingWeeklyDaysMessage: string;
      missingMonthlyDaysTitle: string;
      missingMonthlyDaysMessage: string;
      startAfterEndTitle: string;
      startAfterEndMessage: string;
      missingRepeatEndTitle: string;
      missingRepeatEndMessage: string;
      yearlyCountInvalidTitle: string;
      yearlyCountInvalidMessage: string;
      endTooEarlyTitle: string;
      endTooEarlyMessage: string;
      needNotificationPermissionTitle: string;
      needNotificationPermissionMsg: string;
      // Segments
      priorityLow: string;
      priorityMedium: string;
      priorityHigh: string;
      repeatDaily: string;
      repeatWeekly: string;
      repeatMonthly: string;
      repeatYearly: string;
      minutes: string;
      hours: string;
      days: string;
      dayShorts: string[];
    };
    // TaskListView
    list?: {
      loading: string;
      searchResults: string;
      today: string;
      noTasks: string;
    };
    // TaskWeekView
    week?: {
      currentWeek: string;
      timeSlots: string;
      morning: string;
      afternoon: string;
      evening: string;
      dayShorts: string[];
    };
    // TaskItem/Detail shared
    item?: {
      statusPending: string;
      statusInProgress: string;
      statusCompleted: string;
      progressLabel: string;
      mergedSuffix: string;
      completedWord: string;
      // Reminder unit labels
      unitDay: string;
      unitHour: string;
      unitMinute: string;
      // Today status labels
      todayEarly: string; // label start (e.g., "sớm" / "early")
      todayOnTime: string;
      todayLate: string;
      // Short units for compact time strings
      shortDay: string; // e.g., "n" or "d"
      shortHour: string; // e.g., "g" or "h"
      shortMinute: string; // e.g., "p" or "m"
      // Conflict alerts when un-completing
      uncompleteBlockedTitle: string;
      uncompleteBlockedMsgSelectedDay: (list: string) => string;
      uncompleteBlockedMsgGeneric: (list: string) => string;
    };
    // Voice input / AI add task
    voice?: {
      addWithAI: string;
      notSupportedTitle: string;
      notSupportedMsg: string;
      permissionTitle: string;
      permissionMsg: string;
      allow: string;
      deny: string;
      permissionDeniedTitle: string;
      permissionDeniedMsg: string;
      speechErrorTitle: string;
      speechErrorMsg: string;
      recordingLabel: string;
      recordingHint: string;
      analyzedLabel: string;
      inputTitle: string;
      inputPlaceholder: string;
      analyze: string;
      errorTitle: string;
      emptyInputMsg: string;
      processErrorMsg: string;
    };
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
    tasks: {
      title: 'Công việc của tôi',
      viewCalendar: 'Dạng lịch',
      viewList: 'Dạng danh sách',
      searchPlaceholder: 'Tìm kiếm công việc theo tiêu đề hoặc mô tả...',
      allPriorities: 'Tất cả mức độ',
      allStatuses: 'Tất cả trạng thái',
      addTask: 'Thêm công việc',
      addManual: 'Nhập thủ công',
      addFromFile: 'Nhập bằng file',
      importFromExcel: 'Nhập dữ liệu từ Excel',
      pathLabel: 'Đường dẫn',
      filePathPlaceholder: 'Đường dẫn tệp',
      downloadTemplate: 'Tải mẫu',
      confirm: 'Đồng ý',
      cancel: 'Hủy bỏ',
      noFile: 'Không có tệp',
      chooseFileMsg: 'Vui lòng chọn tệp để nhập.',
      modal: {
        addTitle: 'Thêm công việc mới',
        editTitle: 'Sửa công việc',
        titleLabel: 'Tiêu đề',
        descriptionLabel: 'Mô tả',
        startDateLabel: 'Ngày bắt đầu*',
        startTimeLabel: 'Giờ bắt đầu*',
        endTimeLabel: 'Giờ kết thúc*',
        priorityLabel: 'Mức độ',
        reminderToggle: 'Bật nhắc nhở',
        reminderLeadLabel: 'Nhắc trước',
        reminderCustomLabel: 'Tùy chỉnh',
        reminderCustomHint: 'Nhập giá trị nhắc tùy chỉnh',
        reminderCustomLimit: 'Giới hạn tối đa: 7 ngày (10080 phút).',
        reminderMethodLabel: 'Phương thức nhắc',
        methodNotification: 'Thông báo',
        methodAlarm: 'Chuông báo',
        repeatToggle: 'Lặp lại',
        completionOptions: 'Tuỳ chọn hoàn thành',
        autoCompleteExpired: 'Tự động đánh hoàn thành nếu hết hạn',
        mergeStreak: 'Gộp các ngày lặp thành một lần hoàn thành',
        repeatFrequencyLabel: 'Lặp theo',
        weeklyPickDays: 'Chọn các ngày trong tuần',
        monthlyPickDays: 'Chọn các ngày trong tháng',
        selectAll: 'Tất cả',
        yearlyCountLabel: 'Số lần lặp (2-100) *',
        yearlyCountPlaceholder: 'Nếu không nhập mặc định là 2',
        autoEndDateLabel: (dateText: string) => `Tự tính ngày kết thúc: ${dateText}`,
        repeatEndDateLabel: 'Ngày kết thúc lặp *',
        addButton: 'Thêm công việc',
        saveButton: 'Lưu',
        cancelButton: 'Hủy',
        invalidStartTitle: 'Giờ bắt đầu chưa hợp lệ',
        invalidStartMessage: 'Vui lòng đặt giờ bắt đầu muộn hơn hiện tại ít nhất 1 giờ.',
        invalidTimeTitle: 'Thời gian không hợp lệ',
        invalidTimeMessageEndAfterStart: 'Giờ kết thúc phải sau giờ bắt đầu!',
        missingWeeklyDaysTitle: 'Thiếu ngày trong tuần',
        missingWeeklyDaysMessage: 'Vui lòng chọn ít nhất một ngày trong tuần.',
        missingMonthlyDaysTitle: 'Thiếu ngày trong tháng',
        missingMonthlyDaysMessage: 'Vui lòng chọn ít nhất một ngày trong tháng.',
        startAfterEndTitle: 'Thời gian không hợp lệ',
        startAfterEndMessage: 'Ngày bắt đầu không thể sau ngày kết thúc lặp!',
        missingRepeatEndTitle: 'Thiếu ngày kết thúc lặp',
        missingRepeatEndMessage: 'Vui lòng chọn ngày kết thúc lặp để có ít nhất 2 lần.',
        yearlyCountInvalidTitle: 'Số lần lặp không hợp lệ',
        yearlyCountInvalidMessage: 'Lặp theo năm phải ít nhất 2 lần.',
        endTooEarlyTitle: 'Ngày kết thúc quá sớm',
        endTooEarlyMessage: 'Ngày kết thúc lặp phải cho ít nhất 2 lần lặp.',
        needNotificationPermissionTitle: 'Cần quyền thông báo',
        needNotificationPermissionMsg: 'Vui lòng cấp quyền thông báo để bật nhắc nhở.',
        priorityLow: 'Thấp',
        priorityMedium: 'Trung bình',
        priorityHigh: 'Cao',
        repeatDaily: 'ngày',
        repeatWeekly: 'tuần',
        repeatMonthly: 'tháng',
        repeatYearly: 'năm',
        minutes: 'Phút',
        hours: 'Giờ',
        days: 'Ngày',
        dayShorts: ['CN','T2','T3','T4','T5','T6','T7'],
      },
      list: {
        loading: 'Đang tải...',
        searchResults: 'Kết quả tìm kiếm',
        today: 'Hôm nay',
        noTasks: 'Không có công việc',
      },
      week: {
        currentWeek: 'Tuần hiện tại',
        timeSlots: 'Khung giờ',
        morning: 'Sáng',
        afternoon: 'Chiều',
        evening: 'Tối',
        dayShorts: ['T2','T3','T4','T5','T6','T7','CN'],
      },
      item: {
        statusPending: 'Chờ thực hiện',
        statusInProgress: 'Đang thực hiện',
        statusCompleted: 'Hoàn thành',
        progressLabel: 'Tiến độ',
        mergedSuffix: 'đã gộp',
        completedWord: 'Hoàn thành',
        unitDay: 'ngày',
        unitHour: 'giờ',
        unitMinute: 'phút',
        todayEarly: 'sớm',
        todayOnTime: 'đúng hạn',
        todayLate: 'trễ',
        shortDay: 'n',
        shortHour: 'g',
        shortMinute: 'p',
        uncompleteBlockedTitle: 'Không thể bỏ hoàn thành ⛔',
        uncompleteBlockedMsgSelectedDay: (list: string) => `Công việc này bị trùng thời gian với công việc khác đang hoạt động trong ngày đã chọn:\n\n${list}\n\nVui lòng giải quyết xung đột trước.`,
        uncompleteBlockedMsgGeneric: (list: string) => `Công việc này bị trùng thời gian với công việc khác đang hoạt động:\n\n${list}\n\nVui lòng giải quyết xung đột trước.`,
      },
      voice: {
        addWithAI: 'Thêm công việc bằng AI',
        notSupportedTitle: 'Không hỗ trợ',
        notSupportedMsg: 'Tính năng nhận diện giọng nói chưa được cài đặt trên thiết bị này.',
        permissionTitle: 'Quyền ghi âm',
        permissionMsg: 'Ứng dụng cần quyền ghi âm để nhận diện giọng nói',
        allow: 'Cho phép',
        deny: 'Hủy',
        permissionDeniedTitle: 'Quyền bị từ chối',
        permissionDeniedMsg: 'Không thể ghi âm vì quyền bị từ chối',
        speechErrorTitle: 'Lỗi nhận diện giọng nói',
        speechErrorMsg: 'Không thể nhận diện giọng nói',
        recordingLabel: '🔴 Đang ghi âm...',
        recordingHint: 'Nói để thêm công việc — quá trình sẽ tự động phân tích khi dừng.',
        analyzedLabel: '✅ Đã phân tích:',
        inputTitle: 'Nhập mô tả công việc',
        inputPlaceholder: 'VD: Chuẩn bị báo cáo tiến độ tuần — bắt đầu 09:00, kết thúc 11:30 ngày 15/11, ưu tiên cao, nhắc 40 phút trước, lặp hàng tháng, tự động hoàn thành.',
        analyze: 'Phân tích',
        errorTitle: 'Lỗi',
        emptyInputMsg: 'Vui lòng nhập mô tả công việc',
        processErrorMsg: 'Không thể phân tích. Vui lòng thử lại.',
      },
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
    tasks: {
      title: 'My Tasks',
      viewCalendar: 'Calendar view',
      viewList: 'List view',
      searchPlaceholder: 'Search tasks by title or description...',
      allPriorities: 'All priorities',
      allStatuses: 'All statuses',
      addTask: 'Add Task',
      addManual: 'Add manually',
      addFromFile: 'Import from file',
      importFromExcel: 'Import data from Excel',
      pathLabel: 'Path',
      filePathPlaceholder: 'File path',
      downloadTemplate: 'Download template',
      confirm: 'Confirm',
      cancel: 'Cancel',
      noFile: 'No file',
      chooseFileMsg: 'Please choose a file to import.',
      modal: {
        addTitle: 'Add new task',
        editTitle: 'Edit task',
        titleLabel: 'Title',
        descriptionLabel: 'Description',
        startDateLabel: 'Start date*',
        startTimeLabel: 'Start time*',
        endTimeLabel: 'End time*',
        priorityLabel: 'Priority',
        reminderToggle: 'Enable reminder',
        reminderLeadLabel: 'Remind before',
        reminderCustomLabel: 'Custom',
        reminderCustomHint: 'Enter custom reminder value',
        reminderCustomLimit: 'Maximum: 7 days (10080 minutes).',
        reminderMethodLabel: 'Reminder method',
        methodNotification: 'Notification',
        methodAlarm: 'Alarm',
        repeatToggle: 'Repeat',
        completionOptions: 'Completion options',
        autoCompleteExpired: 'Auto-complete when expired',
        mergeStreak: 'Merge repeating days into one completion',
        repeatFrequencyLabel: 'Repeat by',
        weeklyPickDays: 'Pick days of week',
        monthlyPickDays: 'Pick days of month',
        selectAll: 'Select all',
        yearlyCountLabel: 'Repeat count (2-100) *',
        yearlyCountPlaceholder: 'Default is 2 if left empty',
        autoEndDateLabel: (dateText: string) => `Auto end date: ${dateText}`,
        repeatEndDateLabel: 'Repeat end date *',
        addButton: 'Add Task',
        saveButton: 'Save',
        cancelButton: 'Cancel',
        invalidStartTitle: 'Invalid start time',
        invalidStartMessage: 'Please set start at least 1 hour later than now.',
        invalidTimeTitle: 'Invalid time',
        invalidTimeMessageEndAfterStart: 'End time must be after start time!',
        missingWeeklyDaysTitle: 'Missing week days',
        missingWeeklyDaysMessage: 'Please select at least one day of week.',
        missingMonthlyDaysTitle: 'Missing month days',
        missingMonthlyDaysMessage: 'Please select at least one day of month.',
        startAfterEndTitle: 'Invalid time',
        startAfterEndMessage: 'Start time cannot be after repeat end date!',
        missingRepeatEndTitle: 'Missing repeat end date',
        missingRepeatEndMessage: 'Please choose a repeat end date to have at least 2 occurrences.',
        yearlyCountInvalidTitle: 'Invalid repeat count',
        yearlyCountInvalidMessage: 'Yearly repeat must have at least 2 times.',
        endTooEarlyTitle: 'End date too early',
        endTooEarlyMessage: 'Repeat end must allow at least 2 occurrences.',
        needNotificationPermissionTitle: 'Notification permission required',
        needNotificationPermissionMsg: 'Please grant notification permission to enable reminders.',
        priorityLow: 'Low',
        priorityMedium: 'Medium',
        priorityHigh: 'High',
        repeatDaily: 'Daily',
        repeatWeekly: 'Weekly',
        repeatMonthly: 'Monthly',
        repeatYearly: 'Yearly',
        minutes: 'Minutes',
        hours: 'Hours',
        days: 'Days',
        dayShorts: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
      },
      list: {
        loading: 'Loading...',
        searchResults: 'Search results',
        today: 'Today',
        noTasks: 'No tasks',
      },
      week: {
        currentWeek: 'Current week',
        timeSlots: 'Time slots',
        morning: 'Morning',
        afternoon: 'Afternoon',
        evening: 'Evening',
        dayShorts: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
      },
      item: {
        statusPending: 'Pending',
        statusInProgress: 'In progress',
        statusCompleted: 'Completed',
        progressLabel: 'Progress',
        mergedSuffix: 'merged',
        completedWord: 'Completed',
        unitDay: 'day',
        unitHour: 'hour',
        unitMinute: 'minute',
        todayEarly: 'early',
        todayOnTime: 'on time',
        todayLate: 'late',
        shortDay: 'd',
        shortHour: 'h',
        shortMinute: 'm',
        uncompleteBlockedTitle: 'Cannot un-complete ⛔',
        uncompleteBlockedMsgSelectedDay: (list: string) => `This task overlaps with other active tasks on the selected day:\n\n${list}\n\nPlease resolve the conflicts first.`,
        uncompleteBlockedMsgGeneric: (list: string) => `This task overlaps with other active tasks:\n\n${list}\n\nPlease resolve the conflicts first.`,
      },
      voice: {
        addWithAI: 'Add task with AI',
        notSupportedTitle: 'Not supported',
        notSupportedMsg: 'Speech recognition is not available on this device.',
        permissionTitle: 'Microphone permission',
        permissionMsg: 'The app needs microphone access to recognize speech.',
        allow: 'Allow',
        deny: 'Cancel',
        permissionDeniedTitle: 'Permission denied',
        permissionDeniedMsg: 'Cannot record because permission was denied.',
        speechErrorTitle: 'Speech recognition error',
        speechErrorMsg: 'Unable to recognize speech.',
        recordingLabel: '🔴 Recording...',
        recordingHint: 'Speak to add a task — analysis will run when you stop.',
        analyzedLabel: '✅ Analyzed:',
        inputTitle: 'Enter task description',
        inputPlaceholder: 'e.g., Prepare weekly progress report — start 09:00, end 11:30 on 11/15, high priority, remind 40 minutes before, repeat monthly, auto-complete when expired.',
        analyze: 'Analyze',
        errorTitle: 'Error',
        emptyInputMsg: 'Please enter a task description',
        processErrorMsg: 'Cannot analyze. Please try again.',
      },
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
