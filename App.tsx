import "expo-router/entry";
import "./global.css";
import { initDatabase } from "./database/database";
import { useEffect } from "react";
import { initNotifications, rescheduleTaskNotifications } from './utils/notificationScheduler';
export default function AppWrapper() {
  useEffect(() => {
    initDatabase();
    (async () => {
      await initNotifications();
      // Lập lịch lại thông báo mỗi lần app khởi động
      await rescheduleTaskNotifications();
    })();
  }, []);

  return null; 
}