// app/_layout.tsx
import React from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { View, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Header from "../components/Header";
import Footer from "../components/Footer";

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
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* HEADER */}
      <Header />

      {/* CONTENT */}
      <View style={{ flex: 1, backgroundColor: "white" }}>
        <Slot />
      </View>

      {/* FOOTER */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: 'white' }}>
        <Footer
          activeTab={tabs.find(t => t.route === currentRoute)?.key || "home"}
          onTabPress={(key) => {
            const tab = tabs.find(t => t.key === key);
            if (tab) router.push(tab.route);
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
