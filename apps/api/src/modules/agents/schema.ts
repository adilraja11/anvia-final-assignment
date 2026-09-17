import { z } from "zod";

const shortTextSchema = z.string().trim().min(1).max(160);
const detailTextSchema = z.string().trim().min(1).max(2_000);

export const conditionSchema = z.enum([
	"Baru",
	"Seperti baru",
	"Baik",
	"Cukup",
	"Rusak",
	"Tidak diketahui",
]);

export const valuationRequestSchema = z
	.object({
		productName: shortTextSchema,
		productDescription: detailTextSchema,
		productCondition: conditionSchema,
		productAskingPriceIdr: z
			.number()
			.int()
			.positive()
			.max(Number.MAX_SAFE_INTEGER),
	})
	.strict();

export type ValuationRequest = z.infer<typeof valuationRequestSchema>;

export const imageIdentificationResultSchema = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("SUPPORTED"),
			productName: shortTextSchema,
		})
		.strict(),
	z.object({ status: z.literal("UNSUPPORTED_CATEGORY") }).strict(),
	z.object({ status: z.literal("MORE_INFORMATION_REQUIRED") }).strict(),
]);

export const imageIdentificationResponseSchema = z
	.object({ result: imageIdentificationResultSchema })
	.strict();

const explanationSchema = z.string().trim().min(1).max(2_000);
const explanationItemSchema = z.string().trim().min(1).max(300);
const evidenceIdSchema = z.string().trim().min(1).max(160);
const finalRecommendationSchema = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("PRICE_RANGE_AVAILABLE"),
			reasonableBuyPriceRangeIdr: z
				.object({
					minimum: z.number().int().positive(),
					maximum: z.number().int().positive(),
				})
				.strict(),
		})
		.strict(),
	z
		.object({
			status: z.literal("INSUFFICIENT_EVIDENCE"),
		})
		.strict(),
]);

export const valuationResultSchema = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("SUCCESS"),
			explanation: explanationSchema,
			pros: z.array(explanationItemSchema).max(8),
			cons: z.array(explanationItemSchema).max(8),
			evidenceIds: z.array(evidenceIdSchema).max(30),
			finalRecommendation: finalRecommendationSchema,
		})
		.strict(),
	z
		.object({
			status: z.literal("UNSUPPORTED_CATEGORY"),
			explanation: explanationSchema,
		})
		.strict(),
	z
		.object({
			status: z.literal("MORE_INFORMATION_REQUIRED"),
			explanation: explanationSchema,
			missingFields: z.array(explanationItemSchema).min(1).max(12),
		})
		.strict(),
	z
		.object({
			status: z.literal("INSUFFICIENT_EVIDENCE"),
			explanation: explanationSchema,
			evidenceIds: z.array(evidenceIdSchema).max(30),
		})
		.strict(),
	z
		.object({
			status: z.literal("SERVICE_FAILURE"),
			explanation: explanationSchema,
		})
		.strict(),
]);

export const valuationResponseSchema = z
	.object({ result: valuationResultSchema })
	.strict();

export const agentApiErrorCodeSchema = z.enum([
	"INVALID_REQUEST",
	"IMAGE_TOO_LARGE",
	"UNSUPPORTED_IMAGE_TYPE",
	"INVALID_IMAGE",
	"REQUEST_CANCELLED",
	"AGENT_SERVICE_FAILURE",
]);

export type AgentApiErrorCode = z.infer<typeof agentApiErrorCodeSchema>;

export const agentApiErrorResponseSchema = z
	.object({
		error: z
			.object({
				code: agentApiErrorCodeSchema,
				message: z.string().trim().min(1).max(160),
			})
			.strict(),
	})
	.strict();
