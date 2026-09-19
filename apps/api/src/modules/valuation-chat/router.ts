import {
	agentToClientStream,
	type ClientStreamEvent,
	type ClientStreamRequest,
	parseClientStreamRequest,
} from "@anvia/client";
import type { Message } from "@anvia/core";
import { createClientStreamResponse } from "@anvia/server";
import { createValuationChatAgent, flushAgentTracing } from "@repo/agents";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
	type ChatErrorCode,
	chatErrorResponseSchema,
	chatRouteIdSchema,
	createChatSessionBodySchema,
} from "./schema.js";
import {
	acquireChatTurn,
	CHAT_MAX_MESSAGES,
	CHAT_MAX_USER_TEXT,
	CHAT_MODEL_TIMEOUT_MS,
	createOrRecoverChatSession,
	deleteChatSession,
	loadValuationGrounding,
	memory,
	readChatSession,
	releaseChatTurn,
	ValuationChatServiceError,
} from "./service.js";

const MAX_REQUEST_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1_000;
const RATE_LIMIT = 20;
const rateBuckets = new Map<string, number[]>();

const errorMessages = {
	INVALID_CHAT_REQUEST: "Permintaan percakapan tidak valid.",
	RESOURCE_NOT_FOUND: "Sumber daya tidak ditemukan.",
	CHAT_RESULT_NOT_AVAILABLE: "Percakapan tersedia setelah valuasi berhasil.",
	CHAT_TURN_IN_PROGRESS: "Jawaban sebelumnya masih diproses.",
	REQUEST_TOO_LARGE: "Permintaan terlalu besar.",
	CHAT_RATE_LIMITED: "Batas penggunaan percakapan tercapai.",
	INTERNAL_SERVICE_FAILURE: "Layanan sedang bermasalah.",
	CHAT_SERVICE_UNAVAILABLE: "Layanan percakapan sementara tidak tersedia.",
} as const satisfies Record<ChatErrorCode, string>;

const errorStatuses = {
	INVALID_CHAT_REQUEST: 400,
	RESOURCE_NOT_FOUND: 404,
	CHAT_RESULT_NOT_AVAILABLE: 409,
	CHAT_TURN_IN_PROGRESS: 409,
	REQUEST_TOO_LARGE: 413,
	CHAT_RATE_LIMITED: 429,
	INTERNAL_SERVICE_FAILURE: 500,
	CHAT_SERVICE_UNAVAILABLE: 503,
} as const satisfies Record<ChatErrorCode, number>;

function errorResponse(code: ChatErrorCode) {
	return new Response(
		JSON.stringify(
			chatErrorResponseSchema.parse({
				error: { code, message: errorMessages[code] },
			}),
		),
		{
			status: errorStatuses[code],
			headers: {
				"cache-control": "no-store",
				"content-type": "application/json; charset=UTF-8",
			},
		},
	);
}

function mediaType(contentType: string | undefined) {
	return contentType?.split(";", 1)[0]?.trim().toLowerCase();
}

function allowedOrigin(origin: string | undefined) {
	if (!origin) return false;
	try {
		return (
			origin ===
			new URL(process.env.PLATFORM_URL ?? "http://localhost:3000").origin
		);
	} catch {
		return false;
	}
}

