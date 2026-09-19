import { useCallback, useEffect, useRef, useState } from "react";
import {
	type ChatErrorCode,
	chatErrorCodes,
	type ValuationChatHistory,
	type ValuationChatSession,
	valuationChatGateway,
} from "#/utils/api/valuation-chat";

export type PendingChatQuestion = {
	id: number;
	text: string;
};

type ChatPhase = "closed" | "creating" | "restoring" | "ready" | "error";

function isChatErrorCode(value: unknown): value is ChatErrorCode {
	return (
		typeof value === "string" && chatErrorCodes.includes(value as ChatErrorCode)
	);
}

function errorCode(error: unknown): ChatErrorCode {
	return isChatErrorCode((error as { code?: unknown })?.code)
		? (error as { code: ChatErrorCode }).code
		: "CHAT_SERVICE_UNAVAILABLE";
}

export function useValuationChat(valuationId: string, enabled: boolean) {
	const [isOpen, setIsOpen] = useState(false);
	const [phase, setPhase] = useState<ChatPhase>("closed");
	const [session, setSession] = useState<ValuationChatSession | null>(null);
	const [history, setHistory] = useState<ValuationChatHistory | null>(null);
	const [error, setError] = useState<ChatErrorCode | null>(null);
	const [pendingQuestion, setPendingQuestion] =
		useState<PendingChatQuestion | null>(null);
	const requestIdRef = useRef(0);
	const initializationRef = useRef<Promise<void> | null>(null);
	const controllerRef = useRef<AbortController | null>(null);
	const questionIdRef = useRef(0);

	const initialize = useCallback(async () => {
		if (!enabled || initializationRef.current) return initializationRef.current;
		const requestId = ++requestIdRef.current;
		const controller = new AbortController();
		controllerRef.current?.abort();
		controllerRef.current = controller;
		setError(null);
		setPhase("creating");

		const request = (async () => {
			try {
				const nextSession = await valuationChatGateway.createOrRecoverSession(
					valuationId,
					controller.signal,
				);
				if (requestId !== requestIdRef.current) return;
				setPhase("restoring");
				const nextHistory = await valuationChatGateway.readSession(
					valuationId,
					nextSession.id,
					controller.signal,
				);
				if (requestId !== requestIdRef.current) return;
				setSession(nextSession);
				setHistory(nextHistory);
				setPhase("ready");
			} catch (caught) {
				if (controller.signal.aborted || requestId !== requestIdRef.current)
					return;
				setError(errorCode(caught));
				setPhase("error");
			} finally {
				if (requestId === requestIdRef.current)
					initializationRef.current = null;
			}
		})();
		initializationRef.current = request;
		return request;
	}, [enabled, valuationId]);

	useEffect(() => {
		if (!valuationId) return;
		requestIdRef.current += 1;
		controllerRef.current?.abort();
		controllerRef.current = null;
		initializationRef.current = null;
		setIsOpen(false);
		setPhase("closed");
		setSession(null);
		setHistory(null);
		setError(null);
		setPendingQuestion(null);
	}, [valuationId]);

	useEffect(() => {
		if (enabled) return;
		requestIdRef.current += 1;
		controllerRef.current?.abort();
		controllerRef.current = null;
		initializationRef.current = null;
		setIsOpen(false);
		setPhase("closed");
		setSession(null);
		setHistory(null);
		setError(null);
		setPendingQuestion(null);
	}, [enabled]);

	useEffect(
		() => () => {
			requestIdRef.current += 1;
			controllerRef.current?.abort();
		},
		[],
	);

	const open = useCallback(
		(question?: string) => {
			if (!enabled) return;
			setIsOpen(true);
			if (question) {
				setPendingQuestion({ id: ++questionIdRef.current, text: question });
			}
			if (phase === "closed" || phase === "error") void initialize();
		},
		[enabled, initialize, phase],
	);

	const close = useCallback(() => {
		setIsOpen(false);
	}, []);

	const setRequestStateAfterClear = useCallback(() => {
		requestIdRef.current += 1;
		controllerRef.current?.abort();
		controllerRef.current = null;
		initializationRef.current = null;
		setIsOpen(false);
		setPhase("closed");
		setSession(null);
		setHistory(null);
		setError(null);
		setPendingQuestion(null);
	}, []);

	const retry = useCallback(() => {
		if (phase === "error") void initialize();
	}, [initialize, phase]);

	const consumeQuestion = useCallback((id: number) => {
		setPendingQuestion((current) => (current?.id === id ? null : current));
	}, []);

	const clearSession = useCallback(
		async (signal?: AbortSignal) => {
			if (!session) return;
			await valuationChatGateway.deleteSession(valuationId, session.id, signal);
			setRequestStateAfterClear();
		},
		[session, setRequestStateAfterClear, valuationId],
	);

	return {
		isOpen,
		phase,
		session,
		history,
		error,
		pendingQuestion,
		open,
		close,
		retry,
		consumeQuestion,
		clearSession,
	};
}
