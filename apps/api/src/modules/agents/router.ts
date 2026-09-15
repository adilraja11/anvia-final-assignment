import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AgentApiErrorCode } from "./schema.js";
import {
	agentApiErrorResponseSchema,
	valuationRequestSchema,
} from "./schema.js";
import {
	AgentApiServiceError,
	MAX_IMAGE_BYTES,
	runImageIdentification,
	runValuation,
} from "./services.js";

const MAX_MULTIPART_OVERHEAD_BYTES = 256 * 1024;
const MAX_VALUATION_REQUEST_BYTES = 64 * 1024;

const errorMessages = {
	INVALID_REQUEST: "Permintaan tidak valid.",
	IMAGE_TOO_LARGE: "Ukuran gambar melebihi batas yang diizinkan.",
	UNSUPPORTED_IMAGE_TYPE: "Format gambar tidak didukung.",
	INVALID_IMAGE: "Gambar tidak valid.",
	REQUEST_CANCELLED: "Permintaan dibatalkan.",
	AGENT_SERVICE_FAILURE: "Layanan agen sedang bermasalah.",
} as const satisfies Record<AgentApiErrorCode, string>;

const errorStatuses = {
	INVALID_REQUEST: 400,
	IMAGE_TOO_LARGE: 413,
	UNSUPPORTED_IMAGE_TYPE: 415,
	INVALID_IMAGE: 422,
	REQUEST_CANCELLED: 499,
	AGENT_SERVICE_FAILURE: 500,
} as const satisfies Record<AgentApiErrorCode, number>;

function errorResponse(code: AgentApiErrorCode) {
	const body = agentApiErrorResponseSchema.parse({
		error: { code, message: errorMessages[code] },
	});
	return new Response(JSON.stringify(body), {
		status: errorStatuses[code],
		headers: {
			"cache-control": "no-store",
			"content-type": "application/json; charset=UTF-8",
		},
	});
}

function mappedServiceError(error: unknown, requestSignal: AbortSignal) {
	if (requestSignal.aborted) return errorResponse("REQUEST_CANCELLED");
	if (error instanceof AgentApiServiceError) return errorResponse(error.code);
	return errorResponse("AGENT_SERVICE_FAILURE");
}

function mediaType(contentType: string | undefined) {
	return contentType?.split(";", 1)[0]?.trim().toLowerCase();
}

export const agentApiRouter = new Hono()
	.use("*", async (c, next) => {
		if (c.req.raw.signal.aborted) return errorResponse("REQUEST_CANCELLED");
		c.header("cache-control", "no-store");
		await next();
	})
	.post(
		"/image-identification",
		bodyLimit({
			maxSize: MAX_IMAGE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES,
			onError: () => errorResponse("IMAGE_TOO_LARGE"),
		}),
		async (c) => {
			if (mediaType(c.req.header("content-type")) !== "multipart/form-data")
				return errorResponse("INVALID_REQUEST");

			let body: Awaited<ReturnType<typeof c.req.parseBody>>;
			try {
				body = await c.req.parseBody({ all: true });
			} catch {
				return c.req.raw.signal.aborted
					? errorResponse("REQUEST_CANCELLED")
					: errorResponse("INVALID_REQUEST");
			}

			const image = body.image;
			if (
				Object.keys(body).length !== 1 ||
				Array.isArray(image) ||
				!(image instanceof File)
			)
				return errorResponse("INVALID_REQUEST");

			try {
				return c.json(await runImageIdentification(image, c.req.raw.signal));
			} catch (error) {
				return mappedServiceError(error, c.req.raw.signal);
			}
		},
	)
	.post(
		"/valuation",
		bodyLimit({
			maxSize: MAX_VALUATION_REQUEST_BYTES,
			onError: () => errorResponse("INVALID_REQUEST"),
		}),
		async (c) => {
			if (mediaType(c.req.header("content-type")) !== "application/json")
				return errorResponse("INVALID_REQUEST");

			let input: unknown;
			try {
				input = await c.req.json();
			} catch {
				return c.req.raw.signal.aborted
					? errorResponse("REQUEST_CANCELLED")
					: errorResponse("INVALID_REQUEST");
			}

			const parsed = valuationRequestSchema.safeParse(input);
			if (!parsed.success) return errorResponse("INVALID_REQUEST");

			try {
				return c.json(await runValuation(parsed.data, c.req.raw.signal));
			} catch (error) {
				return mappedServiceError(error, c.req.raw.signal);
			}
		},
	);
