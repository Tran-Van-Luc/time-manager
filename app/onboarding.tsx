// app/onboarding.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Animated,
  Easing,
  Text,
} from "react-native";
import { useRouter } from "expo-router";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

const WaveText = ({ text }: { text: string }) => {
  const animatedValues = useRef(
    text.split("").map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    animatedValues.forEach((anim) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: -6,
            duration: 400,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 400,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  }, []);

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
      {text.split("").map((char, i) => (
        <MaskedView
          key={i}
          maskElement={
            <Animated.Text
              style={[
                styles.title,
                { transform: [{ translateY: animatedValues[i] }] },
              ]}
            >
              {char}
            </Animated.Text>
          }
        >
          <LinearGradient
            colors={["#2563EB", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Animated.Text style={[styles.title, { opacity: 0 }]}>{char}</Animated.Text>
          </LinearGradient>
        </MaskedView>
      ))}
    </View>
  );
};

export default function OnboardingScreen() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [gifKey, setGifKey] = useState(0);
  const GIF_DURATION_MS = 3000;
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    startGifTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gifKey]);

  const startGifTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setGifKey((k) => k + 1);
    }, GIF_DURATION_MS) as unknown as number;
  };

  // CHỈ navigate tới màn đặt tên (không set hasOnboarded)
  const handleFinish = () => {
    setSaving(true);
    router.push("/name-schedule");
  };

  return (
    <View style={styles.container}>
      <Image
        key={`gif-${gifKey}`}
        source={require("../assets/timemanagement.gif")}
        style={styles.gif}
      />

      <WaveText text="Chào mừng bạn đến với StudyTime" />

      <View style={{ marginTop: 10 }}>
        <Text style={styles.subtitle}>
          Truy cập dễ dàng vào lịch học và công việc của bạn.{"\n"}
          Theo dõi, sắp xếp và nhắc nhở thông minh.
        </Text>
      </View>

      <TouchableOpacity onPress={handleFinish} disabled={saving}>
        <LinearGradient
          colors={["#2563EB", "#4F46E5"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.button}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Bắt đầu</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  gif: {
    width: 400,
    height: 400,
    marginBottom: 30,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    textAlign: "center",
    fontSize: 16,
    marginBottom: 30,
    color: "#555",
  },
  button: {
    backgroundColor: "#2E6EF7",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    minWidth: 140,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});
