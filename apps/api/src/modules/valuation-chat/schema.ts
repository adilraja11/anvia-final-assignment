import { z } from "zod";

export const chatRouteIdSchema = z.string().trim().min(1).max(160);

export const createChatSessionBodySchema = z.object({}).strict();

const chatSessionSchema = z
	.object({
		id: chatRouteIdSchema,
		valuationId: chatRouteIdSchema,
		createdAt: z.string().datetime({ offset: true }),
		expiresAt: z.string().datetime({ offset: true }),
	})
	.strict();

const clientTextMessageSchema = z
	.object({
		id: chatRouteIdSchema,
		role: z.enum(["user", "assistant"]),
		parts: z
			.array(
				z
					.object({
						id: chatRouteIdSchema,
						type: z.literal("text"),
						text: z.string(),
					})
					.strict(),
			)
			.max(1),
	})
	.strict();

export const chatSessionResponseSchema = z
	.object({ session: chatSessionSchema })
	.strict();

export const chatHistoryResponseSchema = z
	.object({
		session: chatSessionSchema,
		messages: z.array(clientTextMessageSchema).max(60),
	})
	.strict();

export const chatErrorCodeSchema = z.enum([
	"ANONYMOUS_SESSION_REQUIRED",
	"INVALID_CHAT_REQUEST",
	"RESOURCE_NOT_FOUND",
	"CHAT_RESULT_NOT_AVAILABLE",
	"CHAT_TURN_IN_PROGRESS",
	"REQUEST_TOO_LARGE",
	"CHAT_RATE_LIMITED",
	"INTERNAL_SERVICE_FAILURE",
	"CHAT_SERVICE_UNAVAILABLE",
]);

export type ChatErrorCode = z.infer<typeof chatErrorCodeSchema>;

export const chatErrorResponseSchema = z
	.object({
		error: z
			.object({
				code: chatErrorCodeSchema,
				message: z.string().trim().min(1).max(160),
			})
			.strict(),
	})
	.strict();

export type ChatSessionEnvelope = z.infer<typeof chatSessionSchema>;
export type ClientChatMessage = z.infer<typeof clientTextMessageSchema>;
