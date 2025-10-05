import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface Option {
  label: string;
  value: string;
}
interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  maxHeight?: number; // limit list height
  fontSizeClassName?: string; // allow override font size (tailwind class)
  iconOnly?: boolean; // show only the arrow icon on the button
  buttonStyle?: any; // allow custom styling for the trigger button (merge with defaults)
  menuWidth?: number; // custom dropdown width (e.g., width of the parent button)
}

// A simple inline dropdown that expands below the selector instead of full screen
export default function CompactSelect({ value, onChange, options, placeholder = 'Chọn', maxHeight = 180, fontSizeClassName = 'text-sm', iconOnly = false, buttonStyle, menuWidth }: Props) {
  const [open, setOpen] = useState(false);

  const currentLabel = useMemo(() => {
    const found = options.find(o => o.value === value);
    return found ? found.label : placeholder;
  }, [value, options, placeholder]);

  const handlePick = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <View className={iconOnly ? '' : 'min-w-[90px]'} style={{ position: 'relative' }}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setOpen(o => !o)}
        className="border rounded px-3 py-2 bg-white flex-row justify-between items-center"
        style={buttonStyle}
      >
        {!iconOnly && (
          <Text className={`${fontSizeClassName} font-medium`} numberOfLines={1}>{currentLabel}</Text>
        )}
        <Text
          className={`${iconOnly ? '' : 'ml-1'} ${fontSizeClassName}`}
          style={iconOnly ? { fontSize: 15, lineHeight: 22, fontWeight: '700' } : undefined}
        >
          ▼
        </Text>
      </TouchableOpacity>
      {open && (
        <View
          style={{ position: 'absolute', top: '100%', right: 0, zIndex: 9999, width: menuWidth }}
          pointerEvents="box-none"
        >
          {/* Backdrop */}
          <TouchableOpacity
            style={{ position: 'absolute', top: -4, left: -1000, right: -1000, bottom: -1000 }}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <View
            className="mt-1 border rounded bg-white shadow"
            style={{ maxHeight, overflow: 'hidden' }}
          >
            {options.map(item => {
              const selected = item.value === value;
              return (
                <TouchableOpacity
                  key={item.value}
                  onPress={() => handlePick(item.value)}
                  className={`px-2 py-2 ${selected ? 'bg-blue-600' : ''}`}
                  activeOpacity={0.6}
                >
                  <Text numberOfLines={1} className={`${fontSizeClassName} ${selected ? 'text-white font-semibold' : 'text-black'}`}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
