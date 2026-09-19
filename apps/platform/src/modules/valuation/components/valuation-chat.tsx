import type { ClientStreamEvent, UIMessage } from "@anvia/client";
import { useChat } from "@anvia/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type ChatErrorCode,
	chatErrorCodes,
	chatErrorMessage,
	valuationChatGateway,
} from "#/utils/api/valuation-chat";
import {
	type PendingChatQuestion,
	useValuationChat,
} from "../hooks/use-valuation-chat";

const suggestedQuestions = [
	"Kenapa harga rekomendasi berbeda dari rentang pasar?",
	"Apa arti tingkat keyakinan hasil ini?",
	"Keterbatasan apa yang perlu saya perhatikan?",
] as const;

function isChatErrorCode(value: unknown): value is ChatErrorCode {
	return (
		typeof value === "string" && chatErrorCodes.includes(value as ChatErrorCode)
	);
}

function textFromMessage(message: UIMessage) {
	return message.parts
		.filter(
			(
				part,
			): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
				part.type === "text",
		)
		.map((part) => part.text)
		.join("");
}

function errorCode(error: unknown): ChatErrorCode {
	return isChatErrorCode((error as { code?: unknown })?.code)
		? (error as { code: ChatErrorCode }).code
		: "CHAT_SERVICE_UNAVAILABLE";
}

export function ValuationChat({
	valuationId,
	enabled,
}: {
	valuationId: string;
	enabled: boolean;
}) {
	const chatState = useValuationChat(valuationId, enabled);
	const openButtonRef = useRef<HTMLButtonElement>(null);

	if (!enabled) return null;

	return (
		<section
			className="mt-10 border-t-2 border-base-content pt-8"
			aria-labelledby="valuation-chat-title"
		>
			<div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
				<div className="max-w-2xl">
					<h2
						className="font-display text-2xl leading-[0.95] tracking-[-0.04em] uppercase sm:text-3xl"
						id="valuation-chat-title"
					>
						Tanya tentang hasil ini
					</h2>
					<p className="mt-3 text-xs leading-6 text-base-content/75">
						AI menjelaskan hasil valuasi yang sudah dihitung sistem. Jawaban
						tidak mengubah rekomendasi harga dan tidak melakukan pencarian
						marketplace baru.
					</p>
				</div>
				<span className="w-fit border border-base-content px-2 py-1 text-[0.58rem] font-bold tracking-[0.08em]">
					API LOKAL · CHAT HASIL
				</span>
			</div>

			{!chatState.isOpen ? (
				<button
					ref={openButtonRef}
					className="btn btn-primary mt-6 min-h-12 rounded-none uppercase"
					type="button"
					onClick={() => chatState.open()}
				>
					Buka percakapan
				</button>
			) : (
				<>
					<div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-base-content py-3">
						<p
							className="text-[0.62rem] font-bold uppercase"
							aria-live="polite"
						>
							{chatState.phase === "creating"
								? "Menyiapkan percakapan…"
								: chatState.phase === "restoring"
									? "Memuat percakapan…"
									: chatState.phase === "error"
										? "Percakapan tidak tersedia"
										: "Percakapan siap"}
						</p>
						<button
							className="btn btn-ghost min-h-0 rounded-none px-0 text-[0.62rem] uppercase underline decoration-1 underline-offset-4"
							type="button"
							onClick={chatState.close}
						>
							Tutup
						</button>
					</div>

					{chatState.phase === "error" ? (
						<ChatInitializationError
							code={chatState.error ?? "CHAT_SERVICE_UNAVAILABLE"}
							onRetry={
								chatState.error === "RESOURCE_NOT_FOUND" ||
								chatState.error === "CHAT_RESULT_NOT_AVAILABLE"
									? undefined
									: chatState.retry
							}
						/>
					) : chatState.phase === "ready" &&
						chatState.session &&
						chatState.history ? (
						<ActiveValuationChat
							key={chatState.session.id}
							initialHistory={chatState.history.messages}
							pendingQuestion={chatState.pendingQuestion}
							consumeQuestion={chatState.consumeQuestion}
							clearSession={chatState.clearSession}
							onSuggestion={chatState.open}
							onCleared={() => {
								requestAnimationFrame(() => openButtonRef.current?.focus());
							}}
							valuationId={valuationId}
							sessionId={chatState.session.id}
						/>
					) : (
						<div
							className="mt-5 border border-base-content bg-base-200 p-4 text-xs leading-6"
							aria-live="polite"
						>
							{chatState.phase === "creating"
								? "Sesi percakapan sedang disiapkan."
								: "Riwayat percakapan sedang dimuat."}
						</div>
					)}
				</>
			)}
		</section>
	);
}

