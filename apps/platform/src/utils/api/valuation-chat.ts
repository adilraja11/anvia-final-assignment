import {
	type ClientStreamRequest,
	type ClientTransport,
	createHttpClientTransport,
	parseUIMessages,
	type UIMessage,
} from "@anvia/client";
import { EventStreamHttpError } from "@anvia/client/transport";
import {
	cookieRequiredMessage,
	credentialedFetch,
	isAnonymousSessionRequiredStreamError,
	retryAnonymousSessionRequired,
} from "../api";

export const chatErrorCodes = [
	"ANONYMOUS_SESSION_REQUIRED",
	"INVALID_CHAT_REQUEST",
	"RESOURCE_NOT_FOUND",
	"CHAT_RESULT_NOT_AVAILABLE",
	"CHAT_TURN_IN_PROGRESS",
	"REQUEST_TOO_LARGE",
	"CHAT_RATE_LIMITED",
	"INTERNAL_SERVICE_FAILURE",
	"CHAT_SERVICE_UNAVAILABLE",
] as const;

export type ChatErrorCode = (typeof chatErrorCodes)[number];

export type ValuationChatSession = {
	id: string;
	valuationId: string;
	createdAt: string;
	expiresAt: string;
};

export type ValuationChatHistory = {
	session: ValuationChatSession;
	messages: UIMessage[];
};

export type ValuationChatGateway = {
	createOrRecoverSession(
		valuationId: string,
		signal?: AbortSignal,
	): Promise<ValuationChatSession>;
	readSession(
		valuationId: string,
		sessionId: string,
		signal?: AbortSignal,
	): Promise<ValuationChatHistory>;
	deleteSession(
		valuationId: string,
		sessionId: string,
		signal?: AbortSignal,
	): Promise<void>;
	createTransport(
		valuationId: string,
		sessionId: string,
	): ClientTransport<ClientStreamRequest>;
};

export class ValuationChatError extends Error {
	constructor(
		public readonly code: ChatErrorCode,
		message = chatErrorMessage(code),
	) {
		super(message);
		this.name = "ValuationChatError";
	}
}

const chatErrorCopy: Record<ChatErrorCode, string> = {
	ANONYMOUS_SESSION_REQUIRED: cookieRequiredMessage,
	INVALID_CHAT_REQUEST: "Permintaan percakapan tidak valid.",
	RESOURCE_NOT_FOUND:
		"Hasil tersimpan atau sesi percakapan ini sudah tidak tersedia.",
	CHAT_RESULT_NOT_AVAILABLE:
		"Percakapan tersedia setelah hasil valuasi selesai.",
	CHAT_TURN_IN_PROGRESS:
		"Jawaban sebelumnya masih diproses. Tunggu sebentar, lalu coba lagi.",
	REQUEST_TOO_LARGE:
		"Pertanyaan terlalu panjang. Ringkas pertanyaanmu lalu coba lagi.",
	CHAT_RATE_LIMITED:
		"Batas penggunaan percakapan tercapai. Hasil valuasi tetap bisa digunakan.",
	INTERNAL_SERVICE_FAILURE:
		"Percakapan mengalami masalah. Hasil valuasi tetap tersedia.",
	CHAT_SERVICE_UNAVAILABLE:
		"Percakapan sementara tidak tersedia. Coba lagi nanti.",
};

export function chatErrorMessage(code: ChatErrorCode) {
	return chatErrorCopy[code];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	return (
		actual.length === expected.length &&
		actual.every((key, index) => key === expected[index])
	);
}

function nonEmptyString(value: unknown, maximum = 2_000): value is string {
	return (
		typeof value === "string" &&
		value.trim().length > 0 &&
		value.length <= maximum
	);
}

function parseDate(value: unknown): value is string {
	return (
		typeof value === "string" &&
		!Number.isNaN(Date.parse(value)) &&
		value.includes("T")
	);
}

function malformedResponse(): never {
	throw new ValuationChatError(
		"CHAT_SERVICE_UNAVAILABLE",
		"Respons percakapan tidak dapat diverifikasi. Coba lagi.",
	);
}

function parseErrorCode(value: unknown): ChatErrorCode | undefined {
	return typeof value === "string" &&
		chatErrorCodes.includes(value as ChatErrorCode)
		? (value as ChatErrorCode)
		: undefined;
}

function parseSession(
	value: unknown,
	valuationId: string,
): ValuationChatSession {
	if (
		!isRecord(value) ||
		!hasExactKeys(value, ["id", "valuationId", "createdAt", "expiresAt"]) ||
		!nonEmptyString(value.id, 160) ||
		!nonEmptyString(value.valuationId, 160) ||
		value.valuationId !== valuationId ||
		!parseDate(value.createdAt) ||
		!parseDate(value.expiresAt)
	)
		return malformedResponse();
	const id = value.id;
	const sessionValuationId = value.valuationId;
	const createdAt = value.createdAt;
	const expiresAt = value.expiresAt;

	return {
		id,
		valuationId: sessionValuationId,
		createdAt,
		expiresAt,
	};
}

function parseHistoryMessage(value: unknown) {
	if (
		!isRecord(value) ||
		!hasExactKeys(value, ["id", "role", "parts"]) ||
		!nonEmptyString(value.id, 160) ||
		(value.role !== "user" && value.role !== "assistant") ||
		!Array.isArray(value.parts) ||
		value.parts.length !== 1
	)
		return malformedResponse();

	const part = value.parts[0];
	if (
		!isRecord(part) ||
		!hasExactKeys(part, ["id", "type", "text"]) ||
		!nonEmptyString(part.id, 160) ||
		part.type !== "text" ||
		!nonEmptyString(part.text, 20_000)
	)
		return malformedResponse();

	return {
		id: value.id,
		role: value.role,
		parts: [{ id: part.id, type: "text" as const, text: part.text }],
	};
}

