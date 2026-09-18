import { z } from "zod";

const shortTextSchema = z.string().trim().min(1).max(160);
const detailTextSchema = z.string().trim().min(1).max(2_000);

export const conditionSchema = z.enum([
	"Seperti baru",
	"Baik",
	"Cukup",
	"Rusak",
]);

export const valuationRequestSchema = z
	.object({
		productName: shortTextSchema,
		productCondition: conditionSchema,
		productDescription: detailTextSchema.optional(),
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
const valuationSummarySchema = z
	.object({
		acceptedComparableCount: z.number().int().min(0).max(30),
		evidenceCoverage: z.enum(["LOCAL", "NATIONAL"]),
		outlierCount: z.number().int().min(0).max(30),
	})
	.strict();

const valuationExplanationSchema = z
	.object({
		explanation: explanationSchema,
		pros: z.array(explanationItemSchema).max(8),
		cons: z.array(explanationItemSchema).max(8),
		evidenceIds: z.array(evidenceIdSchema).max(30),
	})
	.strict();

export const valuationResultSchema = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("VALUATED"),
			suggestedListingPriceIdr: z.number().int().positive(),
			observedMarketRangeIdr: z
				.object({
					minimum: z.number().int().positive(),
					maximum: z.number().int().positive(),
				})
				.strict(),
			confidence: z.enum(["HIGH", "MEDIUM"]),
			confidenceReason: explanationSchema,
		})
		.extend(valuationExplanationSchema.shape)
		.extend(valuationSummarySchema.shape)
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
		.extend(valuationSummarySchema.shape)
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
