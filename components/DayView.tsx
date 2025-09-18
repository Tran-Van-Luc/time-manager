// components/DayView.tsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Button,
  Platform,
  StyleSheet,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";

const DAY_NAMES = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export default function DayView({
  selectedDate,
  setSelectedDate,
  viewMode,
  setViewMode,
  showDatePicker,
  setShowDatePicker,
}: {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  viewMode: "day" | "week";
  setViewMode: (mode: "day" | "week") => void;
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
}) {
  const today = new Date();
  const [weekPickerVisible, setWeekPickerVisible] = useState(false);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  // --- Helpers ---
  function getFirstMondayOfYear(year: number) {
    let d = new Date(year, 0, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    return d;
  }
  function getMonday(d: Date) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }

  // --- Danh sách tuần ---
  const weeksOfYear = useMemo(() => {
    const weeks: { number: number; start: Date; end: Date }[] = [];
    let d = getFirstMondayOfYear(selectedYear);
    let week = 1;
    while (d.getFullYear() === selectedYear) {
      const start = new Date(d);
      const end = new Date(d);
      end.setDate(end.getDate() + 6);
      weeks.push({ number: week, start, end });
      d.setDate(d.getDate() + 7);
      week++;
    }
    return weeks;
  }, [selectedYear]);

  // --- Auto chọn tuần chứa ngày hiện tại khi vào app ---
  useEffect(() => {
    if (viewMode === "week") {
      const monday = getMonday(today);
      const currentWeek = weeksOfYear.find((w) => w.start.toDateString() === monday.toDateString());
      if (currentWeek) setSelectedDate(monday);
    }
  }, [viewMode, selectedYear]);

  const displayDate = `${DAY_NAMES[selectedDate.getDay()]}, ${selectedDate.toLocaleDateString("vi-VN")}`;

  const currentWeekNumber = useMemo(() => {
    const monday = getMonday(selectedDate);
    const week = weeksOfYear.find((w) => w.start.toDateString() === monday.toDateString());
    return week?.number ?? 1;
  }, [selectedDate, weeksOfYear]);

  function formatDate(d: Date) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function handleSelectWeek(week: { number: number; start: Date }) {
    setSelectedDate(new Date(week.start));
    setWeekPickerVisible(false);
  }

  // --- Scroll tới tuần hiện tại ---
  const flatListRef = useRef<FlatList>(null);
  const currentIndex = weeksOfYear.findIndex(
    (w) => w.number === currentWeekNumber && selectedYear === today.getFullYear()
  );

  useEffect(() => {
    if (weekPickerVisible && currentIndex >= 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: currentIndex,
          animated: true,
          viewPosition: 0.5,
        });
      }, 50);
    }
  }, [weekPickerVisible, currentIndex]);

  return (
    <View style={styles.container}>
      {viewMode === "day" ? (
        <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateText}>{displayDate}</Text>
          <Ionicons name="chevron-down" size={18} color="#1D4ED8" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.dateSelector} onPress={() => setWeekPickerVisible(true)}>
          <Text style={styles.dateText}>
            Năm {selectedYear} - Tuần {currentWeekNumber}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#1D4ED8" />
        </TouchableOpacity>
      )}

      {/* Toggle day/week */}
      <View style={styles.viewToggle}>
        <TouchableOpacity
          onPress={() => {
            setSelectedDate(today); // ✅ reset về hôm nay khi về day view
            setViewMode("day");
          }}
        >
          <MaterialIcons name="menu" size={24} color={viewMode === "day" ? "#1D4ED8" : "#999"} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setViewMode("week");
          }}
          style={{ marginLeft: 12 }}
        >
          <MaterialIcons name="view-week" size={24} color={viewMode === "week" ? "#1D4ED8" : "#999"} />
        </TouchableOpacity>
      </View>

      {/* Date Picker cho view ngày */}
      {showDatePicker &&
        (Platform.OS === "ios" ? (
          <Modal transparent animationType="slide" visible={showDatePicker}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="inline"
                  onChange={(_, date) => date && setSelectedDate(date)}
                />
                <Button title="Xong" onPress={() => setShowDatePicker(false)} />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={(_, date) => {
              setShowDatePicker(false);
              if (date) setSelectedDate(date);
            }}
          />
        ))}

      {/* Modal chọn tuần */}
      <Modal visible={weekPickerVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setWeekPickerVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.weekModal}>
              {/* Chọn năm */}
              <View style={styles.yearRow}>
                <TouchableOpacity
                  onPress={() => setSelectedYear((y) => Math.max(y - 1, today.getFullYear() - 1))}
                >
                  <MaterialIcons name="chevron-left" size={24} color="#1D4ED8" />
                </TouchableOpacity>
                <Text style={styles.yearText}>{selectedYear}</Text>
                <TouchableOpacity
                  onPress={() => setSelectedYear((y) => Math.min(y + 1, today.getFullYear() + 1))}
                >
                  <MaterialIcons name="chevron-right" size={24} color="#1D4ED8" />
                </TouchableOpacity>
              </View>

              {/* Danh sách tuần */}
              <FlatList
                ref={flatListRef}
                data={weeksOfYear}
                keyExtractor={(item) => item.number.toString()}
                getItemLayout={(data, index) => ({
                  length: 50,
                  offset: 50 * index,
                  index,
                })}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.weekItem,
                      item.number === currentWeekNumber && selectedYear === today.getFullYear()
                        ? styles.weekItemActive
                        : null,
                    ]}
                    onPress={() => handleSelectWeek(item)}
                  >
                    <Text
                      style={[
                        styles.weekText,
                        item.number === currentWeekNumber && selectedYear === today.getFullYear()
                          ? styles.weekTextActive
                          : null,
                      ]}
                    >
                      Tuần {item.number} ({formatDate(item.start)} – {formatDate(item.end)})
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  dateSelector: { flexDirection: "row", alignItems: "center", flex: 1 },
  dateText: { color: "#1D4ED8", fontSize: 16, marginRight: 4 },
  viewToggle: { flexDirection: "row", alignItems: "center" },
  modalOverlay: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "white", padding: 16, borderRadius: 16 },
  weekModal: { backgroundColor: "white", margin: 20, borderRadius: 12, padding: 10, maxHeight: "70%" },
  yearRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 10 },
  yearText: { fontSize: 18, fontWeight: "bold", color: "#1D4ED8", marginHorizontal: 10 },
  weekItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  weekItemActive: { backgroundColor: "#DBEAFE", borderRadius: 8 },
  weekText: { fontSize: 16, color: "#111" },
  weekTextActive: { fontWeight: "bold", color: "#1D4ED8" },
});
