import type { ChatSession } from "../types";

export function ChatSidebar({
	sessions,
	sessionId,
	onNewChat,
	onSelect,
}: {
	sessions: ChatSession[];
	sessionId: string;
	onNewChat: () => void;
	onSelect: (sessionId: string) => void;
}) {
	return (
		<aside className="sidebar">
			<div className="sidebar-header">
				<div className="brand-mark">A</div>
				<span>Anvia</span>
			</div>

			<button className="new-chat" type="button" onClick={onNewChat}>
				<span aria-hidden="true">＋</span>
				New chat
			</button>

			<p className="history-label">Chats</p>
			<nav className="history-list" aria-label="Chat history">
				{sessions.map((session) => (
					<button
						className="history-item"
						data-active={session.id === sessionId}
						key={session.id}
						type="button"
						onClick={() => onSelect(session.id)}
					>
						{session.title}
					</button>
				))}
			</nav>

			<div className="sidebar-footer">AI Product Engineering</div>
		</aside>
	);
}
