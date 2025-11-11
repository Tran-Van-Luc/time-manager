import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';

interface FloatingLabelInputProps extends Omit<TextInputProps, 'onChange' | 'onChangeText'> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  containerClassName?: string;
  inputClassName?: string;
  required?: boolean;
}

export default function FloatingLabelInput({
  label,
  value,
  onChangeText,
  containerClassName = 'mb-2',
  inputClassName = '',
  required = false,
  multiline,
  ...rest
}: FloatingLabelInputProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput | null>(null);
  const showLabel = focused || !!value;
  // Giữ viền & màu label cố định, không đổi sang xanh khi focus
  const borderColor = 'border-black';
  const labelColor = focused ? 'text-gray-700' : 'text-gray-500';

  return (
    <View className={containerClassName}>
      <View className={`border rounded relative ${borderColor} bg-gray-50`}>        
        {showLabel && (
          <Text
            className={`absolute -top-2 left-2 px-1 bg-gray-50 text-[11px] ${labelColor}`}
          >
            {label}{required ? ' *' : ''}
          </Text>
        )}
        {!showLabel && (
          <Text
            onPress={() => inputRef.current?.focus()}
            className={`absolute left-3 top-1.5 text-gray-500 ${multiline ? 'text-base' : 'text-sm'}`}
          >
            {label}{required ? ' *' : ''}
          </Text>
        )}
        <TextInput
          ref={inputRef}
          className={`p-2 text-gray-800 ${multiline ? 'h-24 text-[13px]' : 'h-11 text-sm'} ${multiline ? 'pt-4' : 'pt-4'} ${inputClassName}`}
          value={value}
          multiline={multiline}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={(e) => { setFocused(false); if (typeof rest.onBlur === 'function') { try { (rest.onBlur as any)(e); } catch {} } }}
          placeholder=""
          style={multiline ? { textAlignVertical: 'top' } : undefined}
          {...rest}
        />
      </View>
    </View>
  );
}
