import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";

const LANGUAGES = [
  { id: "en", name: "English" },
  { id: "vi", name: "Tiếng Việt" },
];

export default function LanguageSettings({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const isDark = theme === "dark";

  async function selectLanguage(lang: "vi" | "en") {
    await setLanguage(lang);
  }

  const s = createStyles(isDark);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.close}>{t.languageSettings.close}</Text>
          </TouchableOpacity>
          <Text style={s.title}>{t.languageSettings.title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={s.container}>
          {LANGUAGES.map((lang, i) => (
            <TouchableOpacity
              key={lang.id}
              style={[
                s.row,
                {
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                },
              ]}
              onPress={() => selectLanguage(lang.id as "vi" | "en")}
              activeOpacity={0.7}
            >
              <Text style={s.label}>{lang.name}</Text>
              {language === lang.id && <Text style={s.check}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: isDark ? "#071226" : "#F6F7FB",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "#0f1724" : "#e5e7eb",
      backgroundColor: isDark ? "#071226" : "#F6F7FB",
    },
    close: {
      color: isDark ? "#60A5FA" : "#2563EB",
      fontWeight: "700",
      fontSize: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: isDark ? "#E6EEF8" : "#111",
    },
    container: {
      backgroundColor: isDark ? "#071226" : "#fff",
      borderRadius: 12,
      marginHorizontal: 16,
      marginTop: 16,
      borderWidth: 1,
      borderColor: isDark ? "#0f1724" : "#E5E7EB",
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderColor: isDark ? "#0f1724" : "#E5E7EB",
      backgroundColor: isDark ? "#071226" : "#fff",
    },
    label: {
      fontSize: 16,
      color: isDark ? "#E6EEF8" : "#111",
    },
    check: {
      color: isDark ? "#60A5FA" : "#22C55E",
      fontSize: 18,
      fontWeight: "600",
    },
  });
