// components/Header.tsx
import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Header() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [notifications, setNotifications] = useState(3);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let mounted = true;
    const loadName = async () => {
      try {
        // ưu tiên tên lịch đã lưu; nếu không có, lấy userId và có thể truy DB sau
        const scheduleName = await AsyncStorage.getItem("scheduleName");
        if (mounted) {
          if (scheduleName) {
            setDisplayName(scheduleName);
          } else {
            // fallback tên mặc định nếu chưa set
            setDisplayName("StudyTime");
          }
        }
      } catch (e) {
        if (mounted) setDisplayName("StudyTime");
      }
    };
    loadName();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleTheme = () => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
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
          height: insets.top + 64,
        },
      ]}
    >
      <View style={styles.leftGroup}>
        <Image
          source={require("../assets/images/logonew.png")}
          style={styles.logo}
        />
        <Text numberOfLines={1} style={styles.appName}>
          {displayName || "StudyTime"}
        </Text>
      </View>

      <View style={styles.rightGroup}>
        <TouchableOpacity onPress={toggleTheme} style={styles.iconButton}>
          <Text style={styles.iconText}>
            {theme === "light" ? "🌙" : "☀️"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={showNotifications} style={styles.iconButton}>
          <Text style={styles.iconText}>🔔</Text>
          {notifications > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notifications}</Text>
            </View>
          )}
        </TouchableOpacity>

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
    paddingHorizontal: 12,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logo: {
    width: 40,
    height: 40,
    resizeMode: "contain",
    marginRight: 10,
  },
  appName: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    maxWidth: "60%",
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    width: 40,
    height: 40,
    marginLeft: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
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
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: "red",
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
  },
});
