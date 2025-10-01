// components/WeekView.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { ScheduleItem } from "../../hooks/useSchedules";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Chiều rộng cột “Phiên”
const SESSION_COL_WIDTH = 60;
// Chia đều phần còn lại cho 7 ngày trong tuần
const DAY_COL_WIDTH = (SCREEN_WIDTH - SESSION_COL_WIDTH) / 7.4;
// Chiều cao mỗi hàng phiên
const ROW_HEIGHT = 160;

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const SESSIONS = ["Sáng", "Chiều", "Tối"];

interface Props {
  weekDates: Date[];
  schedules: ScheduleItem[];
  typeStyle: Record<string, { color: string; emoji: string; pillBg: string }>;
  onSelectItem: (item: ScheduleItem) => void;
}

export default function WeekView({
  weekDates,
  schedules,
  typeStyle,
  onSelectItem,
}: Props) {
  const getSession = (date: Date) => {
    const m = date.getHours() * 60 + date.getMinutes();
    if (m >= 390 && m < 720) return "Sáng";
    if (m >= 750 && m < 1050) return "Chiều";
    return "Tối";
  };

  return (
    <View style={styles.wrapper}>
      {/* Grid tuần */}
      <View style={styles.container}>
        {/* Cột Phiên */}
        <View style={styles.sessionColumn}>
          {SESSIONS.map((s, i) => (
            <View key={i} style={[styles.sessionRow1, { height: ROW_HEIGHT }]}>
              <Text style={styles.sessionLabel}>
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
            <View key={idx} style={styles.dayColumn}>
              <Text style={styles.dayHeader}>
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
                    style={[styles.sessionRow, { height: ROW_HEIGHT }]}
                  >
                    <View style={styles.content}>
                      {items.length === 0 ? (
                        <Text style={styles.emptySession}>–</Text>
                      ) : (
                        items.map((item) => {
                          const st = typeStyle[item.type] || {
                            color: "#6B7280",
                            pillBg: "#fff",
                            emoji: "",
                          };
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.labelCard,
                                {
                                  backgroundColor: st.pillBg,
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
      <View style={styles.legendContainer}>
        {Object.entries(typeStyle).map(([key, st]) => (
          <View key={key} style={styles.legendItem}>
            <View
              style={[
                styles.legendBox,
                { borderLeftColor: st.color, backgroundColor: st.pillBg },
              ]}
            />
            <Text style={styles.legendText}>
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
    backgroundColor: "#fff",
  },
  container: {
    flexDirection: "row",
  },
  sessionColumn: {
    width: SESSION_COL_WIDTH,
    borderRightWidth: 1,
    borderColor: "#eee",
  },
  sessionRow1: {
    justifyContent: "center",
    alignItems: "center",
  },
  sessionRow: {
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  sessionLabel: {
    fontWeight: "bold",
    fontSize: 12,
    textAlign: "center",
  },
  dayColumn: {
    width: DAY_COL_WIDTH,
    borderRightWidth: 1,
    borderColor: "#eee",
  },
  dayHeader: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fafafa",
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
    color: "#aaa",
  },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderColor: "#eee",
    paddingVertical: 8,
    backgroundColor: "#f9f9f9",
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
    color: "#374151",
  },
});
