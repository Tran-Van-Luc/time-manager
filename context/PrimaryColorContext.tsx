// context/PrimaryColorContext.tsx
import React, { createContext, useState, useContext, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_PRIMARY = "primaryColor";
const DEFAULT_PRIMARY_COLOR = "#2563EB"; // Simple Blue

// Định nghĩa các giá trị mà Context sẽ cung cấp
type PrimaryColorContextType = {
  primaryColor: string;
  setPrimaryColor: (color: string) => Promise<void>;
  isLoading: boolean;
};

// Tạo Context với một giá trị mặc định
const PrimaryColorContext = createContext<PrimaryColorContextType>({
  primaryColor: DEFAULT_PRIMARY_COLOR,
  setPrimaryColor: async () => {},
  isLoading: true,
});

// Tạo Provider component
export const PrimaryColorProvider = ({ children }: { children: React.ReactNode }) => {
  const [primaryColor, setColor] = useState<string>(DEFAULT_PRIMARY_COLOR);
  const [isLoading, setIsLoading] = useState(true);

  // useEffect để load primaryColor đã lưu khi khởi động app
  useEffect(() => {
    const loadPrimaryColor = async () => {
      try {
        const savedColor = await AsyncStorage.getItem(STORAGE_KEY_PRIMARY);
        if (savedColor) {
          setColor(savedColor);
        }
      } catch (error) {
        console.error("Error loading primary color:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPrimaryColor();
  }, []);

  // Hàm để thay đổi primary color
  const setPrimaryColor = async (color: string) => {
    try {
      setColor(color);
      // Lưu lại màu vào AsyncStorage
      await AsyncStorage.setItem(STORAGE_KEY_PRIMARY, color);
    } catch (error) {
      console.error("Error saving primary color:", error);
    }
  };

  return (
    <PrimaryColorContext.Provider value={{ primaryColor, setPrimaryColor, isLoading }}>
      {children}
    </PrimaryColorContext.Provider>
  );
};

// Tạo một custom hook để sử dụng PrimaryColorContext dễ dàng hơn
export const usePrimaryColor = () => useContext(PrimaryColorContext);