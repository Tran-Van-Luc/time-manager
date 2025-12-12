import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const colors = {
    text: isDark ? '#E6EEF8' : '#111827',
    surface: isDark ? '#0b1220' : '#F8FAFF',
    inputBg: isDark ? '#071226' : '#ffffff',
    inputBorder: isDark ? '#223049' : '#D1D5DB',
    cardBorder: isDark ? '#223049' : '#E5E7EB',
    primary: '#2563eb',
  };

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
        style={{
          borderWidth: 1,
          borderColor: colors.inputBorder, // keep visible outer border
          borderRadius: 6,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: colors.inputBg,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          ...(buttonStyle || {}),
        }}
      >
        {!iconOnly && (
          <Text className={`${fontSizeClassName} font-medium`} numberOfLines={1} style={{ color: colors.text }}>{currentLabel}</Text>
        )}
        <Text
          className={`${iconOnly ? '' : 'ml-1'} ${fontSizeClassName}`}
          style={{ color: colors.text, ...(iconOnly ? { fontSize: 15, lineHeight: 22, fontWeight: '700' } : {}) }}
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
            style={{
              marginTop: 4,
              borderWidth: 1,
              borderColor: colors.cardBorder,
              borderRadius: 6,
              backgroundColor: colors.surface,
              shadowColor: '#000',
              shadowOpacity: isDark ? 0.35 : 0.15,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
              maxHeight,
              overflow: 'hidden',
            }}
          >
            {options.map(item => {
              const selected = item.value === value;
              const isLast = options[options.length - 1].value === item.value;
              return (
                <TouchableOpacity
                  key={item.value}
                  onPress={() => handlePick(item.value)}
                  activeOpacity={0.6}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 8,
                    backgroundColor: selected ? colors.primary : 'transparent',
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: colors.cardBorder,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    className={`${fontSizeClassName}`}
                    style={{ color: selected ? '#fff' : colors.text, fontWeight: selected ? '600' as any : '400' as any }}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
