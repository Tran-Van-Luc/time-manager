// app/prepare.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

export default function PrepareScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "done">("loading");
  const [countdown, setCountdown] = useState(5);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // progress animation for visual feedback
    Animated.timing(progress, {
      toValue: 1,
      duration: 5000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // countdown timer 5s then mark done
    let remaining = 5;
    setCountdown(remaining);
    const interval = setInterval(() => {
      remaining -= 1;
      setCountdown(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(interval);
        setPhase("done");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [progress]);

  const handleStart = async () => {
    // ensure onboarding flag is set then go Home
    await AsyncStorage.setItem("hasOnboarded", "true");
    router.replace("/");
  };

  // interp progress -> width %
  const widthInterpolated = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["4%", "100%"],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.card}>
          {phase === "loading" ? (
            <>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.title}>Chúng tôi đang chuẩn bị lịch cho bạn</Text>
              <Text style={styles.subtitle}>
                Vui lòng chờ trong giây lát. ({countdown}s)
              </Text>

              <View style={styles.progressBar}>
                <Animated.View style={[styles.progress, { width: widthInterpolated }]} />
              </View>
            </>
          ) : (
            <>
              {/* Thay icon ✅ bằng GIF động của bạn */}
              <Image
                source={require("../assets/congratulations-13773_256.gif")} // đổi path nếu cần
                style={styles.doneIconImage}
              />
              <Text style={styles.title}>Hoàn tất!</Text>
              <Text style={styles.subtitle}>
                Lịch của bạn đã được chuẩn bị. Bấm Bắt đầu để vào ứng dụng.
              </Text>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.footerButtonWrap}
          activeOpacity={0.9}
          onPress={phase === "done" ? handleStart : undefined}
          disabled={phase !== "done"}
        >
          <LinearGradient
            colors={phase === "done" ? ["#2563EB", "#4F46E5"] : ["#cfd8ff", "#e8eaff"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.button, phase !== "done" && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>
              {phase === "done" ? "Bắt đầu" : "Đang tạo lịch..."}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, justifyContent: "space-between", padding: 20 },
  card: {
    marginTop: 40,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  title: { fontSize: 35, fontWeight: "700", marginTop: 16, textAlign: "center" },
  subtitle: { fontSize: 18, color: "#666", marginTop: 8, textAlign: "center" },
  progressBar: {
    marginTop: 20,
    width: "100%",
    height: 10,
    backgroundColor: "#eee",
    borderRadius: 999,
    overflow: "hidden",
  },
  progress: {
    height: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 999,
  },
  doneIconImage: {
    width: 296,
    height: 296,
    marginTop: 8,
  },
  doneIcon: { fontSize: 48, marginTop: 8 }, // kept if needed elsewhere
  footerButtonWrap: {
    paddingBottom: 16,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
