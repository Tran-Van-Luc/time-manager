import React, { createContext, useState, useContext, useEffect } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Định nghĩa các giá trị mà Context sẽ cung cấp
type ThemeContextType = {
  theme: "light" | "dark";
  toggleTheme: () => void;
};

// Tạo Context với một giá trị mặc định
const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
});

// Tạo Provider component
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // Lấy theme mặc định của hệ thống
  const systemTheme = Appearance.getColorScheme() || "light";
  const [theme, setTheme] = useState<"light" | "dark">(systemTheme);

  // useEffect để load theme đã lưu khi khởi động app
  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = (await AsyncStorage.getItem("theme")) as "light" | "dark";
      if (savedTheme) {
        setTheme(savedTheme);
      }
    };
    loadTheme();
  }, []);

  // Hàm để chuyển đổi theme
  const toggleTheme = async () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    // Lưu lại lựa chọn theme vào AsyncStorage
    await AsyncStorage.setItem("theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Tạo một custom hook để sử dụng ThemeContext dễ dàng hơn
export const useTheme = () => useContext(ThemeContext);