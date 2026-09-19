import { z } from "zod";

export const productConditionSchema = z.enum([
	"Seperti baru",
	"Baik",
	"Cukup",
	"Rusak",
]);

const productNameSchema = z.string().trim().min(1).max(160);
const productDescriptionSchema = z.string().trim().min(1).max(2_000);

export const createValuationRequestSchema = z
	.object({
		productName: productNameSchema,
		productCondition: productConditionSchema,
		productDescription: productDescriptionSchema.optional(),
	})
	.strict();

export type CreateValuationRequest = z.infer<
	typeof createValuationRequestSchema
>;

export const valuationJobDataSchema = z
	.object({
		valuationId: z.string().trim().min(1).max(64),
		contractVersion: z.literal(1),
	})
	.strict();

export type ValuationJobData = z.infer<typeof valuationJobDataSchema>;

export const valuationStageSchema = z.enum([
	"QUEUED",
	"VALIDATING_IDENTITY",
	"FINDING_COMPARABLES",
	"CALCULATING_PRICE",
	"PREPARING_EXPLANATION",
	"COMPLETED",
]);

export const valuationErrorCodeSchema = z.enum([
	"INVALID_REQUEST",
	"RESOURCE_NOT_FOUND",
	"IDEMPOTENCY_CONFLICT",
	"RESULT_NOT_AVAILABLE",
	"RATE_LIMITED",
	"INTERNAL_SERVICE_FAILURE",
	"SERVICE_UNAVAILABLE",
]);

export type ValuationErrorCode = z.infer<typeof valuationErrorCodeSchema>;

export const valuationErrorResponseSchema = z
	.object({
		error: z
			.object({
				code: valuationErrorCodeSchema,
				message: z.string().trim().min(1).max(160),
			})
			.strict(),
	})
	.strict();

const dateSchema = z.string().datetime({ offset: true });
const publicValuationSchema = z
	.object({
		id: z.string().trim().min(1).max(64),
		state: z.enum(["QUEUED", "RUNNING", "COMPLETED"]),
		stage: valuationStageSchema,
		createdAt: dateSchema,
		expiresAt: dateSchema,
		pollAfterMs: z.number().int().positive(),
	})
	.strict();

const explanatoryTextSchema = z.string().trim().min(1).max(2_000);
const explanationItemSchema = z.string().trim().min(1).max(300);
const limitationsSchema = z.array(explanationItemSchema).min(3).max(3);

export const valuationReadResponseSchema = z
	.object({
		valuation: publicValuationSchema,
		result: z
			.discriminatedUnion("status", [
				z
					.object({
						status: z.literal("VALUATED"),
						productName: productNameSchema,
						productCondition: productConditionSchema,
						suggestedListingPriceIdr: z.number().int().positive(),
						observedMarketRangeIdr: z
							.object({
								minimum: z.number().int().positive(),
								maximum: z.number().int().positive(),
							})
							.strict(),
						confidence: z.enum(["HIGH", "MEDIUM"]),
						confidenceReason: explanatoryTextSchema,
						acceptedComparableCount: z.number().int().min(5).max(30),
						evidenceCoverage: z.literal("NATIONAL"),
						evidenceRetrievedAt: dateSchema,
						explanation: explanatoryTextSchema,
						pros: z.array(explanationItemSchema).max(8),
						cons: z.array(explanationItemSchema).max(8),
						limitations: limitationsSchema,
					})
					.strict(),
				z
					.object({
						status: z.literal("UNSUPPORTED_CATEGORY"),
						explanation: explanatoryTextSchema,
						limitations: limitationsSchema,
					})
					.strict(),
				z
					.object({
						status: z.literal("MORE_INFORMATION_REQUIRED"),
						explanation: explanatoryTextSchema,
						missingFields: z.array(explanationItemSchema).min(1).max(12),
						limitations: limitationsSchema,
					})
					.strict(),
				z
					.object({
						status: z.literal("INSUFFICIENT_EVIDENCE"),
						explanation: explanatoryTextSchema,
						acceptedComparableCount: z.number().int().min(0).max(4),
						evidenceCoverage: z.literal("NATIONAL"),
						limitations: limitationsSchema,
					})
					.strict(),
				z
					.object({
						status: z.literal("SERVICE_FAILURE"),
						explanation: explanatoryTextSchema,
						limitations: limitationsSchema,
					})
					.strict(),
			])
			.nullable(),
	})
	.strict();

export const valuationCreateResponseSchema = z
	.object({ valuation: publicValuationSchema })
	.strict();

export const valuationEvidenceResponseSchema = z
	.object({
		valuationId: z.string().trim().min(1).max(64),
		source: z.literal("BLIBLI"),
		acceptedComparableCount: z.number().int().min(5).max(30),
		evidenceCoverage: z.literal("NATIONAL"),
		retrievedAt: dateSchema,
		listings: z
			.array(
				z
					.object({
						id: z.string().trim().min(1).max(64),
						title: z.string().trim().min(1).max(500),
						priceIdr: z.number().int().positive(),
						listingUrl: z.string().url().max(2_048),
					})
					.strict(),
			)
			.min(1)
			.max(5),
	})
	.strict();
