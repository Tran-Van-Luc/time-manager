import { View, Platform } from "react-native";
import { Picker } from "@react-native-picker/picker";

type PickerProps = {
  value: string;
  onChange: (val: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string; 
};

export default function FilterPicker({
  value,
  onChange,
  options,
  placeholder,
}: PickerProps) {
  return (
    <View className="flex-1 h-10 bg-white rounded border justify-center">
      <Picker
        selectedValue={value}
        onValueChange={onChange}
        dropdownIconColor="#000"
        style={{ fontSize: 10, marginTop: Platform.OS === "android" ? 0 : 0 }}
      >
        {/* Chỉ render placeholder nếu có truyền vào */}
        {placeholder && <Picker.Item label={placeholder} value="" />}
        {options.map((o) => (
          <Picker.Item key={o.value} label={o.label} value={o.value} />
        ))}
      </Picker>
    </View>
  );
}