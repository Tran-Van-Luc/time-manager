import "expo-router/entry";
import "./global.css";
import { initDatabase } from "./database/database";
import { useEffect } from "react";
export default function AppWrapper() {
  useEffect(() => {
    initDatabase();
  }, []);

  return null; 
}