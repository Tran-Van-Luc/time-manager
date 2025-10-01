// components/AnimatedToggle.tsx
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

type Props = {
  value: "day" | "week" | "month";
  onChange: (v: "day" | "week" | "month") => void;
  style?: ViewStyle;
};

export function AnimatedToggle({ value, onChange }: Props) {
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

  // translateX tính theo phần trăm của container cố định (width: 240)
  const translateX = progress.interpolate({
    inputRange: [0, 2],
    outputRange: ["0%", "200%"],
  });

  const bgInterp = (index: number) =>
    progress.interpolate({
      inputRange: [index - 0.6, index, index + 0.6],
      outputRange: ["#f3f4f6", "#2563EB", "#f3f4f6"],
      extrapolate: "clamp",
    });

  const colorInterp = (index: number) =>
    progress.interpolate({
      inputRange: [index - 0.6, index, index + 0.6],
      outputRange: ["#374151", "#ffffff", "#374151"],
      extrapolate: "clamp",
    });

  return (
    <View style={atStyles.container}>
      <View style={atStyles.row}>
        <Animated.View
          style={[
            atStyles.highlight,
            { transform: [{ translateX }], backgroundColor: "#2563EB" },
          ]}
        />
        {["day", "week", "month"].map((k, i) => (
          <TouchableWithoutFeedback key={k} onPress={() => onChange(k as any)}>
            <Animated.View style={[atStyles.btn, { backgroundColor: bgInterp(i) as any }]}>
              <Animated.Text style={[atStyles.btnText, { color: colorInterp(i) as any }]}>
                {k === "day" ? "Ngày" : k === "week" ? "Tuần" : "Tháng"}
              </Animated.Text>
            </Animated.View>
          </TouchableWithoutFeedback>
        ))}
      </View>
    </View>
  );
}

const atStyles = StyleSheet.create({
  // container cố định, không cho flex mở rộng từ parent
  container: {
    paddingHorizontal: 8,
    alignSelf: "flex-start",
  },
  // row có kích thước cố định (không co giãn)
  row: {
    width: 240,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
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
