// components/WeekView.tsx
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { ScheduleItem } from "../../hooks/useSchedules";
import { useLanguage } from "../../context/LanguageContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SESSION_COL_WIDTH = 60;
const DAY_COL_WIDTH = (SCREEN_WIDTH - SESSION_COL_WIDTH) / 7.4;
const ROW_HEIGHT = 160;

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const SESSIONS = ["Sáng", "Chiều", "Tối"];

interface Props {
  weekDates: Date[];
  schedules: (ScheduleItem & { typeLabel?: string })[];
  typeStyle: Record<string, { color: string; emoji: string; pillBg: string }>;
  onSelectItem: (item: ScheduleItem) => void;
  theme: "light" | "dark";
}

export default function WeekView({
  weekDates,
  schedules,
  typeStyle,
  onSelectItem,
  theme,
}: Props) {
  const { language, t } = useLanguage();

  // localization for static UI bits in this component
  const L = {
    vi: {
      morning: "Sáng",
      afternoon: "Chiều",
      evening: "Tối",
      empty: "–",
      legendTitle: "Chú thích",
      dayDateFormat: (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`,
    },
    en: {
      morning: "Morning",
      afternoon: "Afternoon",
      evening: "Evening",
      empty: "–",
      legendTitle: "Legend",
      dayDateFormat: (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`,
    },
  }[language];

  // dynamic themed styles
  const themedStyles = useMemo(
    () => ({
      wrapper: {
        backgroundColor: theme === "dark" ? "#1a1a1a" : "#fff",
      },
      sessionLabel: {
        color: theme === "dark" ? "#e5e5e5" : "#111",
      },
      dayHeader: {
        backgroundColor: theme === "dark" ? "#2a2a2a" : "#fafafa",
        color: theme === "dark" ? "#e5e5e5" : "#111",
        borderColor: theme === "dark" ? "#444" : "#ddd",
      },
      sessionRow: {
        borderColor: theme === "dark" ? "#333" : "#eee",
      },
      sessionColumn: {
        borderColor: theme === "dark" ? "#333" : "#eee",
      },
      dayColumn: {
        borderColor: theme === "dark" ? "#333" : "#eee",
      },
      emptySession: {
        color: theme === "dark" ? "#666" : "#aaa",
      },
      legendContainer: {
        backgroundColor: theme === "dark" ? "#2a2a2a" : "#f9f9f9",
        borderColor: theme === "dark" ? "#333" : "#eee",
      },
      legendText: {
        color: theme === "dark" ? "#a3a3a3" : "#374151",
      },
    }),
    [theme]
  );

  // Normalize raw type values (from DB or older data) to current translated label keys used by typeStyle
  function normalizeTypeToLabel(rawType: string | undefined): string {
    if (!rawType) return rawType ?? "";

    const trimmed = String(rawType).trim();

    // Map canonical keys to translated labels (use t.schedule.types if available)
    const keyToLabel: Record<string, string> = {
      theory: t.schedule?.types?.theory ?? "Lịch học lý thuyết",
      practice: t.schedule?.types?.practice ?? "Lịch học thực hành",
      exam: t.schedule?.types?.exam ?? "Lịch thi",
      suspended: t.schedule?.types?.suspended ?? "Lịch tạm ngưng",
      makeup: t.schedule?.types?.makeup ?? "Lịch học bù",
    };

    const lower = trimmed.toLowerCase();

    // Direct key matches
    if (keyToLabel[lower]) return keyToLabel[lower];

    // Common Vietnamese stored labels
    const vnMatch: Record<string, string> = {
      "lịch học lý thuyết": keyToLabel.theory,
      "lịch học thực hành": keyToLabel.practice,
      "lịch thi": keyToLabel.exam,
      "lịch tạm ngưng": keyToLabel.suspended,
      "lịch học bù": keyToLabel.makeup,
      "học lý thuyết": keyToLabel.theory,
      "thực hành": keyToLabel.practice,
      "thi": keyToLabel.exam,
      "tạm ngưng": keyToLabel.suspended,
      "học bù": keyToLabel.makeup,
    };
    if (vnMatch[lower]) return vnMatch[lower];

    // Common English stored labels
    const enMatch: Record<string, string> = {
      "theory class": keyToLabel.theory,
      "theory": keyToLabel.theory,
      "practice class": keyToLabel.practice,
      "practice": keyToLabel.practice,
      "exam": keyToLabel.exam,
      "suspended": keyToLabel.suspended,
      "makeup class": keyToLabel.makeup,
      "makeup": keyToLabel.makeup,
    };
    if (enMatch[lower]) return enMatch[lower];

    // heuristics
    if (lower.includes("lý thuyết") || lower.includes("theory")) return keyToLabel.theory;
    if (lower.includes("thực hành") || lower.includes("practice")) return keyToLabel.practice;
    if (lower.includes("thi") || lower.includes("exam")) return keyToLabel.exam;
    if (lower.includes("tạm ngưng") || lower.includes("suspend")) return keyToLabel.suspended;
    if (lower.includes("bù") || lower.includes("makeup")) return keyToLabel.makeup;

    // fallback: return original trimmed string
    return trimmed;
  }

  // Determine session for a given date/time
  const getSession = (date: Date) => {
    const m = date.getHours() * 60 + date.getMinutes();
    if (m >= 390 && m < 720) return "Sáng";
    if (m >= 750 && m < 1050) return "Chiều";
    return "Tối";
  };

  // Group schedules per day (using startAt date)
  const groupedByDay = useMemo(() => {
    const map: Record<string, (ScheduleItem & { typeLabel?: string })[]> = {};
    weekDates.forEach((d) => {
      map[d.toDateString()] = [];
    });
    schedules.forEach((s) => {
      const key = s.startAt.toDateString();
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules, weekDates]);

  // Helper to get style for an item using either item.typeLabel or normalized item.type
  function getStyleForItem(item: ScheduleItem & { typeLabel?: string }) {
    const label = (item as any).typeLabel ?? normalizeTypeToLabel(item.type);
    const st = typeStyle[label] || {
      color: "#6B7280",
      pillBg: theme === "dark" ? "#2a2a2a" : "#fff",
      emoji: "",
    };
    return { st, label };
  }

  return (
    <View style={[styles.wrapper, themedStyles.wrapper]}>
      {/* Grid tuần */}
      <View style={styles.container}>
        {/* Cột Phiên */}
        <View style={[styles.sessionColumn, themedStyles.sessionColumn]}>
          {SESSIONS.map((s, i) => (
            <View key={i} style={[styles.sessionRow1, { height: ROW_HEIGHT }]}>
              <Text style={[styles.sessionLabel, themedStyles.sessionLabel]}>
                {s === "Sáng" ? "🌅" : s === "Chiều" ? "🌞" : "🌙"}{" "}
                {s === "Sáng" ? L.morning : s === "Chiều" ? L.afternoon : L.evening}
              </Text>
            </View>
          ))}
        </View>

        {/* 7 cột ngày */}
        {weekDates.map((day, idx) => {
          const dayItems = groupedByDay[day.toDateString()] || [];

          return (
            <View key={idx} style={[styles.dayColumn, themedStyles.dayColumn]}>
              <Text style={[styles.dayHeader, themedStyles.dayHeader]}>
                {DAY_LABELS[idx]}{"\n"}
                {L.dayDateFormat(day)}
              </Text>

              {SESSIONS.map((session, i) => {
                const items = dayItems.filter((it) => getSession(it.startAt) === session);
                return (
                  <View
                    key={i}
                    style={[
                      styles.sessionRow,
                      themedStyles.sessionRow,
                      { height: ROW_HEIGHT },
                    ]}
                  >
                    <View style={styles.content}>
                      {items.length === 0 ? (
                        <Text style={[styles.emptySession, themedStyles.emptySession]}>
                          {L.empty}
                        </Text>
                      ) : (
                        items.map((item) => {
                          const { st, label } = getStyleForItem(item as any);
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.labelCard,
                                {
                                  backgroundColor:
                                    theme === "dark"
                                      ? `${st.color}20`
                                      : st.pillBg,
                                  borderLeftColor: st.color,
                                },
                              ]}
                              onPress={() => onSelectItem(item)}
                            >
                              <Text style={[styles.labelText, { color: st.color }]}>
                                {st.emoji} {item.subject}
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>

      {/* Chú thích (legend) */}
      <View style={[styles.legendContainer, themedStyles.legendContainer]}>
        {Object.entries(typeStyle).map(([key, st]) => (
          <View key={key} style={styles.legendItem}>
            <View
              style={[
                styles.legendBox,
                {
                  borderLeftColor: st.color,
                  backgroundColor: theme === "dark" ? `${st.color}20` : st.pillBg,
                },
              ]}
            />
            <Text style={[styles.legendText, themedStyles.legendText]}>
              {st.emoji} {key}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flexDirection: "row",
  },
  sessionColumn: {
    width: SESSION_COL_WIDTH,
    borderRightWidth: 1,
  },
  sessionRow1: {
    justifyContent: "center",
    alignItems: "center",
  },
  sessionRow: {
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  sessionLabel: {
    fontWeight: "bold",
    fontSize: 12,
    textAlign: "center",
  },
  dayColumn: {
    width: DAY_COL_WIDTH,
    borderRightWidth: 1,
  },
  dayHeader: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  content: {
    flex: 1,
    padding: 2,
  },
  labelCard: {
    borderRadius: 4,
    borderLeftWidth: 3,
    paddingVertical: 2,
    paddingHorizontal: 4,
    marginVertical: 2,
  },
  labelText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptySession: {
    fontSize: 10,
  },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    borderTopWidth: 1,
    paddingVertical: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 6,
    marginVertical: 4,
  },
  legendBox: {
    width: 18,
    height: 12,
    borderLeftWidth: 4,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
  },
});
