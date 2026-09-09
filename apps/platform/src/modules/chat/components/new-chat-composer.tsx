import { useChat } from "@anvia/react";
import { ChatProvider, Composer } from "@anvia/react-ui";
import { useEffect, useRef } from "react";

export function NewChatComposer({
	endpoint,
	onSubmit,
}: {
	endpoint: string;
	onSubmit: (prompt: string) => void;
}) {
	const inputRef = useRef<HTMLDivElement>(null);
	const chat = useChat({ endpoint });

	useEffect(() => {
		requestAnimationFrame(() => {
			inputRef.current
				?.querySelector<HTMLElement>("[data-anvia-composer-editor]")
				?.focus({ preventScroll: true });
		});
	}, []);

	return (
		<ChatProvider controller={chat}>
			<Composer.Root
				className="composer root-composer"
				submitMessage={({ input, clear }) => {
					clear();
					onSubmit(input);
				}}
			>
				<Composer.Input
					ref={inputRef}
					className="composer-input"
					minRows={1}
					maxRows={8}
					placeholder="Message Anvia"
				/>
				<Composer.Submit className="composer-button" aria-label="Start chat">
					↑
				</Composer.Submit>
			</Composer.Root>
		</ChatProvider>
	);
}
