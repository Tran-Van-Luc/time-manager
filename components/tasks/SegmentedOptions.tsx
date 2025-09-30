import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

export interface SegmentedOption { label: string; value: string; }
interface SegmentedProps {
  value: string;
  options: SegmentedOption[];
  onChange: (val: string) => void;
  wrap?: boolean; // allow multi-line wrap
  size?: 'sm' | 'md';
  allowScroll?: boolean; // horizontal scroll if not wrap
  className?: string;
}

// Simple segmented control using Tailwind utilities.
export default function SegmentedOptions({
  value,
  options,
  onChange,
  wrap = true,
  size = 'md',
  allowScroll = false,
  className = ''
}: SegmentedProps) {
  const fontSizeCls = size === 'sm' ? 'text-xs' : 'text-sm';
  const container = (
    <View className={`flex-row ${wrap ? 'flex-wrap' : ''}`}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
            className={`px-3 py-1.5 rounded-full mr-2 mb-2 border ${active ? 'bg-blue-600 border-blue-600' : 'bg-gray-100 border-gray-300'} `}
          >
            <Text className={`${fontSizeCls} ${active ? 'text-white font-semibold' : 'text-gray-800'}`}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (allowScroll && !wrap) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className={className}>
        {container}
      </ScrollView>
    );
  }
  return <View className={className}>{container}</View>;
}
