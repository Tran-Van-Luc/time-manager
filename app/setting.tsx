import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  StatusBar,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AntDesign } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import AppearanceSettings from "../components/settings/AppearanceSettings";
import LanguageSettings from "../components/settings/LanguageSettings";
import WidgetSettings from "../components/settings/WidgetSettings";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from 'expo-notifications';
import { refreshNotifications } from '../utils/notificationScheduler';
import DataManagementSettings from "../components/settings/DataManagementSettings";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { theme } = useTheme();
  const { t } = useLanguage();
  const isDark = theme === "dark";

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const [showDataManagement, setShowDataManagement] = useState(false);

  // Load persisted notification setting on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await AsyncStorage.getItem('notificationsEnabled');
        if (mounted && s !== null) {
          setNotifEnabled(s === '1');
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  // Persist and apply when toggled
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem('notificationsEnabled', notifEnabled ? '1' : '0');
        if (!notifEnabled) {
          try {
            await Notifications.cancelAllScheduledNotificationsAsync();
          } catch (e) {}
        } else {
          try {
            await refreshNotifications();
          } catch (e) {}
        }
      } catch (e) {}
    })();
  }, [notifEnabled]);

  const colors = {
    background: isDark ? "#121212" : "#f6f7fb",
    surface: isDark ? "#1E1E1E" : "#fff",
    text: isDark ? "#E1E1E1" : "#111",
    subtleText: isDark ? "#A0A0A0" : "#ddd",
    border: isDark ? "#333" : "#ddd",
    accent: "#2563EB",
  };

  const Row = ({ icon, title, right, onPress }: any) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.icon, { color: colors.text }]}>{icon}</Text>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <View style={styles.right}>{right}</View>
    </TouchableOpacity>
  );

  const handlePress = (action: string) => {
    console.log(`Pressed: ${action}`);
    if (action === "contact") {
      const email = "tuannguyen12a22k3@gmail.com";
      const subject = encodeURIComponent("Hỗ trợ ứng dụng Quản lý thời gian");
      const body = encodeURIComponent(
        "Xin chào đội hỗ trợ,\n\nTôi gặp sự cố hoặc có góp ý như sau:\n\n..."
      );
      const mailtoURL = `mailto:${email}?subject=${subject}&body=${body}`;
      Linking.openURL(mailtoURL).catch((err) =>
        console.error("Không thể mở ứng dụng email:", err)
      );
    }
    else if (action === "survey") {
      const formURL = "https://forms.gle/zJiHDCMRr3ffAgbv6";
      Linking.openURL(formURL).catch((err) =>
        console.error("Không thể mở link khảo sát:", err)
      );
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 8 },
      ]}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.closeText, { color: colors.accent }]}>
            {t.settings.close}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t.settings.title}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Group 1 */}
        <View style={[styles.group, { borderColor: colors.border }]}>
          {/* Thông báo */}
          <Row
            icon="🔔"
            title={t.settings.notifications}
            right={
              <View style={styles.switchWrap}>
                <Switch
                  value={notifEnabled}
                  onValueChange={setNotifEnabled}
                  trackColor={{ false: "#ccc", true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>
            }
            onPress={() => setNotifEnabled((v) => !v)}
          />

          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          {/* Giao diện */}
          <Row
            icon="⚙️"
            title={t.settings.appearance}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => setShowAppearance(true)}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          {/* Ngôn ngữ */}
          <Row
            icon="🌐"
            title={t.settings.language}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => setShowLanguage(true)}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />
        </View>

        {/* Group 2 */}
        <View style={[styles.group, { borderColor: colors.border }]}>
          <Row
            icon="💾"
            title={t.settings.dataManagement}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => setShowDataManagement(true)}
          />
        </View>

        {/* Group 3 */}
        <View style={[styles.group, { borderColor: colors.border }]}>
          <Row
            icon="❓"
            title={t.settings.help}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("help")}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          <Row
            icon="🔗"
            title={t.settings.contactSupport}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("contact")}
          />
        </View>

        {/* Group 4 */}
        <View style={[styles.group, { borderColor: colors.border }]}>
          <Row
            icon="📝"
            title={t.settings.joinSurvey}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("survey")}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          <Row
            icon="👥"
            title={t.settings.inviteFriends}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("inviteFriends")}
          />
        </View>

        {/* Group 5 */}
        <View style={[styles.group, { borderColor: colors.border }]}>
          <Row
            icon="📄"
            title={t.settings.termsOfUse}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("termsOfUse")}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          <Row
            icon="🛡️"
            title={t.settings.privacyPolicy}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("privacyPolicy")}
          />
        </View>
      </ScrollView>

      <AppearanceSettings visible={showAppearance} onClose={() => setShowAppearance(false)} />
      <LanguageSettings visible={showLanguage} onClose={() => setShowLanguage(false)} />
      <WidgetSettings visible={showWidget} onClose={() => setShowWidget(false)} />
      <DataManagementSettings visible={showDataManagement} onClose={() => setShowDataManagement(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  closeText: { fontSize: 16, fontWeight: "600" },
  headerTitle: { fontSize: 20, fontWeight: "700" },

  content: { paddingVertical: 16, paddingHorizontal: 16 },
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    height: 55,
  },
  icon: {
    fontSize: 20,
    width: 32,
    textAlign: "center",
  },
  title: {
    flex: 1,
    fontSize: 16,
    marginLeft: 10,
  },
  right: {
    minWidth: 20,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  switchWrap: {
    transform: [{ scale: 0.9 }],
    justifyContent: "center",
    alignItems: "center",
    right: -6,
  },

  rowDivider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
});
