// components/schedules/AnimatedToggle.tsx
import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableWithoutFeedback,
  Animated,
  Easing,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { useLanguage } from "../../context/LanguageContext";

type Props = {
  value: "day" | "week" | "month";
  onChange: (v: "day" | "week" | "month") => void;
  style?: ViewStyle;
  accentColor?: string;
  surfaceColor?: string;
  textColor?: string;
  activeTextColor?: string;
};

export function AnimatedToggle({
  value,
  onChange,
  style,
  accentColor = "#2563EB",
  surfaceColor = "#f3f4f6",
  textColor = "#374151",
  activeTextColor = "#ffffff",
}: Props) {
  const { language } = useLanguage();

  // localized labels
  const labels = {
    vi: { day: "Ngày", week: "Tuần", month: "Tháng" },
    en: { day: "Day", week: "Week", month: "Month" },
  }[language];

  const progress = useRef(
    new Animated.Value(value === "day" ? 0 : value === "week" ? 1 : 2)
  ).current;

  useEffect(() => {
    const to = value === "day" ? 0 : value === "week" ? 1 : 2;
    Animated.timing(progress, {
      toValue: to,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value, progress]);

  // translateX calculated as percentage of container (width fixed 240)
  const translateX = progress.interpolate({
    inputRange: [0, 2],
    outputRange: ["0%", "200%"],
  });

  const bgInterp = (index: number) =>
    progress.interpolate({
      inputRange: [index - 0.6, index, index + 0.6],
      outputRange: [surfaceColor, accentColor, surfaceColor],
      extrapolate: "clamp",
    });

  const colorInterp = (index: number) =>
    progress.interpolate({
      inputRange: [index - 0.6, index, index + 0.6],
      outputRange: [textColor, activeTextColor, textColor],
      extrapolate: "clamp",
    });

  return (
    <View style={[atStyles.container, style]}>
      <View style={[atStyles.row, { backgroundColor: surfaceColor }]}>
        <Animated.View
          style={[
            atStyles.highlight,
            { transform: [{ translateX }], backgroundColor: accentColor },
          ]}
        />
        {(["day", "week", "month"] as const).map((k, i) => (
          <TouchableWithoutFeedback key={k} onPress={() => onChange(k)}>
            <Animated.View style={[atStyles.btn, { backgroundColor: bgInterp(i) as any }]}>
              <Animated.Text style={[atStyles.btnText, { color: colorInterp(i) as any }]}>
                {labels[k]}
              </Animated.Text>
            </Animated.View>
          </TouchableWithoutFeedback>
        ))}
      </View>
    </View>
  );
}

const atStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    alignSelf: "flex-start",
  },
  row: {
    width: 240,
    height: 36,
    borderRadius: 10,
    overflow: "hidden",
    flexDirection: "row",
    position: "relative",
    alignItems: "center",
  },
  highlight: {
    position: "absolute",
    left: 0,
    top: 2,
    bottom: 2,
    width: "33.3333%",
    borderRadius: 8,
  },
  btn: {
    width: "33.3333%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
