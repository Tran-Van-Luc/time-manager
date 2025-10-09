import React, { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { View, StatusBar, ActivityIndicator, StyleSheet } from "react-native";
import Header from "../components/Header";
import Footer from "../components/Footer";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemeProvider, useTheme } from "../context/ThemeContext";

const tabs = [
  { key: "home", route: "/" },
  { key: "tasks", route: "/tasks" },
  { key: "schedule", route: "/schedule" },
  { key: "pomodoro", route: "/pomodoro" },
  { key: "stats", route: "/stats" },
];

function LayoutContent() {
  const router = useRouter();
  const segments = useSegments();
  const currentRoute = "/" + (segments?.[0] || "");

  const [loading, setLoading] = useState(true);


  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const colors = {
    background: isDark ? '#121212' : '#FFFFFF',
    activityIndicator: isDark ? '#FFFFFF' : '#2E6EF7'
  };

  useEffect(() => {
    let mounted = true;
    const checkOnboarding = async () => {
      try {
        const onboarded = await AsyncStorage.getItem("hasOnboarded");
        if (mounted) {
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
      <View style={[styles.loaderContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.activityIndicator} />
      </View>
    );
  }

  const noChromeRoutes = [
    "/onboarding",
    "/name-schedule",
    "/prepare",
    "/setting",
  ];

  const showChrome = !noChromeRoutes.includes(currentRoute) || currentRoute === "/";
  
  return (
    <SafeAreaProvider>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? "light-content" : "dark-content"}
      />

      {showChrome && <Header />}


      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Slot />
      </View>

      {showChrome && (
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background }}>
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

export default function MainLayout() {
  return (
    <ThemeProvider>
      <LayoutContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});