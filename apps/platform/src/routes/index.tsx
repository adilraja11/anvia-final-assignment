import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ChatSession, ChatSidebar, NewChatComposer } from "#/modules/chat";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const Route = createFileRoute("/")({
	component: Home,
	loader: async () => {
		const response = await fetch(`${API_URL}/api/chat/sessions`);
		return response.json() as Promise<ChatSession[]>;
	},
});

function Home() {
	const navigate = useNavigate();
	const sessions = Route.useLoaderData();

	async function startChat(prompt: string) {
		const response = await fetch(`${API_URL}/api/chat/sessions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ prompt }),
		});
		const { id: sessionId } = (await response.json()) as { id: string };

		sessionStorage.setItem(`anvia:pending-prompt:${sessionId}`, prompt);
		await navigate({ to: "/s/$sessionId", params: { sessionId } });
	}

	return (
		<div className="app-shell">
			<ChatSidebar
				sessions={sessions}
				sessionId=""
				onNewChat={() => void navigate({ to: "/" })}
				onSelect={(sessionId) =>
					void navigate({ to: "/s/$sessionId", params: { sessionId } })
				}
			/>

			<main className="root-main">
				<div className="root-content">
					<div className="empty-logo">A</div>
					<h1>How can I help you today?</h1>
					<NewChatComposer
						endpoint={`${API_URL}/api/chat/new`}
						onSubmit={startChat}
					/>
					<p className="composer-note">
						Anvia can make mistakes. Check important information.
					</p>
				</div>
			</main>
		</div>
	);
}
