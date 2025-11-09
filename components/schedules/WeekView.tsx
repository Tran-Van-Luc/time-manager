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

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SESSION_COL_WIDTH = 60;
const DAY_COL_WIDTH = (SCREEN_WIDTH - SESSION_COL_WIDTH) / 7.4;
const ROW_HEIGHT = 160;

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const SESSIONS = ["Sáng", "Chiều", "Tối"];

interface Props {
  weekDates: Date[];
  schedules: ScheduleItem[];
  typeStyle: Record<string, { color: string; emoji: string; pillBg: string }>;
  onSelectItem: (item: ScheduleItem) => void;
  theme: "light" | "dark"; // ✅ THÊM PROP THEME
}

export default function WeekView({
  weekDates,
  schedules,
  typeStyle,
  onSelectItem,
  theme, // ✅ NHẬN THEME
}: Props) {
  // ✅ DYNAMIC STYLES DỰA TRÊN THEME
  const themedStyles = useMemo(() => ({
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
  }), [theme]);

  const getSession = (date: Date) => {
    const m = date.getHours() * 60 + date.getMinutes();
    if (m >= 390 && m < 720) return "Sáng";
    if (m >= 750 && m < 1050) return "Chiều";
    return "Tối";
  };

  return (
    <View style={[styles.wrapper, themedStyles.wrapper]}>
      {/* Grid tuần */}
      <View style={styles.container}>
        {/* Cột Phiên */}
        <View style={[styles.sessionColumn, themedStyles.sessionColumn]}>
          {SESSIONS.map((s, i) => (
            <View key={i} style={[styles.sessionRow1, { height: ROW_HEIGHT }]}>
              <Text style={[styles.sessionLabel, themedStyles.sessionLabel]}>
                {s === "Sáng" ? "🌅" : s === "Chiều" ? "🌞" : "🌙"} {s}
              </Text>
            </View>
          ))}
        </View>

        {/* 7 cột ngày */}
        {weekDates.map((day, idx) => {
          const dayItems = schedules.filter(
            (s) => s.startAt.toDateString() === day.toDateString()
          );

          return (
            <View key={idx} style={[styles.dayColumn, themedStyles.dayColumn]}>
              <Text style={[styles.dayHeader, themedStyles.dayHeader]}>
                {DAY_LABELS[idx]}{"\n"}
                {day.getDate()}/{day.getMonth() + 1}
              </Text>

              {SESSIONS.map((session, i) => {
                const items = dayItems.filter(
                  (it) => getSession(it.startAt) === session
                );
                return (
                  <View
                    key={i}
                    style={[
                      styles.sessionRow,
                      themedStyles.sessionRow,
                      { height: ROW_HEIGHT }
                    ]}
                  >
                    <View style={styles.content}>
                      {items.length === 0 ? (
                        <Text style={[styles.emptySession, themedStyles.emptySession]}>
                          –
                        </Text>
                      ) : (
                        items.map((item) => {
                          const st = typeStyle[item.type] || {
                            color: "#6B7280",
                            pillBg: theme === "dark" ? "#2a2a2a" : "#fff",
                            emoji: "",
                          };
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.labelCard,
                                {
                                  backgroundColor: theme === "dark" 
                                    ? `${st.color}20` // Màu với opacity cho dark mode
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
                  backgroundColor: theme === "dark" 
                    ? `${st.color}20` 
                    : st.pillBg 
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
