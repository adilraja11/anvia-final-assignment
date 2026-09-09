import { createHttpClientTransport } from "@anvia/client";
import { useChat } from "@anvia/react";
import { ChatProvider, ComposerPrimitive } from "@anvia/react-ui";
import { useEffect, useMemo, useRef } from "react";

export function NewChatComposer({
	endpoint,
	onSubmit,
}: {
	endpoint: string;
	onSubmit: (prompt: string) => void;
}) {
	const inputRef = useRef<HTMLDivElement>(null);
	const transport = useMemo(
		() => createHttpClientTransport({ endpoint, format: "jsonl" }),
		[endpoint],
	);
	const chat = useChat({ transport });

	useEffect(() => {
		requestAnimationFrame(() => {
			inputRef.current
				?.querySelector<HTMLElement>('[contenteditable="true"]')
				?.focus({ preventScroll: true });
		});
	}, []);

	return (
		<ChatProvider controller={chat}>
			<ComposerPrimitive.Root
				className="composer root-composer"
				submitMessage={({ input, clear }) => {
					clear();
					onSubmit(input);
				}}
			>
				<ComposerPrimitive.Input
					ref={inputRef}
					className="composer-input"
					minRows={1}
					maxRows={8}
					placeholder="Message Anvia"
				/>
				<ComposerPrimitive.Submit
					className="composer-button"
					aria-label="Start chat"
				>
					↑
				</ComposerPrimitive.Submit>
			</ComposerPrimitive.Root>
		</ChatProvider>
	);
}