function parseJsonBody(value: unknown) {
	if (!isRecord(value) || !hasExactKeys(value, ["error"])) return undefined;
	const error = value.error;
	if (
		!isRecord(error) ||
		!hasExactKeys(error, ["code", "message"]) ||
		!parseErrorCode(error.code) ||
		!nonEmptyString(error.message, 160)
	)
		return undefined;
	return error.code as ChatErrorCode;
}

async function parseResponseError(response: Response): Promise<never> {
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new ValuationChatError(
			"CHAT_SERVICE_UNAVAILABLE",
			"Respons percakapan tidak dapat diverifikasi. Coba lagi.",
		);
	}
	const code = parseJsonBody(body);
	if (!code)
		throw new ValuationChatError(
			"CHAT_SERVICE_UNAVAILABLE",
			"Respons percakapan tidak dapat diverifikasi. Coba lagi.",
		);
	throw new ValuationChatError(code);
}

async function requestJson<T>(
	input: string,
	init: RequestInit,
	decode: (value: unknown) => T,
	signal?: AbortSignal,
	retryAnonymousSession = false,
) {
	try {
		const request = () => credentialedFetch(input, { ...init, signal });
		const response = retryAnonymousSession
			? await retryAnonymousSessionRequired(request, signal)
			: await request();
		if (!response.ok) return parseResponseError(response);
		if (!response.headers.get("content-type")?.includes("application/json"))
			return malformedResponse();
		return decode(await response.json());
	} catch (error) {
		if (error instanceof ValuationChatError) throw error;
		if (
			signal?.aborted ||
			(error instanceof DOMException && error.name === "AbortError")
		)
			throw error;
		throw new ValuationChatError(
			"CHAT_SERVICE_UNAVAILABLE",
			"API lokal tidak dapat dihubungi. Coba lagi.",
		);
	}
}

function parseSessionResponse(
	value: unknown,
	valuationId: string,
): ValuationChatSession {
	if (!isRecord(value) || !hasExactKeys(value, ["session"]))
		return malformedResponse();
	return parseSession(value.session, valuationId);
}

function parseHistoryResponse(
	value: unknown,
	valuationId: string,
): ValuationChatHistory {
	if (
		!isRecord(value) ||
		!hasExactKeys(value, ["session", "messages"]) ||
		!Array.isArray(value.messages) ||
		value.messages.length > 60
	)
		return malformedResponse();

	const session = parseSession(value.session, valuationId);
	const messages = value.messages.map(parseHistoryMessage);
	try {
		return { session, messages: parseUIMessages(messages) };
	} catch {
		return malformedResponse();
	}
}

function chatPath(valuationId: string, sessionId?: string) {
	const base = `/api/valuations/${encodeURIComponent(valuationId)}/chat/sessions`;
	return sessionId ? `${base}/${encodeURIComponent(sessionId)}` : base;
}

async function readStreamError(error: EventStreamHttpError) {
	let body: unknown;
	try {
		body = JSON.parse(error.body);
	} catch {
		return new ValuationChatError("CHAT_SERVICE_UNAVAILABLE");
	}
	const code = parseJsonBody(body);
	return new ValuationChatError(code ?? "CHAT_SERVICE_UNAVAILABLE");
}

function transportError(error: unknown): Error | Promise<Error> {
	if (error instanceof ValuationChatError) return error;
	if (error instanceof EventStreamHttpError) return readStreamError(error);
	if (error instanceof DOMException && error.name === "AbortError")
		return error;
	return new ValuationChatError("CHAT_SERVICE_UNAVAILABLE");
}

export const valuationChatGateway: ValuationChatGateway = {
	createOrRecoverSession(valuationId, signal) {
		return requestJson(
			chatPath(valuationId),
			{
				method: "POST",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
				},
				body: "{}",
			},
			(value) => parseSessionResponse(value, valuationId),
			signal,
			true,
		);
	},

	readSession(valuationId, sessionId, signal) {
		return requestJson(
			chatPath(valuationId, sessionId),
			{ method: "GET", headers: { accept: "application/json" } },
			(value) => parseHistoryResponse(value, valuationId),
			signal,
		);
	},

	deleteSession(valuationId, sessionId, signal) {
		return (async () => {
			try {
				const response = await retryAnonymousSessionRequired(
					() =>
						credentialedFetch(chatPath(valuationId, sessionId), {
							method: "DELETE",
							headers: { accept: "application/json" },
							signal,
						}),
					signal,
				);
				if (!response.ok) return parseResponseError(response);
			} catch (error) {
				if (error instanceof ValuationChatError) throw error;
				if (
					signal?.aborted ||
					(error instanceof DOMException && error.name === "AbortError")
				)
					throw error;
				throw new ValuationChatError("CHAT_SERVICE_UNAVAILABLE");
			}
		})();
	},

	createTransport(valuationId, sessionId) {
		const transport = createHttpClientTransport<ClientStreamRequest>({
			endpoint: `${chatPath(valuationId, sessionId)}/messages`,
			method: "POST",
			format: "jsonl",
			headers: {
				accept: "application/jsonl",
				"content-type": "application/json",
			},
			fetch: credentialedFetch,
		});
		return {
			async *send(options) {
				let retriedAnonymousSession = false;
				while (true) {
					try {
						yield* transport.send(options);
						return;
					} catch (error) {
						if (
							!retriedAnonymousSession &&
							!options.abortSignal?.aborted &&
							error instanceof EventStreamHttpError &&
							isAnonymousSessionRequiredStreamError(
								error.response.status,
								error.body,
							)
						) {
							retriedAnonymousSession = true;
							continue;
						}
						throw await transportError(error);
					}
				}
			},
		};
	},
};
