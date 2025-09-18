import { useState, useCallback, useRef, useEffect } from "react";
import {
	createReminder,
	getAllReminders,
	updateReminder,
	deleteReminder,
} from "../database/reminder";
import type { Reminder } from "../types/Reminder";

export function useReminders() {
	const [reminders, setReminders] = useState<Reminder[]>([]);
	const [loading, setLoading] = useState(false);
	const isMountedRef = useRef(true);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const loadReminders = useCallback(async () => {
		if (isMountedRef.current) setLoading(true);
		try {
			const data = await getAllReminders();
			if (!isMountedRef.current) return;
			setReminders(
				data.map((reminder: any) => ({
					...reminder,
					created_at: reminder.created_at
						? new Date(reminder.created_at).toISOString()
						: "",
				}))
			);
		} finally {
			if (isMountedRef.current) setLoading(false);
		}
	}, []);

	const addReminder = async (
		data: Omit<Reminder, "id" | "created_at">
	) => {
		await createReminder(data);
		if (isMountedRef.current) await loadReminders();
	};

	const editReminder = async (
		id: number,
		data: Partial<Omit<Reminder, "id" | "created_at">>
	) => {
		await updateReminder(id, data);
		if (isMountedRef.current) await loadReminders();
	};

	const removeReminder = async (id: number) => {
		await deleteReminder(id);
		if (isMountedRef.current) await loadReminders();
	};

	return {
		reminders,
		loadReminders,
		addReminder,
		editReminder,
		removeReminder,
		loading,
	};
}
