import React, { useEffect, useState } from "react";
import { View, Text, Button, FlatList, TextInput, Alert } from "react-native";
import { useUsers } from "../hooks/useUsers";

export default function UserDemoScreen() {
  const { users, loadUsers, addUser, removeUser, editUser, loading } = useUsers();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async () => {
    if (!newName.trim()) return Alert.alert("Vui lòng nhập tên!");
    if (users.some((u) => u.name.toLowerCase() === newName.trim().toLowerCase())) {
      Alert.alert("Lỗi", "Tên user đã tồn tại!");
      return;
    }
    try {
      await addUser(newName.trim());
      setNewName("");
      Alert.alert("Thành công", "Tạo user thành công!");
    } catch (error: any) {
      Alert.alert("Lỗi", `Không thể tạo user!\n${error?.message || error}`);
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await removeUser(id);
      Alert.alert("Thành công", "Xóa user thành công!");
    } catch (error: any) {
      Alert.alert("Lỗi", `Không thể xóa user!\n${error?.message || error}`);
    }
  };

  const startEditUser = (id: number, name: string) => {
    setEditId(id);
    setEditName(name);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName("");
  };

  const handleUpdateUser = async () => {
    if (!editName.trim()) return Alert.alert("Vui lòng nhập tên!");
    if (users.some((u) => u.name.toLowerCase() === editName.trim().toLowerCase() && u.id !== editId)) {
      Alert.alert("Lỗi", "Tên user đã tồn tại!");
      return;
    }
    if (editId !== null) {
      try {
        await editUser(editId, { name: editName.trim() });
        cancelEdit();
        Alert.alert("Thành công", "Cập nhật user thành công!");
      } catch (error: any) {
        Alert.alert("Lỗi", `Không thể cập nhật user!\n${error?.message || error}`);
      }
    }
  };

  return (
    <View className="flex-1 p-4 bg-white">
      <Text className="text-lg font-bold mb-4">Danh sách User</Text>
      {loading && <Text>Đang tải...</Text>}
      <FlatList
        data={users}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View className="border-b border-gray-200 p-2 mb-2 rounded bg-gray-50">
            <Text>ID: {item.id}</Text>
            <Text>Name: {item.name}</Text>
            <Text>Avatar URL: {item.avatar_url ?? "Chưa có"}</Text>
            <Text>Created At: {item.created_at ? new Date(item.created_at).toLocaleString() : ""}</Text>
            <Text>Updated At: {item.updated_at ? new Date(item.updated_at).toLocaleString() : ""}</Text>

            <View className="flex-row mt-2">
              {editId === item.id ? (
                <>
                  <TextInput
                    className="border border-gray-400 p-1 flex-1 mr-2 rounded"
                    value={editName}
                    onChangeText={setEditName}
                  />
                  <Button title="Lưu" onPress={handleUpdateUser} />
                  <Button title="Hủy" color="gray" onPress={cancelEdit} />
                </>
              ) : (
                <>
                  <Button title="Sửa" onPress={() => startEditUser(item.id, item.name)} />
                  <Button title="Xóa" color="red" onPress={() => handleDeleteUser(item.id)} />
                </>
              )}
            </View>
          </View>
        )}
      />

      <View className="mt-4">
        <TextInput
          className="border border-gray-400 p-2 mb-2 rounded"
          placeholder="Tên user mới"
          value={newName}
          onChangeText={setNewName}
        />
        <Button title="Tạo User" onPress={handleCreateUser} />
      </View>
    </View>
  );
}
