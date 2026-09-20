export type ApiErrorCode =
	| "INVALID_REQUEST"
	| "IMAGE_TOO_LARGE"
	| "UNSUPPORTED_IMAGE_TYPE"
	| "INVALID_IMAGE"
	| "REQUEST_CANCELLED"
	| "AGENT_SERVICE_FAILURE"
	| "RESOURCE_NOT_FOUND"
	| "IDEMPOTENCY_CONFLICT"
	| "RESULT_NOT_AVAILABLE"
	| "RATE_LIMITED"
	| "INTERNAL_SERVICE_FAILURE"
	| "SERVICE_UNAVAILABLE"
	| "ANONYMOUS_SESSION_REQUIRED"
	| "MALFORMED_RESPONSE"
	| "NETWORK_FAILURE";
export class ApiError extends Error {
	constructor(
		public readonly code: ApiErrorCode,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
export async function readJson(response: Response): Promise<unknown> {
	if (!response.headers.get("content-type")?.includes("application/json"))
		throw new ApiError(
			"MALFORMED_RESPONSE",
			"Respons layanan tidak dapat diverifikasi. Silakan coba lagi.",
		);
	try {
		return await response.json();
	} catch {
		throw new ApiError(
			"MALFORMED_RESPONSE",
			"Respons layanan tidak dapat diverifikasi. Silakan coba lagi.",
		);
	}
}
export async function throwApiError(response: Response): Promise<never> {
	const body = await readJson(response);
	if (
		!isRecord(body) ||
		!isRecord(body.error) ||
		typeof body.error.code !== "string" ||
		typeof body.error.message !== "string"
	)
		throw new ApiError(
			"MALFORMED_RESPONSE",
			"Respons layanan tidak dapat diverifikasi. Silakan coba lagi.",
		);
	throw new ApiError(body.error.code as ApiErrorCode, body.error.message);
}
export async function decodeResponse(
	response: Response,
	signal?: AbortSignal,
): Promise<unknown> {
	try {
		if (!response.ok) return throwApiError(response);
		return readJson(response);
	} catch (error) {
		if (error instanceof ApiError) throw error;
		if (
			signal?.aborted ||
			(error instanceof DOMException && error.name === "AbortError")
		)
			throw new ApiError("REQUEST_CANCELLED", "Permintaan dibatalkan.");
		throw new ApiError(
			"NETWORK_FAILURE",
			"API lokal tidak dapat dihubungi. Pastikan API dan worker sedang berjalan.",
		);
	}
}
