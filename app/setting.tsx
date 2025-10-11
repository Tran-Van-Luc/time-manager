// app/setting.tsx
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
import AppearanceSettings from "../components/settings/AppearanceSettings";
import LanguageSettings from "../components/settings/LanguageSettings";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from 'expo-notifications';
import { refreshNotifications } from '../utils/notificationScheduler';

const STORAGE_KEY_LANG = "appLanguage";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [showAppearance, setShowAppearance] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);

  const [labels, setLabels] = useState({
    close: "Đóng",
    title: "Cài đặt",
    notifications: "Thông báo",
    appearance: "Giao diện",
    language: "Ngôn ngữ",
    detailedSettings: "Thiết lập chi tiết",
    utilities: "Tiện ích",
    dataManagement: "Quản lý dữ liệu",
    help: "Trợ giúp",
    contactSupport: "Liên hệ hỗ trợ",
    joinSurvey: "Tham gia khảo sát",
    rateApp: "Đánh giá ứng dụng",
    inviteFriends: "Mời bạn bè",
    termsOfUse: "Điều khoản sử dụng",
    privacyPolicy: "Chính sách bảo mật",
  });

  useEffect(() => {
    (async () => {
      try {
        const l = (await AsyncStorage.getItem(STORAGE_KEY_LANG)) as "vi" | "en" | null;
        if (l === "en") {
          setLabels({
            close: "Close",
            title: "Settings",
            notifications: "Notifications",
            appearance: "Appearance",
            language: "Language",
            detailedSettings: "Detailed Settings",
            utilities: "Utilities",
            dataManagement: "Data Management",
            help: "Help",
            contactSupport: "Contact Support",
            joinSurvey: "Join Survey",
            rateApp: "Rate App",
            inviteFriends: "Invite Friends",
            termsOfUse: "Terms of Use",
            privacyPolicy: "Privacy Policy",
          });
        } else {
          setLabels({
            close: "Đóng",
            title: "Cài đặt",
            notifications: "Thông báo",
            appearance: "Giao diện",
            language: "Ngôn ngữ",
            detailedSettings: "Thiết lập chi tiết",
            utilities: "Tiện ích",
            dataManagement: "Quản lý dữ liệu",
            help: "Trợ giúp",
            contactSupport: "Liên hệ hỗ trợ",
            joinSurvey: "Tham gia khảo sát",
            rateApp: "Đánh giá ứng dụng",
            inviteFriends: "Mời bạn bè",
            termsOfUse: "Điều khoản sử dụng",
            privacyPolicy: "Chính sách bảo mật",
          });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [showLanguage]);

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
      Linking.openURL("mailto:support@example.com");
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
          <Text style={[styles.closeText, { color: colors.accent }]}>{labels.close}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{labels.title}</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Group 1 */}
        <View style={[styles.group, { borderColor: colors.border }]}>
          {/* Thông báo */}
          <Row
            icon="🔔"
            title={labels.notifications}
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
            title={labels.appearance}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => setShowAppearance(true)}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          {/* Ngôn ngữ */}
          <Row
            icon="🌐"
            title={labels.language}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => setShowLanguage(true)}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />
        </View>

        {/* Group 2 */}
        <View style={[styles.group, { borderColor: colors.border }]}>
          <Row
            icon="🧩"
            title={labels.utilities}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("utilities")}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          <Row
            icon="💾"
            title={labels.dataManagement}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("dataManagement")}
          />
        </View>

        {/* Group 3 */}
        <View style={[styles.group, { borderColor: colors.border }]}>
          <Row
            icon="❓"
            title={labels.help}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("help")}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          <Row
            icon="🔗"
            title={labels.contactSupport}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("contact")}
          />
        </View>

        {/* Group 4 */}
        <View style={[styles.group, { borderColor: colors.border }]}>
          <Row
            icon="📝"
            title={labels.joinSurvey}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("joinSurvey")}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          <Row
            icon="❤️"
            title={labels.rateApp}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("rateApp")}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          <Row
            icon="👥"
            title={labels.inviteFriends}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("inviteFriends")}
          />
        </View>

        {/* Group 5 */}
        <View style={[styles.group, { borderColor: colors.border }]}>
          <Row
            icon="📄"
            title={labels.termsOfUse}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("termsOfUse")}
          />
          <View style={[styles.rowDivider, { backgroundColor: colors.subtleText }]} />

          <Row
            icon="🛡️"
            title={labels.privacyPolicy}
            right={<AntDesign name="right" size={18} color={colors.subtleText} />}
            onPress={() => handlePress("privacyPolicy")}
          />
        </View>

        <AppearanceSettings visible={showAppearance} onClose={() => setShowAppearance(false)} />
        <LanguageSettings visible={showLanguage} onClose={() => setShowLanguage(false)} />
      </ScrollView>
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
