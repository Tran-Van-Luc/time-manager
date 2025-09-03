import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export default function Header() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [notifications, setNotifications] = useState(3);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
    // thêm logic đổi theme app nếu muốn
  };

  const showNotifications = () => {
    alert("Hiển thị notifications!");
  };

  return (
    <LinearGradient
      colors={["#2563EB", "#7C3AED"]}
      className="h-16 w-full justify-center px-4"
    >
      <View className="flex-row justify-between items-center">
        <Image
          source={require("../assets/images/logo.png")}
          style={{ width: 40, height: 40, resizeMode: "contain" }}
        />

        <View className="flex-row items-center">
          {/* Theme */}
          <TouchableOpacity
            onPress={toggleTheme}
            className="bg-white/20 rounded-full justify-center items-center"
            style={{ width: 40, height: 40, marginRight: 12 }}
          >
            <Text className="text-white text-lg">
              {theme === "light" ? "🌙" : "☀️"}
            </Text>
          </TouchableOpacity>

          {/* Notifications */}
          <TouchableOpacity
            onPress={showNotifications}
            className="bg-white/20 rounded-full justify-center items-center relative"
            style={{ width: 40, height: 40, marginRight: 12 }}
          >
            <Text>🔔</Text>
            {notifications > 0 && (
              <View className="absolute -top-1 -right-1 bg-red-500 w-5 h-5 rounded-full justify-center items-center">
                <Text className="text-white text-xs">{notifications}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Settings */}
          <TouchableOpacity
            onPress={() => alert("Cài đặt!")}
            className="bg-white/20 rounded-full justify-center items-center"
            style={{ width: 40, height: 40 }}
          >
            <Text className="text-white text-lg">⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}