function ChatInitializationError({
	code,
	onRetry,
}: {
	code: ChatErrorCode;
	onRetry?: () => void;
}) {
	return (
		<div
			className="mt-5 border border-base-content bg-base-200 p-4"
			role="alert"
		>
			<strong className="block text-xs uppercase">
				{code === "RESOURCE_NOT_FOUND" || code === "CHAT_RESULT_NOT_AVAILABLE"
					? "Chat tidak tersedia"
					: "Chat sedang bermasalah"}
			</strong>
			<p className="mt-2 text-xs leading-6">{chatErrorMessage(code)}</p>
			{onRetry ? (
				<button
					className="btn btn-outline mt-4 min-h-10 rounded-none text-[0.62rem] uppercase"
					type="button"
					onClick={onRetry}
				>
					Coba siapkan lagi
				</button>
			) : null}
		</div>
	);
}

function ActiveValuationChat({
	initialHistory,
	pendingQuestion,
	consumeQuestion,
	clearSession,
	onSuggestion,
	onCleared,
	valuationId,
	sessionId,
}: {
	initialHistory: UIMessage[];
	pendingQuestion: PendingChatQuestion | null;
	consumeQuestion: (id: number) => void;
	clearSession: (signal?: AbortSignal) => Promise<void>;
	onSuggestion: (question: string) => void;
	onCleared: () => void;
	valuationId: string;
	sessionId: string;
}) {
	const transport = useMemo(
		() => valuationChatGateway.createTransport(valuationId, sessionId),
		[valuationId, sessionId],
	);
	const [input, setInput] = useState("");
	const [chatError, setChatError] = useState<ChatErrorCode | null>(null);
	const [wasCancelled, setWasCancelled] = useState(false);
	const [isClearing, setIsClearing] = useState(false);
	const [clearError, setClearError] = useState<ChatErrorCode | null>(null);
	const [hasAutoSent, setHasAutoSent] = useState<number | null>(null);
	const logRef = useRef<HTMLDivElement>(null);
	const composerRef = useRef<HTMLTextAreaElement>(null);
	const shouldStickToEndRef = useRef(true);
	const pendingSubmissionRef = useRef(false);

	const handleEvent = useCallback((event: ClientStreamEvent) => {
		if (event.type === "run_start") {
			setChatError(null);
			if (pendingSubmissionRef.current) {
				setInput("");
				pendingSubmissionRef.current = false;
				requestAnimationFrame(() => composerRef.current?.focus());
			}
		}
		if (event.type === "error") {
			setChatError(
				isChatErrorCode(event.error.code)
					? event.error.code
					: "CHAT_SERVICE_UNAVAILABLE",
			);
		}
	}, []);

	const handleError = useCallback((error: Error) => {
		setChatError(errorCode(error));
	}, []);

	const { messages, status, sendMessage, stop, regenerate, reset } = useChat({
		transport,
		initialMessages: initialHistory,
		onEvent: handleEvent,
		onError: handleError,
	});

	const busy = status === "submitted" || status === "streaming";
	const chatUnavailable =
		chatError === "RESOURCE_NOT_FOUND" ||
		chatError === "CHAT_RESULT_NOT_AVAILABLE";

	const submitText = useCallback(
		(text: string) => {
			const trimmed = text.trim();
			if (!trimmed || busy || isClearing || chatUnavailable) return;
			setChatError(null);
			setClearError(null);
			setWasCancelled(false);
			pendingSubmissionRef.current = true;
			void sendMessage({ text: trimmed });
		},
		[busy, chatUnavailable, isClearing, sendMessage],
	);

	useEffect(() => {
		if (!pendingQuestion || busy || hasAutoSent === pendingQuestion.id) return;
		setHasAutoSent(pendingQuestion.id);
		consumeQuestion(pendingQuestion.id);
		submitText(pendingQuestion.text);
	}, [busy, consumeQuestion, hasAutoSent, pendingQuestion, submitText]);

	useEffect(() => {
		const newestText = messages.at(-1)
			? textFromMessage(messages.at(-1) as UIMessage)
			: "";
		const log = logRef.current;
		if (!log || !shouldStickToEndRef.current) return;
		void newestText;
		log.scrollTop = log.scrollHeight;
	}, [messages]);

	function handleLogScroll() {
		const log = logRef.current;
		if (!log) return;
		shouldStickToEndRef.current =
			log.scrollHeight - log.scrollTop - log.clientHeight < 96;
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		submitText(input);
	}

	function handleStop() {
		stop();
		pendingSubmissionRef.current = false;
		setWasCancelled(true);
	}

	function handleRetry() {
		if (
			!window.confirm(
				"Pertanyaan terakhir akan dikirim ulang dan mungkin tercatat dua kali. Lanjutkan?",
			)
		)
			return;
		setChatError(null);
		setWasCancelled(false);
		void regenerate();
	}

	async function handleClear() {
		if (messages.length === 0 || isClearing) return;
		if (
			!window.confirm(
				"Hapus seluruh percakapan tentang hasil ini? Tindakan ini tidak mengubah hasil valuasi.",
			)
		)
			return;
		setIsClearing(true);
		setClearError(null);
		try {
			await clearSession();
			reset();
			onCleared();
		} catch (error) {
			setClearError(errorCode(error));
		} finally {
			setIsClearing(false);
		}
	}

	const lastMessage = messages.at(-1);
	const canRetry =
		status === "error" && lastMessage?.role === "user" && !chatUnavailable;

	return (
		<div className="mt-5">
			<div
				ref={logRef}
				className="max-h-120 min-h-36 overflow-y-auto border-2 border-base-content bg-base-200 p-3 sm:p-5"
				role="log"
				aria-label="Riwayat percakapan tentang hasil valuasi"
				aria-live="polite"
				aria-relevant="additions"
				onScroll={handleLogScroll}
			>
				{messages.length === 0 ? (
					<div className="p-2 sm:p-4">
						<p className="text-xs leading-6">
							Tanyakan arti rekomendasi, rentang pasar, tingkat keyakinan, atau
							keterbatasan hasil ini.
						</p>
						<div className="mt-5 grid gap-2">
							{suggestedQuestions.map((question) => (
								<button
									className="btn btn-outline h-auto min-h-10 justify-start rounded-none px-3 py-2 text-left text-[0.62rem] normal-case leading-5"
									disabled={busy || chatUnavailable}
									key={question}
									type="button"
									onClick={() => onSuggestion(question)}
								>
									{question}
								</button>
							))}
						</div>
					</div>
				) : (
					messages.map((message) => {
						const text = textFromMessage(message);
						if (!text && message.role !== "assistant") return null;
						return (
							<div
								className={`mb-3 flex last:mb-0 ${message.role === "user" ? "justify-end" : "justify-start"}`}
								key={message.id}
							>
								<div
									className={`max-w-[92%] border border-base-content p-3 text-xs leading-6 sm:max-w-[78%] ${message.role === "user" ? "bg-neutral text-neutral-content" : "bg-base-100"}`}
								>
									<span className="block text-[0.56rem] font-bold uppercase tracking-[0.08em] opacity-65">
										{message.role === "user" ? "Kamu" : "AsliSegini? AI"}
									</span>
									<span className="mt-1 block whitespace-pre-wrap wrap-break-word">
										{text || "Menyiapkan jawaban…"}
									</span>
								</div>
							</div>
						);
					})
				)}
			</div>

			<div
				className="mt-3 min-h-6 text-xs"
				id="valuation-chat-feedback"
				aria-live="polite"
			>
				{status === "submitted" ? "Menyiapkan jawaban…" : null}
				{status === "streaming" ? "Menulis jawaban…" : null}
				{wasCancelled && status === "ready"
					? "Jawaban dihentikan. Teks yang sudah diterima tetap terlihat."
					: null}
				{chatError ? (
					<div
						className="mt-2 border border-base-content bg-base-200 p-3"
						role="alert"
					>
						<p className="leading-6">{chatErrorMessage(chatError)}</p>
						{canRetry ? (
							<button
								className="btn btn-outline mt-3 min-h-9 rounded-none text-[0.6rem] uppercase"
								type="button"
								onClick={handleRetry}
							>
								Coba lagi
							</button>
						) : null}
					</div>
				) : null}
				{clearError ? (
					<div
						className="mt-2 border border-base-content bg-base-200 p-3"
						role="alert"
					>
						{chatErrorMessage(clearError)}
					</div>
				) : null}
			</div>

			<form className="mt-4" onSubmit={handleSubmit}>
				<label
					className="text-xs font-bold uppercase"
					htmlFor="valuation-chat-input"
				>
					Pertanyaan tentang hasil valuasi
				</label>
				<div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
					<textarea
						ref={composerRef}
						id="valuation-chat-input"
						aria-describedby="valuation-chat-feedback"
						className="textarea min-h-24 w-full resize-y rounded-none border-base-content bg-base-100 text-base leading-6"
						disabled={busy || chatUnavailable || isClearing}
						maxLength={2_000}
						placeholder="Contoh: Kenapa rekomendasinya berada di angka ini?"
						value={input}
						onChange={(event) => setInput(event.target.value)}
					/>
					{busy ? (
						<button
							className="btn btn-outline min-h-12 rounded-none uppercase"
							type="button"
							onClick={handleStop}
						>
							Hentikan jawaban
						</button>
					) : (
						<button
							className="btn btn-primary min-h-12 rounded-none uppercase"
							disabled={!input.trim() || chatUnavailable || isClearing}
							type="submit"
						>
							Kirim pertanyaan
						</button>
					)}
				</div>
				<p className="mt-2 text-[0.6rem] leading-5 text-base-content/70">
					Jawaban hanya menjelaskan hasil yang tersimpan. Chat ini tidak
					menghitung ulang harga dan tidak memverifikasi kondisi barang.
				</p>
			</form>

			<div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-base-content pt-4">
				<p className="text-[0.6rem] leading-5 text-base-content/70">
					Percakapan tersimpan bersama hasil ini selama masa simpan lokal.
				</p>
				<button
					className="btn btn-ghost min-h-0 rounded-none px-0 text-[0.62rem] uppercase underline decoration-1 underline-offset-4 disabled:no-underline disabled:opacity-45"
					disabled={messages.length === 0 || isClearing}
					type="button"
					onClick={() => void handleClear()}
				>
					{isClearing ? "Menghapus…" : "Hapus percakapan"}
				</button>
			</div>
		</div>
	);
}
