import { useState, useCallback } from "react";
import {
  createUser,
  getAllUsers,
  updateUser,
  deleteUser,
} from "../database/user";
import type { User } from "../types/User";

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(
        data.map((user: any) => ({
          ...user,
          created_at: user.created_at
            ? new Date(user.created_at).toISOString()
            : "",
          updated_at: user.updated_at
            ? new Date(user.updated_at).toISOString()
            : "",
        }))
      );
    } catch (err) {
      console.error("Lỗi load users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const addUser = async (name: string, avatar_url?: string) => {
    try {
      await createUser(name, avatar_url);
      await loadUsers();
    } catch (err) {
      console.error("Lỗi add user:", err);
    }
  };

  const removeUser = async (id: number) => {
    try {
      await deleteUser(id);
      await loadUsers();
    } catch (err) {
      console.error("Lỗi remove user:", err);
    }
  };

  const editUser = async (
    id: number,
    data: { name?: string; avatar_url?: string }
  ) => {
    try {
      await updateUser(id, data);
      await loadUsers();
    } catch (err) {
      console.error("Lỗi edit user:", err);
    }
  };

  return { users, loadUsers, addUser, removeUser, editUser, loading };
}
