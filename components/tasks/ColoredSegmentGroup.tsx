import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export interface OptionItem { label: string; value: string; }
interface Props {
  value: string;
  options: OptionItem[];
  onChange: (val: string) => void;
  color?: 'blue' | 'purple';
  size?: 'sm' | 'md';
}

const paletteMap = {
  blue: {
    idleBg: 'bg-blue-100', idleText: 'text-blue-600', idleBorder: 'border-blue-600',
    activeBg: 'bg-blue-600', activeText: 'text-white', activeBorder: 'border-blue-600'
  },
  purple: {
    idleBg: 'bg-purple-100', idleText: 'text-purple-700', idleBorder: 'border-purple-700',
    activeBg: 'bg-purple-700', activeText: 'text-white', activeBorder: 'border-purple-700'
  }
};

export default function ColoredSegmentGroup({ value, options, onChange, color='blue', size='sm' }: Props) {
  const fontCls = size === 'sm' ? 'text-xs' : 'text-sm';
  const p = paletteMap[color];
  return (
    <View className="flex-row flex-wrap">
      {options.map(o => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            activeOpacity={0.75}
            className={`px-3 py-1.5 rounded-full mr-2 mb-2 border ${active ? `${p.activeBg} ${p.activeBorder}` : `${p.idleBg} ${p.idleBorder}`}`}
          >
            <Text className={`${fontCls} font-medium ${active ? p.activeText : p.idleText}`}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
