import { createHash, randomBytes } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";

const COOKIE_NAME = "asli_segini_anon";
const COOKIE_BYTES = 32;
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const OWNER_PREFIX = "asli-segini-owner-v1\0";

export type AnonymousOwner = {
	hasValidCookie: boolean;
	ownerKey: string;
};

declare module "hono" {
	interface ContextVariableMap {
		anonymousOwner: AnonymousOwner;
	}
}

function configuredCookieMaxAge() {
	const configured = Number(process.env.ANONYMOUS_COOKIE_MAX_AGE_SECONDS);
	return Number.isSafeInteger(configured) && configured > 0
		? configured
		: COOKIE_MAX_AGE_SECONDS;
}

function isLocalEnvironment() {
	try {
		const hostname = new URL(
			process.env.PLATFORM_URL ?? "http://localhost:3000",
		).hostname;
		return (
			hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
		);
	} catch {
		return process.env.NODE_ENV !== "production";
	}
}

function cookieValue(cookieHeader: string | undefined) {
	if (!cookieHeader) return undefined;
	for (const part of cookieHeader.split(";")) {
		const [name, ...value] = part.trim().split("=");
		if (name === COOKIE_NAME) return value.join("=");
	}
	return undefined;
}

function isValidRawCookie(value: string | undefined): value is string {
	if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
	try {
		return Buffer.from(value, "base64url").length === COOKIE_BYTES;
	} catch {
		return false;
	}
}

function ownerKey(rawCookie: string) {
	return createHash("sha256")
		.update(OWNER_PREFIX)
		.update(rawCookie)
		.digest("hex");
}

function issueCookie(c: Context, rawCookie: string) {
	const attributes = [
		`${COOKIE_NAME}=${rawCookie}`,
		"HttpOnly",
		"SameSite=Lax",
		"Path=/",
		`Max-Age=${configuredCookieMaxAge()}`,
	];
	if (!isLocalEnvironment()) attributes.push("Secure");
	c.header("set-cookie", attributes.join("; "), { append: true });
}

export const anonymousOwnerMiddleware: MiddlewareHandler = async (c, next) => {
	const existing = cookieValue(c.req.header("cookie"));
	const hasValidCookie = isValidRawCookie(existing);
	const rawCookie = hasValidCookie
		? existing
		: randomBytes(COOKIE_BYTES).toString("base64url");
	if (!hasValidCookie) issueCookie(c, rawCookie);
	c.set("anonymousOwner", { hasValidCookie, ownerKey: ownerKey(rawCookie) });
	await next();
};

export function anonymousOwner(c: Context): AnonymousOwner {
	return c.get("anonymousOwner");
}
