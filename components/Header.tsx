// components/Header.tsx
import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Header() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [notifications, setNotifications] = useState(3);
  const insets = useSafeAreaInsets();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
    // bổ sung logic đổi theme toàn app nếu cần
  };

  const showNotifications = () => {
    alert("Hiển thị notifications!");
  };

  return (
    <LinearGradient
      colors={["#2563EB", "#4F46E5"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          height: insets.top + 64, // 64: chiều cao header (h-16 ~ 64px)
        },
      ]}
    >
      <Image
        source={require("../assets/images/logo.png")}
        style={styles.logo}
      />

      <View style={styles.rightGroup}>
        {/* Theme Toggle */}
        <TouchableOpacity onPress={toggleTheme} style={styles.iconButton}>
          <Text style={styles.iconText}>
            {theme === "light" ? "🌙" : "☀️"}
          </Text>
        </TouchableOpacity>

        {/* Notifications */}
        <TouchableOpacity onPress={showNotifications} style={styles.iconButton}>
          <Text style={styles.iconText}>🔔</Text>
          {notifications > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notifications}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Settings */}
        <TouchableOpacity
          onPress={() => alert("Cài đặt!")}
          style={styles.iconButton}
        >
          <Text style={styles.iconText}>⚙️</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  logo: {
    width: 40,
    height: 40,
    resizeMode: "contain",
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    width: 40,
    height: 40,
    marginLeft: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  iconText: {
    color: "white",
    fontSize: 18,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "red",
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "white",
    fontSize: 10,
  },
});
