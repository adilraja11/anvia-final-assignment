import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	Chat,
	type ChatSession,
	ChatSidebar,
	type MemoryMessages,
	useChatSessions,
} from "#/modules/chat";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const Route = createFileRoute("/s/$sessionId")({
	component: SessionPage,
	loader: async ({ params }) => {
		const [sessionsResponse, messagesResponse] = await Promise.all([
			fetch(`${API_URL}/api/chat/sessions`),
			fetch(`${API_URL}/api/chat/${params.sessionId}`),
		]);

		return {
			sessions: (await sessionsResponse.json()) as ChatSession[],
			messages: (await messagesResponse.json()) as MemoryMessages,
		};
	},
});

function SessionPage() {
	const { sessionId } = Route.useParams();
	const data = Route.useLoaderData();

	return <Session key={sessionId} sessionId={sessionId} data={data} />;
}

function Session({
	sessionId,
	data,
}: {
	sessionId: string;
	data: { sessions: ChatSession[]; messages: MemoryMessages };
}) {
	const navigate = useNavigate();
	const [initialPrompt] = useState(() => {
		const key = `anvia:pending-prompt:${sessionId}`;
		const prompt = sessionStorage.getItem(key) ?? undefined;
		sessionStorage.removeItem(key);
		return prompt;
	});
	const chat = useChatSessions(data.sessions);
	const title = chat.sessions.find(
		(session) => session.id === sessionId,
	)?.title;

	return (
		<div className="app-shell">
			<ChatSidebar
				sessions={chat.sessions}
				sessionId={sessionId}
				onNewChat={() => void navigate({ to: "/" })}
				onSelect={(id) =>
					void navigate({ to: "/s/$sessionId", params: { sessionId: id } })
				}
			/>

			<main className="chat-main">
				<header className="chat-header">
					<strong>{title ?? "New chat"}</strong>
					<span>Personal assistant</span>
				</header>

				<Chat
					endpoint={`${API_URL}/api/chat/${sessionId}`}
					messages={data.messages}
					initialPrompt={initialPrompt}
					onComplete={chat.refreshSessions}
				/>
			</main>
		</div>
	);
}
