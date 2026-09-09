import { useState } from "react";
import type { ChatSession } from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export function useChatSessions(initialSessions: ChatSession[]) {
	const [sessions, setSessions] = useState(initialSessions);

	async function refreshSessions() {
		const response = await fetch(`${API_URL}/api/chat/sessions`);
		setSessions(await response.json());
	}

	return {
		sessions,
		refreshSessions,
	};
}
