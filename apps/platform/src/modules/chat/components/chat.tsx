import { initialMessagesFromMemory, useChat } from "@anvia/react";
import { ChatProvider, Composer, Message, Thread } from "@anvia/react-ui";
import { useEffect, useRef } from "react";
import type { MemoryMessages } from "../types";
import { ToolCall } from "./tools/tool-call";

export function Chat({
	endpoint,
	messages,
	initialPrompt,
	onComplete,
}: {
	endpoint: string;
	messages: MemoryMessages;
	initialPrompt?: string;
	onComplete: () => Promise<void>;
}) {
	const inputRef = useRef<HTMLDivElement>(null);
	const initialPromptSent = useRef(false);
	const wasStreaming = useRef(false);
	const chat = useChat({
		endpoint,
		initialMessages: initialMessagesFromMemory(messages),
	});

	useEffect(() => {
		if (chat.status === "streaming") {
			wasStreaming.current = true;
		} else if (chat.status === "idle" && wasStreaming.current) {
			wasStreaming.current = false;
			requestAnimationFrame(() => {
				inputRef.current
					?.querySelector<HTMLElement>("[data-anvia-composer-editor]")
					?.focus({ preventScroll: true });
			});
		}
	}, [chat.status]);

	useEffect(() => {
		if (initialPrompt && !initialPromptSent.current) {
			initialPromptSent.current = true;
			void chat.sendMessage(initialPrompt).then(onComplete);
		}
	}, [chat, initialPrompt, onComplete]);

	return (
		<ChatProvider controller={chat}>
			<Thread.Root className="thread">
				<Thread.Viewport className="thread-viewport" autoScroll>
					<Thread.Empty className="empty-state">
						<div className="empty-logo">A</div>
						<h1>How can I help you today?</h1>
						<p>
							Ask a question, research the web, or continue an earlier
							conversation.
						</p>
					</Thread.Empty>

					<Thread.Messages className="message-list">
						{() => (
							<Message.Root className="message-row">
								<Message.Content className="message-content">
									<Message.Parts>
										{(part) => (
											<Message.Part>
												{part.type === "text" ? <Message.Markdown /> : null}
												{part.type === "tool" ? <ToolCall part={part} /> : null}
											</Message.Part>
										)}
									</Message.Parts>
								</Message.Content>
							</Message.Root>
						)}
					</Thread.Messages>

					<Thread.Loading className="working-indicator">
						<span className="working-spinner" aria-hidden="true" />
						Working
					</Thread.Loading>
					<Thread.Error className="thread-error" />
				</Thread.Viewport>
			</Thread.Root>

			<div className="composer-area">
				<Composer.Root
					className="composer"
					submitMessage={async ({ input, chat: controller, clear }) => {
						clear();
						await controller.sendMessage(input);
						await onComplete();
					}}
				>
					<Composer.Input
						ref={inputRef}
						className="composer-input"
						minRows={1}
						maxRows={8}
						placeholder="Message Anvia"
					/>
					{chat.status === "streaming" ? (
						<Composer.Stop
							className="composer-button"
							aria-label="Stop response"
						>
							■
						</Composer.Stop>
					) : (
						<Composer.Submit
							className="composer-button"
							aria-label="Send message"
						>
							↑
						</Composer.Submit>
					)}
				</Composer.Root>
				<p className="composer-note">
					Anvia can make mistakes. Check important information.
				</p>
			</div>
		</ChatProvider>
	);
}
