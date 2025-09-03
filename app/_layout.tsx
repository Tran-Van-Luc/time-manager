// components/MainLayout.tsx
import React from "react";
import { View, StatusBar } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Header from "./../components/Header";
import Footer from "./../components/Footer";

const tabs = [
  { key: "home", route: "/" },
  { key: "tasks", route: "/tasks" },
  { key: "schedule", route: "/schedule" },
  { key: "pomodoro", route: "/pomodoro" },
  { key: "stats", route: "/stats" },
];

export default function MainLayout() {
  const router = useRouter();
  const segments = useSegments();
  const currentRoute = "/" + (segments[0] || "index");

  return (
    <SafeAreaProvider>
      {/* Header */}
      <LinearGradient
        colors={['#2563EB', '#4F46E5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
          <StatusBar barStyle="light-content" backgroundColor="#2563EB" />
          <Header />
        </SafeAreaView>
      </LinearGradient>

      {/* Nội dung chính */}
      <View style={{ flex: 1, backgroundColor: "white" }}>
        <Slot /> {/* Hiển thị màn hình hiện tại */}
      </View>

      {/* Footer cố định */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: 'white' }}>
        <Footer
          activeTab={tabs.find(tab => tab.route === currentRoute)?.key || "home"}
          onTabPress={(key) => {
            const tab = tabs.find(t => t.key === key);
            if (tab) router.push(tab.route); // dùng push để có hiệu ứng trượt
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
