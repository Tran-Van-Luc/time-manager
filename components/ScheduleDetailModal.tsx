import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import { ScheduleItem } from "../hooks/useSchedules";

interface Props {
  visible: boolean;
  item: ScheduleItem | null;
  typeStyle: Record<string, { color: string; emoji: string; pillBg: string }>;
  onClose: () => void;

  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
}

export default function ScheduleDetailModal({
  visible,
  item,
  typeStyle,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  if (!item) return null;

  const style = typeStyle[item.type] || {
    color: "#6B7280",
    pillBg: "#fff",
    emoji: "",
  };

  const pad = (n: number) => n.toString().padStart(2, "0");
  const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const handleEdit = () => {
    onClose();
    onEdit?.(item.id);
  };
  const handleDelete = () => {
    onClose();
    onDelete?.(item.id);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.cardWrapper}>
              <View
                style={[
                  styles.card,
                  {
                    borderLeftColor: style.color,
                    backgroundColor: style.pillBg,
                  },
                ]}
              >
                <View style={styles.header}>
                  <Text style={styles.subject}>
                    {style.emoji} {item.subject}
                  </Text>
                  <TouchableOpacity onPress={onClose}>
                    <Text style={styles.close}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.time}>
                  ⏰ {fmt(item.startAt)} – {fmt(item.endAt)}
                </Text>
                <Text style={styles.detail}>
                  👨‍🏫 {item.instructorName ?? "Chưa có giảng viên"}
                </Text>
                <Text style={styles.detail}>
                  📍 {item.location ?? "Chưa có phòng"}
                </Text>

                <View style={styles.actions}>
                  <TouchableOpacity onPress={handleEdit}>
                    <Text style={[styles.actionIcon, { transform: [{ rotate: "90deg" }] }]}>
                      ✏️
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDelete} style={{ marginLeft: 12 }}>
                    <Text style={styles.actionIcon}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  cardWrapper: {
    width: "85%",
  },
  card: {
    borderRadius: 8,
    borderLeftWidth: 4,
    padding: 12,
    backgroundColor: "#fff",
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  subject: {
    fontSize: 18,
    fontWeight: "600",
  },
  close: {
    fontSize: 18,
    color: "#999",
  },
  time: {
    fontSize: 14,
    marginBottom: 4,
  },
  detail: {
    fontSize: 14,
    marginBottom: 4,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  actionIcon: {
    fontSize: 18,
  },
});
