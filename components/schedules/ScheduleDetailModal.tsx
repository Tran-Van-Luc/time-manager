// components/schedules/ScheduleDetailModal.tsx
import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import { ScheduleItem } from "../../hooks/useSchedules";
import { useLanguage } from "../../context/LanguageContext";

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
  const { language, t } = useLanguage();

  const L = {
    vi: {
      noInstructor: "Chưa có giảng viên",
      noLocation: "Chưa có phòng",
      edit: "Chỉnh sửa",
      delete: "Xóa",
      close: "Đóng",
      timePrefix: "⏰",
      instructorPrefix: "👨‍🏫",
      locationPrefix: "📍",
    },
    en: {
      noInstructor: "No instructor",
      noLocation: "No location",
      edit: "Edit",
      delete: "Delete",
      close: "Close",
      timePrefix: "⏰",
      instructorPrefix: "👨‍🏫",
      locationPrefix: "📍",
    },
  }[language];

  if (!item) return null;

  // Normalize raw type values to the translated label keys used in typeStyle
  function normalizeTypeToLabel(rawType: string | undefined): string {
    if (!rawType) return rawType ?? "";

    const trimmed = String(rawType).trim();

    // Prefer using translation keys from t.schedule.types if available
    const keyToLabel: Record<string, string> = {
      theory: t?.schedule?.types?.theory ?? "Lịch học lý thuyết",
      practice: t?.schedule?.types?.practice ?? "Lịch học thực hành",
      exam: t?.schedule?.types?.exam ?? "Lịch thi",
      suspended: t?.schedule?.types?.suspended ?? "Lịch tạm ngưng",
      makeup: t?.schedule?.types?.makeup ?? "Lịch học bù",
    };

    const lower = trimmed.toLowerCase();

    // direct canonical key match
    if (keyToLabel[lower]) return keyToLabel[lower];

    // common Vietnamese stored labels
    const vnMap: Record<string, string> = {
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
    if (vnMap[lower]) return vnMap[lower];

    // common English stored labels
    const enMap: Record<string, string> = {
      "theory class": keyToLabel.theory,
      "theory": keyToLabel.theory,
      "practice class": keyToLabel.practice,
      "practice": keyToLabel.practice,
      "exam": keyToLabel.exam,
      "suspended": keyToLabel.suspended,
      "makeup class": keyToLabel.makeup,
      "makeup": keyToLabel.makeup,
    };
    if (enMap[lower]) return enMap[lower];

    // heuristics
    if (lower.includes("lý thuyết") || lower.includes("theory")) return keyToLabel.theory;
    if (lower.includes("thực hành") || lower.includes("practice")) return keyToLabel.practice;
    if (lower.includes("thi") || lower.includes("exam")) return keyToLabel.exam;
    if (lower.includes("tạm ngưng") || lower.includes("suspend")) return keyToLabel.suspended;
    if (lower.includes("bù") || lower.includes("makeup")) return keyToLabel.makeup;

    // fallback: return trimmed original (may still match a typeStyle key)
    return trimmed;
  }

  // Use normalized label to look up style
  const typeLabel = (item as any).typeLabel ?? normalizeTypeToLabel(item.type);
  const style = typeStyle[typeLabel] || {
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
                  {L.timePrefix} {fmt(item.startAt)} – {fmt(item.endAt)}
                </Text>
                <Text style={styles.detail}>
                  {L.instructorPrefix} {item.instructorName ?? (t?.schedule?.noInstructor ?? L.noInstructor)}
                </Text>
                <Text style={styles.detail}>
                  {L.locationPrefix} {item.location ?? (t?.schedule?.noLocation ?? L.noLocation)}
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
