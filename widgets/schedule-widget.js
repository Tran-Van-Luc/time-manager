import { RemoteViews, TextView, LinearLayout } from "expo-widget";
import * as SQLite from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function renderWidget() {
  try {
    // 🔹 Lấy màu theme từ AsyncStorage
    const theme = (await AsyncStorage.getItem("widgetTheme")) || "blue";
    const themeColors = {
      blue: "#2563EB",
      green: "#22C55E",
      pink: "#EC4899",
    };

    // 🔹 Mở DB (đồng bộ)
    const db = SQLite.openDatabaseSync("time_manager.db");

    // 🔹 Lấy danh sách công việc hôm nay
    const result = db.getAllSync(
      "SELECT name FROM tasks WHERE date = date('now') LIMIT 3"
    );

    const events =
      result.length > 0
        ? result.map((e) => `• ${e.name}`).join("\n")
        : "Không có công việc hôm nay";

    // 🔹 Trả về layout widget
    return (
      <RemoteViews>
        <LinearLayout
          orientation="vertical"
          padding={12}
          backgroundColor="#FFFFFF"
        >
          <TextView
            text="📅 Công việc hôm nay"
            textSize={16}
            textColor={themeColors[theme]}
          />
          <TextView
            text={events}
            textSize={14}
            textColor="#111"
          />
        </LinearLayout>
      </RemoteViews>
    );
  } catch (err) {
    return (
      <RemoteViews>
        <LinearLayout padding={8} backgroundColor="#fff">
          <TextView
            text="Không thể tải dữ liệu"
            textSize={14}
            textColor="#888"
          />
        </LinearLayout>
      </RemoteViews>
    );
  }
}
