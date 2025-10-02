import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";

// Import db từ file database.ts
import { db } from "../database/database";

export default function NameScheduleScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleBack = () => {
    router.back();
  };

  const escapeForSql = (str: string) => str.replace(/'/g, "''");

  const createUserAndSave = async (displayName: string) => {
    try {
      const safeName = escapeForSql(displayName);
      db.$client.execSync(
        `INSERT INTO users (name, created_at, updated_at) VALUES ('${safeName}', datetime('now'), datetime('now'));`
      );

      const rows = db.$client.execSync(`SELECT last_insert_rowid() as id;`);
      let insertedId = null;
      if (Array.isArray(rows) && rows.length > 0 && rows[0].id !== undefined) {
        insertedId = rows[0].id;
      } else if (Array.isArray(rows) && rows.length > 0) {
        const first = rows[0];
        insertedId = first.id ?? Object.values(first)[0];
      }
      return insertedId;
    } catch (e) {
      console.error("DB insert error:", e);
      throw e;
    }
  };

  const handleContinue = async () => {
    if (!name.trim()) {
      setError("Vui lòng nhập tên lịch.");
      return;
    }
    try {
      setSaving(true);
      const userId = await createUserAndSave(name.trim());
      if (userId) {
        await AsyncStorage.setItem("userId", String(userId));
      }
      await AsyncStorage.setItem("scheduleName", name.trim());
      await AsyncStorage.setItem("hasOnboarded", "true");
      router.push("/prepare");
    } catch (e) {
      Alert.alert("Lỗi", "Không thể lưu tên lịch. Vui lòng thử lại.");
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      {/* Header với nút Back */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <LinearGradient
          colors={["#2563EB", "#4F46E5"]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Nội dung */}
      <View style={styles.content}>
        <MaskedView
          maskElement={<Text style={styles.title}>Đặt tên cho lịch của bạn</Text>}
        >
          <LinearGradient
            colors={["#2563EB", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={[styles.title, { opacity: 0 }]}>
              Đặt tên cho lịch của bạn
            </Text>
          </LinearGradient>
        </MaskedView>

        <Text style={styles.hint}></Text>

        <TextInput
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (error) setError("");
          }}
          placeholder="Nhập tên lịch..."
          style={styles.input}
          returnKeyType="done"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          onPress={handleContinue}
          disabled={saving}
          style={{ width: "100%", marginTop: 16 }}
        >
          <LinearGradient
            colors={["#2563EB", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.button, saving && styles.buttonDisabled]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Tiếp tục</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    height: 100,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "transparent",
  },
  backButton: {
    zIndex: 1,
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 50,
    alignSelf: "flex-start",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: { fontSize: 24, fontWeight: "bold", textAlign: "center" },
  hint: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 8,
    backgroundColor: "#fafafa",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  error: { color: "red", marginBottom: 8 },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});

