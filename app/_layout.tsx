// app/_layout.tsx
import React, { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { View, StatusBar, ActivityIndicator } from "react-native";
import Header from "../components/Header";
import Footer from "../components/Footer";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  const currentRoute = "/" + (segments?.[0] || "index");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const checkOnboarding = async () => {
      try {
        const onboarded = await AsyncStorage.getItem("hasOnboarded");
        if (mounted) {
          // nếu chưa onboard và không ở trang onboarding/name-schedule/prepare => chuyển về onboarding
          if (
            !onboarded &&
            currentRoute !== "/onboarding" &&
            currentRoute !== "/name-schedule" &&
            currentRoute !== "/prepare"
          ) {
            router.replace("/onboarding");
          }
          setLoading(false);
        }
      } catch (e) {
        if (mounted) setLoading(false);
      }
    };
    checkOnboarding();
    return () => {
      mounted = false;
    };
  }, [segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#2E6EF7" />
      </View>
    );
  }

  // routes where header/footer (chrome) should be hidden
  const noChromeRoutes = ["/onboarding", "/name-schedule", "/prepare"];
  const showChrome = !noChromeRoutes.includes(currentRoute);

  return (
    <SafeAreaProvider>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* HEADER */}
      {showChrome && <Header />}

      {/* CONTENT */}
      <View style={{ flex: 1, backgroundColor: "white" }}>
        <Slot />
      </View>

      {/* FOOTER */}
      {showChrome && (
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: "white" }}>
          <Footer
            activeTab={tabs.find((t) => t.route === currentRoute)?.key || "home"}
            onTabPress={(key) => {
              const tab = tabs.find((t) => t.key === key);
              if (tab) router.push(tab.route);
            }}
          />
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}
