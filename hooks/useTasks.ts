// hooks/useTasks.ts
import { useState, useCallback } from "react";
import {
  createTask,
  getAllTasks,
  updateTask,
  softDeleteTask,
  deleteTask,
} from "../database/task";
import type { Task } from "../types/Task";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllTasks();
      setTasks(
        data.map((task: any) => ({
          ...task,
          start_at: task.start_at ? new Date(task.start_at).toISOString() : "",
          end_at: task.end_at ? new Date(task.end_at).toISOString() : "",
          created_at: task.created_at
            ? new Date(task.created_at).toISOString()
            : "",
          updated_at: task.updated_at
            ? new Date(task.updated_at).toISOString()
            : "",
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const filterTasks = (search: string, priority: string, status: string) => {
    return tasks.filter((t) => {
      const matchSearch = search
        ? t.title.toLowerCase().includes(search.toLowerCase())
        : true;
      const matchPriority = priority ? t.priority === priority : true;
      const matchStatus = status ? t.status === status : true;
      return matchSearch && matchPriority && matchStatus;
    });
  };

  const addTask = async (
    data: Omit<Task, "id" | "created_at" | "updated_at">
  ) => {
    const id = await createTask({
      ...data,
      start_at: data.start_at ? new Date(data.start_at) : undefined,
      end_at: data.end_at ? new Date(data.end_at) : undefined,
    });
    await loadTasks();
    return id; 
  };

  const editTask = async (
    id: number,
    data: Partial<Omit<Task, "id" | "created_at" | "updated_at">>
  ) => {
    await updateTask(id, {
      ...data,
      start_at: data.start_at ? new Date(data.start_at) : undefined,
      end_at: data.end_at ? new Date(data.end_at) : undefined,
    });
    await loadTasks();
  };

  const softRemoveTask = async (id: number) => {
    await softDeleteTask(id);
    await loadTasks();
  };

  const removeTask = async (id: number) => {
    await deleteTask(id);
    await loadTasks();
  };

  return {
    tasks,
    loadTasks,
    addTask,
    editTask,
    softRemoveTask,
    removeTask,
    filterTasks,
    loading,
  };
}
