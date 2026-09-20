import { hc } from "hono/client";
import type { AppType } from "../../../api/src/index";

const anonymousSessionCode = "ANONYMOUS_SESSION_REQUIRED";

export const cookieRequiredMessage =
	"Cookie browser diperlukan untuk menyimpan dan membuka hasil valuasi sementara. Aktifkan cookie untuk situs ini, lalu coba lagi.";

/**
 * The API-issued HttpOnly cookie is intentionally managed only by the browser.
 * Keeping this at the API boundary prevents individual callers from drifting to
 * credential-omitting requests.
 */
export const credentialedFetch: typeof fetch = (input, init) =>
	fetch(input, { ...init, credentials: "include" });

function isAnonymousSessionRequiredBody(value: unknown): boolean {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const error = (value as Record<string, unknown>).error;
	return (
		typeof error === "object" &&
		error !== null &&
		!Array.isArray(error) &&
		(error as Record<string, unknown>).code === anonymousSessionCode
	);
}

export async function isAnonymousSessionRequired(
	response: Response,
): Promise<boolean> {
	if (response.status !== 428) return false;
	try {
		return isAnonymousSessionRequiredBody(await response.clone().json());
	} catch {
		return false;
	}
}

export function isAnonymousSessionRequiredStreamError(
	status: number,
	body: string,
): boolean {
	if (status !== 428) return false;
	try {
		return isAnonymousSessionRequiredBody(JSON.parse(body));
	} catch {
		return false;
	}
}

/**
 * A missing cookie can be established only by a response. Retrying this one
 * explicit precondition is safe because the server guarantees no side effect.
 */
export async function retryAnonymousSessionRequired(
	request: () => Promise<Response>,
	signal?: AbortSignal,
): Promise<Response> {
	const firstResponse = await request();
	if (signal?.aborted || !(await isAnonymousSessionRequired(firstResponse)))
		return firstResponse;
	return request();
}

export const api = hc<AppType>("/", { fetch: credentialedFetch });
