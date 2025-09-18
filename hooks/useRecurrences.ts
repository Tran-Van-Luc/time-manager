import { useState, useCallback } from "react";
import {
	createRecurrence,
	getAllRecurrences,
	updateRecurrence,
	deleteRecurrence,
} from "../database/recurrence";
import type { Recurrence } from "../types/Recurrence";

export function useRecurrences() {
	const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
	const [loading, setLoading] = useState(false);

	const loadRecurrences = useCallback(async () => {
		setLoading(true);
		try {
			const data = await getAllRecurrences();
			setRecurrences(
				data.map((rec: any) => ({
					...rec,
					created_at: rec.created_at
						? new Date(rec.created_at).toISOString()
						: "",
				}))
			);
		} finally {
			setLoading(false);
		}
	}, []);

	const addRecurrence = async (
		data: Omit<Recurrence, "id" | "created_at">
	) => {
		// createRecurrence nên trả về id vừa tạo, nếu chưa thì sửa ở database/recurrence
		const id = await createRecurrence(data);
		await loadRecurrences();
		return id;
	};

	const editRecurrence = async (
		id: number,
		data: Partial<Omit<Recurrence, "id" | "created_at">>
	) => {
		await updateRecurrence(id, data);
		await loadRecurrences();
	};

	const removeRecurrence = async (id: number) => {
		await deleteRecurrence(id);
		await loadRecurrences();
	};

	return {
		recurrences,
		loadRecurrences,
		addRecurrence,
		editRecurrence,
		removeRecurrence,
		loading,
	};
}
