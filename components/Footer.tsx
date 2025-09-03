import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Dimensions } from 'react-native';

const tabs = [
  { key: 'home', icon: '🏠', label: 'Trang chủ' },
  { key: 'tasks', icon: '📋', label: 'Công việc' },
  { key: 'schedule', icon: '📅', label: 'Lịch học' },
  { key: 'pomodoro', icon: '⏰', label: 'Pomodoro' },
  { key: 'stats', icon: '📊', label: 'Thống kê' },
];

export default function Footer({ activeTab = 'home', onTabPress }: { activeTab?: string, onTabPress?: (tab: string) => void }) {
  const translateAnim = useRef(new Animated.Value(0)).current;
  const tabWidth = Dimensions.get('window').width / tabs.length;

  // Khi activeTab thay đổi, chạy animation
  useEffect(() => {
    const index = tabs.findIndex(tab => tab.key === activeTab);
    Animated.spring(translateAnim, {
      toValue: index * tabWidth,
      useNativeDriver: true,
      bounciness: 10,
    }).start();
  }, [activeTab]);

  return (
    <View style={{ height: 60, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
      <View style={{ flexDirection: 'row', flex: 1 }}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
            onPress={() => onTabPress && onTabPress(tab.key)}
          >
            <Text style={{ fontSize: 20, color: activeTab === tab.key ? '#2563EB' : '#9ca3af' }}>{tab.icon}</Text>
            <Text style={{ fontSize: 12, color: activeTab === tab.key ? '#2563EB' : '#9ca3af' }}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Animated highlight */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: tabWidth,
          height: 3,
          backgroundColor: '#2563EB',
          transform: [{ translateX: translateAnim }],
        }}
      />
    </View>
  );
}
