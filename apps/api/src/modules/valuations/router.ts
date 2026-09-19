import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { valuationQueue } from "../../config/queue.js";
import {
	createValuationRequestSchema,
	type ValuationErrorCode,
	valuationCreateResponseSchema,
	valuationErrorResponseSchema,
	valuationEvidenceResponseSchema,
	valuationReadResponseSchema,
} from "./schema.js";
import {
	cleanupExpiredValuations,
	createOrReuseValuation,
	createResponse,
	isValidIdempotencyKey,
	readEvidence,
	readResponse,
	readValuation,
	ValuationServiceError,
} from "./valuation-service.js";

const MAX_REQUEST_BYTES = 64 * 1024;

const errorMessages = {
	INVALID_REQUEST: "Permintaan tidak valid.",
	RESOURCE_NOT_FOUND: "Sumber daya tidak ditemukan.",
	IDEMPOTENCY_CONFLICT:
		"Kunci idempotensi sudah digunakan untuk permintaan yang berbeda.",
	RESULT_NOT_AVAILABLE: "Hasil valuasi belum tersedia.",
	RATE_LIMITED: "Batas penggunaan tercapai.",
	INTERNAL_SERVICE_FAILURE: "Layanan sedang bermasalah.",
	SERVICE_UNAVAILABLE: "Layanan sementara tidak tersedia.",
} as const satisfies Record<ValuationErrorCode, string>;

const errorStatuses = {
	INVALID_REQUEST: 400,
	RESOURCE_NOT_FOUND: 404,
	IDEMPOTENCY_CONFLICT: 409,
	RESULT_NOT_AVAILABLE: 409,
	RATE_LIMITED: 429,
	INTERNAL_SERVICE_FAILURE: 500,
	SERVICE_UNAVAILABLE: 503,
} as const satisfies Record<ValuationErrorCode, number>;

function errorResponse(code: ValuationErrorCode) {
	return new Response(
		JSON.stringify(
			valuationErrorResponseSchema.parse({
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

async function queueStage(valuationId: string) {
	try {
		const job = await valuationQueue.getJob(valuationId);
		return typeof job?.progress === "string" ? job.progress : undefined;
	} catch {
		return undefined;
	}
}

export const valuationRouter = new Hono()
	.use("*", async (c, next) => {
		c.header("cache-control", "no-store");
		try {
			await cleanupExpiredValuations();
		} catch {
			return errorResponse("INTERNAL_SERVICE_FAILURE");
		}
		await next();
	})
	.post(
		"/",
		bodyLimit({
			maxSize: MAX_REQUEST_BYTES,
			onError: () => errorResponse("INVALID_REQUEST"),
		}),
		async (c) => {
			if (
				mediaType(c.req.header("content-type")) !== "application/json" ||
				!allowedOrigin(c.req.header("origin"))
			)
				return errorResponse("INVALID_REQUEST");
			const idempotencyKey = c.req.header("idempotency-key");
			if (
				idempotencyKey !== undefined &&
				!isValidIdempotencyKey(idempotencyKey)
			)
				return errorResponse("INVALID_REQUEST");
			let input: unknown;
			try {
				input = await c.req.json();
			} catch {
				return errorResponse("INVALID_REQUEST");
			}
			const parsed = createValuationRequestSchema.safeParse(input);
			if (!parsed.success) return errorResponse("INVALID_REQUEST");
			try {
				const valuation = await createOrReuseValuation(
					idempotencyKey,
					parsed.data,
				);
				return c.json(
					valuationCreateResponseSchema.parse(createResponse(valuation)),
					202,
				);
			} catch (error) {
				if (error instanceof ValuationServiceError)
					return errorResponse(error.code);
				return errorResponse("INTERNAL_SERVICE_FAILURE");
			}
		},
	)
	.get("/:valuationId", async (c) => {
		try {
			const stored = await readValuation(c.req.param("valuationId"));
			if (!stored) return errorResponse("RESOURCE_NOT_FOUND");
			const stage = await queueStage(stored.valuation.id);
			return c.json(
				valuationReadResponseSchema.parse(
					readResponse(
						stored.valuation,
						stored.acceptedComparableCount,
						stored.evidenceRetrievedAt,
						stage,
					),
				),
			);
		} catch {
			return errorResponse("INTERNAL_SERVICE_FAILURE");
		}
	})
	.get("/:valuationId/evidence", async (c) => {
		try {
			const stored = await readEvidence(c.req.param("valuationId"));
			if (!stored) return errorResponse("RESOURCE_NOT_FOUND");
			if (!("response" in stored)) return errorResponse("RESULT_NOT_AVAILABLE");
			return c.json(valuationEvidenceResponseSchema.parse(stored.response));
		} catch {
			return errorResponse("INTERNAL_SERVICE_FAILURE");
		}
	});
