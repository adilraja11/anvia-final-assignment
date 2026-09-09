import { createHttpClientTransport, messagesToUIMessages } from "@anvia/client";
import { useChat } from "@anvia/react";
import {
	ChatProvider,
	ComposerPrimitive,
	MessagePrimitive,
	ThreadPrimitive,
} from "@anvia/react-ui";
import { useEffect, useMemo, useRef } from "react";
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
	const transport = useMemo(
		() => createHttpClientTransport({ endpoint, format: "jsonl" }),
		[endpoint],
	);
	const initialMessages = useMemo(
		() => messagesToUIMessages(messages),
		[messages],
	);
	const chat = useChat({
		transport,
		initialMessages,
	});

	useEffect(() => {
		if (chat.status === "streaming") {
			wasStreaming.current = true;
		} else if (chat.status === "ready" && wasStreaming.current) {
			wasStreaming.current = false;
			requestAnimationFrame(() => {
				inputRef.current
					?.querySelector<HTMLElement>('[contenteditable="true"]')
					?.focus({ preventScroll: true });
			});
		}
	}, [chat.status]);

	useEffect(() => {
		if (initialPrompt && !initialPromptSent.current) {
			initialPromptSent.current = true;
			void chat.sendMessage({ text: initialPrompt }).then(onComplete);
		}
	}, [chat, initialPrompt, onComplete]);

	return (
		<ChatProvider controller={chat}>
			<ThreadPrimitive.Root className="thread">
				<ThreadPrimitive.Viewport className="thread-viewport" autoScroll>
					<ThreadPrimitive.Empty className="empty-state">
						<div className="empty-logo">A</div>
						<h1>How can I help you today?</h1>
						<p>
							Ask a question, research the web, or continue an earlier
							conversation.
						</p>
					</ThreadPrimitive.Empty>

					<ThreadPrimitive.Messages className="message-list">
						{() => (
							<MessagePrimitive.Root className="message-row">
								<MessagePrimitive.Content className="message-content">
									<MessagePrimitive.Parts>
										{(part) => (
											<MessagePrimitive.Part>
												{part.type === "text" ? (
													<MessagePrimitive.Markdown />
												) : null}
												{part.type === "tool" ? <ToolCall part={part} /> : null}
											</MessagePrimitive.Part>
										)}
									</MessagePrimitive.Parts>
								</MessagePrimitive.Content>
							</MessagePrimitive.Root>
						)}
					</ThreadPrimitive.Messages>

					<ThreadPrimitive.Loading className="working-indicator">
						<span className="working-spinner" aria-hidden="true" />
						Working
					</ThreadPrimitive.Loading>
					<ThreadPrimitive.Error className="thread-error" />
				</ThreadPrimitive.Viewport>
			</ThreadPrimitive.Root>

			<div className="composer-area">
				<ComposerPrimitive.Root
					className="composer"
					submitMessage={async ({ input, chat: controller, clear }) => {
						clear();
						await controller.sendMessage({ text: input });
						await onComplete();
					}}
				>
					<ComposerPrimitive.Input
						ref={inputRef}
						className="composer-input"
						minRows={1}
						maxRows={8}
						placeholder="Message Anvia"
					/>
					{chat.status === "streaming" ? (
						<ComposerPrimitive.Stop
							className="composer-button"
							aria-label="Stop response"
						>
							■
						</ComposerPrimitive.Stop>
					) : (
						<ComposerPrimitive.Submit
							className="composer-button"
							aria-label="Send message"
						>
							↑
						</ComposerPrimitive.Submit>
					)}
				</ComposerPrimitive.Root>
				<p className="composer-note">
					Anvia can make mistakes. Check important information.
				</p>
			</div>
		</ChatProvider>
	);
}