function actorKey(c: { req: { header(name: string): string | undefined } }) {
	return (
		c.req.header("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
		c.req.header("x-real-ip")?.trim() ||
		"anonymous"
	);
}

function consumeRateLimit(key: string) {
	const cutoff = Date.now() - RATE_WINDOW_MS;
	const recent = (rateBuckets.get(key) ?? []).filter(
		(timestamp) => timestamp > cutoff,
	);
	if (recent.length >= RATE_LIMIT) {
		rateBuckets.set(key, recent);
		return false;
	}
	recent.push(Date.now());
	rateBuckets.set(key, recent);
	if (rateBuckets.size > 2_000) {
		for (const [bucketKey, timestamps] of rateBuckets) {
			if (timestamps.every((timestamp) => timestamp <= cutoff))
				rateBuckets.delete(bucketKey);
		}
	}
	return true;
}

function safeRequestText(message: Message) {
	if (message.role !== "user" && message.role !== "assistant") return undefined;
	if (typeof message.content === "string") return message.content;
	if (!message.content.every((part) => part.type === "text")) return undefined;
	return message.content
		.map((part) => (part.type === "text" ? part.text : ""))
		.join("\n");
}

function newestUserText(body: ClientStreamRequest) {
	if (body.type !== "messages" || body.resume !== undefined) return undefined;
	if (body.messages.length === 0 || body.messages.length > CHAT_MAX_MESSAGES)
		return undefined;
	for (const message of body.messages) {
		const text = safeRequestText(message);
		if (!text || text.length > CHAT_MAX_USER_TEXT) return undefined;
	}
	const prompt = body.messages.findLast((message) => message.role === "user");
	if (prompt?.role !== "user") return undefined;
	if (
		typeof prompt.content !== "string" &&
		(prompt.content.length !== 1 || prompt.content[0]?.type !== "text")
	)
		return undefined;
	const text = safeRequestText(prompt)?.trim();
	if (!text || text.length > CHAT_MAX_USER_TEXT) return undefined;
	return text;
}

function mapServiceError(
	error: unknown,
	fallback: ChatErrorCode = "INTERNAL_SERVICE_FAILURE",
) {
	return error instanceof ValuationChatServiceError ? error.code : fallback;
}

function projectStreamEvent(
	event: ClientStreamEvent,
): ClientStreamEvent | undefined {
	const runId = event.runId;
	switch (event.type) {
		case "run_start":
			return { runId, type: "run_start", source: "agent" };
		case "turn_start":
			return { runId, type: "turn_start" };
		case "message_start":
			return {
				runId,
				type: "message_start",
				messageId: event.messageId,
				role: "assistant",
			};
		case "text_start":
			return {
				runId,
				type: "text_start",
				messageId: event.messageId,
				partId: event.partId,
			};
		case "text_delta":
			return {
				runId,
				type: "text_delta",
				messageId: event.messageId,
				partId: event.partId,
				delta: event.delta,
			};
		case "text_end":
			return {
				runId,
				type: "text_end",
				messageId: event.messageId,
				partId: event.partId,
				...(event.text === undefined ? {} : { text: event.text }),
			};
		case "message_end":
			return { runId, type: "message_end", messageId: event.messageId };
		case "turn_end":
			return { runId, type: "turn_end" };
		case "run_end":
			return { runId, type: "run_end", status: event.status };
		case "error":
			return {
				runId,
				type: "error",
				error: {
					message: "Layanan percakapan sementara tidak tersedia.",
					code: "CHAT_SERVICE_UNAVAILABLE",
					retryable: true,
				},
			};
		default:
			return undefined;
	}
}

export const valuationChatRouter = new Hono()
	.use("*", async (c, next) => {
		c.header("cache-control", "no-store");
		await next();
	})
	.post(
		"/sessions",
		bodyLimit({
			maxSize: MAX_REQUEST_BYTES,
			onError: () => errorResponse("REQUEST_TOO_LARGE"),
		}),
		async (c) => {
			if (
				mediaType(c.req.header("content-type")) !== "application/json" ||
				!allowedOrigin(c.req.header("origin"))
			)
				return errorResponse("INVALID_CHAT_REQUEST");
			const valuationId = chatRouteIdSchema.safeParse(
				c.req.param("valuationId"),
			);
			if (!valuationId.success) return errorResponse("INVALID_CHAT_REQUEST");
			let input: unknown;
			try {
				input = await c.req.json();
			} catch {
				return errorResponse("INVALID_CHAT_REQUEST");
			}
			if (!createChatSessionBodySchema.safeParse(input).success)
				return errorResponse("INVALID_CHAT_REQUEST");
			try {
				const result = await createOrRecoverChatSession(valuationId.data);
				return c.json({ session: result.session }, result.created ? 201 : 200);
			} catch (error) {
				return errorResponse(mapServiceError(error));
			}
		},
	)
	.get("/sessions/:sessionId", async (c) => {
		const valuationId = chatRouteIdSchema.safeParse(c.req.param("valuationId"));
		const sessionId = chatRouteIdSchema.safeParse(c.req.param("sessionId"));
		if (!valuationId.success || !sessionId.success)
			return errorResponse("INVALID_CHAT_REQUEST");
		if (c.req.header("origin") && !allowedOrigin(c.req.header("origin")))
			return errorResponse("INVALID_CHAT_REQUEST");
		try {
			return c.json(await readChatSession(valuationId.data, sessionId.data));
		} catch (error) {
			return errorResponse(mapServiceError(error));
		}
	})
	.post(
		"/sessions/:sessionId/messages",
		bodyLimit({
			maxSize: MAX_REQUEST_BYTES,
			onError: () => errorResponse("REQUEST_TOO_LARGE"),
		}),
		async (c) => {
			if (
				mediaType(c.req.header("content-type")) !== "application/json" ||
				!allowedOrigin(c.req.header("origin"))
			)
				return errorResponse("INVALID_CHAT_REQUEST");
			const valuationId = chatRouteIdSchema.safeParse(
				c.req.param("valuationId"),
			);
			const sessionId = chatRouteIdSchema.safeParse(c.req.param("sessionId"));
			if (!valuationId.success || !sessionId.success)
				return errorResponse("INVALID_CHAT_REQUEST");

			let body: ClientStreamRequest;
			try {
				body = parseClientStreamRequest(await c.req.json());
			} catch {
				return errorResponse("INVALID_CHAT_REQUEST");
			}
			const text = newestUserText(body);
			if (!text) return errorResponse("INVALID_CHAT_REQUEST");

			try {
				await readChatSession(valuationId.data, sessionId.data);
				const grounding = await loadValuationGrounding(valuationId.data);
				if (
					!consumeRateLimit(`${actorKey(c)}:${valuationId.data}`) ||
					!consumeRateLimit(`session:${sessionId.data}`)
				)
					return errorResponse("CHAT_RATE_LIMITED");
				const turnId = await acquireChatTurn(valuationId.data, sessionId.data);
				const abortSignal = AbortSignal.any([
					c.req.raw.signal,
					AbortSignal.timeout(CHAT_MODEL_TIMEOUT_MS),
				]);
				let agent: ReturnType<typeof createValuationChatAgent>;
				try {
					agent = createValuationChatAgent({
						grounding,
						memory,
						productionLogging: false,
						productionTracing: false,
					});
				} catch {
					await releaseChatTurn(sessionId.data, turnId);
					return errorResponse("CHAT_SERVICE_UNAVAILABLE");
				}

				const events = (async function* () {
					try {
						const projected = agentToClientStream({
							events: agent.stream({
								prompt: { role: "user", content: text },
								session: { sessionId: sessionId.data },
								abortSignal,
								retries: {},
								trace: {
									name: "valuation-chat",
									metadata: { agentId: agent.id },
									tags: ["chat", "valuation-chat"],
								},
							}),
							mapError: () => ({
								message: "Layanan percakapan sementara tidak tersedia.",
								code: "CHAT_SERVICE_UNAVAILABLE",
								retryable: true,
							}),
						});
						for await (const event of projected) {
							const safeEvent = projectStreamEvent(event);
							if (safeEvent) yield safeEvent;
						}
					} finally {
						await releaseChatTurn(sessionId.data, turnId);
						await flushAgentTracing();
					}
				})();

				return createClientStreamResponse({
					events,
					format: "jsonl",
					headers: { "cache-control": "no-store" },
				});
			} catch (error) {
				return errorResponse(
					mapServiceError(error, "CHAT_SERVICE_UNAVAILABLE"),
				);
			}
		},
	)
	.delete("/sessions/:sessionId", async (c) => {
		if (!allowedOrigin(c.req.header("origin")))
			return errorResponse("INVALID_CHAT_REQUEST");
		const valuationId = chatRouteIdSchema.safeParse(c.req.param("valuationId"));
		const sessionId = chatRouteIdSchema.safeParse(c.req.param("sessionId"));
		if (!valuationId.success || !sessionId.success)
			return errorResponse("INVALID_CHAT_REQUEST");
		try {
			await deleteChatSession(valuationId.data, sessionId.data);
			return c.body(null, 204);
		} catch (error) {
			return errorResponse(mapServiceError(error));
		}
	});
