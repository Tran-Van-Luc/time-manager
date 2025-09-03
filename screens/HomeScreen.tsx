import { View, Text, TouchableOpacity } from "react-native";

export default function HomeScreen() {
  return (
    <View className="flex-1 bg-gradient-to-b from-purple-100 to-purple-50 items-center justify-center p-6">
      {/* Tiêu đề */}
      <Text className="text-4xl font-extrabold text-purple-800 mb-8">
        Chào mừng đến với Time Manager 🚀
      </Text>

      {/* Box thông tin chính */}
      <View className="w-full bg-white rounded-2xl shadow-xl p-6 mb-8">
        <Text className="text-gray-800 text-lg font-medium">
          Quản lý thời gian và công việc của bạn một cách dễ dàng và khoa học!
        </Text>
      </View>

      {/* Hàng nút nhanh */}
      <View className="flex-row space-x-6">
        <TouchableOpacity className="w-20 h-20 bg-purple-600 rounded-full items-center justify-center shadow-lg">
          <Text className="text-white font-bold text-lg">Công việc</Text>
        </TouchableOpacity>

        <TouchableOpacity className="w-20 h-20 bg-green-500 rounded-full items-center justify-center shadow-lg">
          <Text className="text-white font-bold text-lg">Lịch</Text>
        </TouchableOpacity>

        <TouchableOpacity className="w-20 h-20 bg-yellow-400 rounded-full items-center justify-center shadow-lg">
          <Text className="text-black font-bold text-lg">Thống kê</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
