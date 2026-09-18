import { z } from "zod";

export const marketplaceConditionSchema = z.enum([
	"Seperti baru",
	"Baik",
	"Cukup",
	"Rusak",
	"Tidak diketahui",
]);

export type MarketplaceCondition = z.infer<typeof marketplaceConditionSchema>;

export type NormalizedCondition =
	| "NEW"
	| "LIKE_NEW"
	| "GOOD"
	| "FAIR"
	| "DAMAGED"
	| "UNKNOWN";

export type MarketplaceSource = "BLIBLI" | "FACEBOOK_MARKETPLACE";

export type ComparableListing = {
	source: MarketplaceSource;
	listing_id: string;
	listing_url: string;
	title: string;
	price_idr: number;
	condition: Exclude<NormalizedCondition, "NEW">;
	city?: string;
	seller_type?: string;
	product_attributes: Record<string, string>;
	listing_status: "AVAILABLE" | "LIVE";
	posted_at?: string;
	scraped_at: string;
	match_score?: number;
};

export type RejectedListing = {
	source: MarketplaceSource;
	listing_id?: string;
	exclusion_reason: string;
};

export type MarketplaceSuccess = {
	status: "SUCCESS";
	provider: MarketplaceSource;
	source: MarketplaceSource;
	search_terms: string[];
	condition: MarketplaceCondition;
	region: "Indonesia";
	location?: string;
	fetched_at: string;
	cache_hit: boolean;
	evidence: ComparableListing[];
	rejected: RejectedListing[];
};

export type MarketplaceFailure = {
	status: "PROVIDER_FAILURE";
	provider: MarketplaceSource;
	source: MarketplaceSource;
	error_category:
		| "CONFIGURATION"
		| "NETWORK"
		| "TIMEOUT"
		| "APIFY_ERROR"
		| "MALFORMED_RESPONSE"
		| "MISSING_DATASET"
		| "UNKNOWN";
	retried: boolean;
};

export type MarketplaceToolResult = MarketplaceSuccess | MarketplaceFailure;

export type ProviderErrorCategory = MarketplaceFailure["error_category"];

export const MAX_PROVIDER_RESULTS = 30;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function boundedText(value: unknown, maxLength: number) {
	if (typeof value !== "string") return undefined;
	const text = Array.from(value)
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code >= 32 && code !== 127;
		})
		.join("")
		.trim();
	return text ? text.slice(0, maxLength) : undefined;
}

export function normalizeText(value: string) {
	return value
		.toLocaleLowerCase("id-ID")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/(\p{N})(?=\p{L})/gu, "$1 ")
		.replace(/(\p{L})(?=\p{N})/gu, "$1 ")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.replace(/\bps\s*([345])\b/gu, "playstation $1")
		.trim();
}

export function tokens(value: string) {
	return normalizeText(value)
		.split(/\s+/)
		.filter((token) => token.length > 1 || /^\d+$/.test(token));
}

export function isSafeIntegerPrice(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isoDate(value: unknown) {
	if (typeof value !== "string" && typeof value !== "number") return undefined;
	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

export function classifyCondition(value: unknown) {
	const text = boundedText(value, 160);
	if (!text)
		return { condition: "UNKNOWN" as const, explicitSecondHand: false };
	const normalized = normalizeText(text);
	if (/\b(like new|seperti baru|mint)\b/.test(normalized))
		return { condition: "LIKE_NEW" as const, explicitSecondHand: true };
	if (/\b(damaged|rusak|cacat|for parts|mati total)\b/.test(normalized))
		return { condition: "DAMAGED" as const, explicitSecondHand: true };
	if (/\b(fair|cukup)\b/.test(normalized))
		return { condition: "FAIR" as const, explicitSecondHand: true };
	if (/\b(good|baik)\b/.test(normalized))
		return { condition: "GOOD" as const, explicitSecondHand: true };
	if (/\b(used|bekas|second|secondhand)\b/.test(normalized))
		return { condition: "UNKNOWN" as const, explicitSecondHand: true };
	if (/\b(new|baru|segel|unopened)\b/.test(normalized))
		return { condition: "NEW" as const, explicitSecondHand: false };
	return { condition: "UNKNOWN" as const, explicitSecondHand: false };
}

export function comparableCondition(
	condition: NormalizedCondition,
	requested: MarketplaceCondition,
	explicitSecondHand: boolean,
) {
	if (!explicitSecondHand || condition === "NEW") return false;
	if (requested === "Tidak diketahui") return true;
	return (
		(requested === "Seperti baru" && condition === "LIKE_NEW") ||
		(requested === "Baik" && condition === "GOOD") ||
		(requested === "Cukup" && condition === "FAIR") ||
		(requested === "Rusak" && condition === "DAMAGED")
	);
}

export function isRejectedTitle(title: string) {
	const normalized = normalizeText(title);
	return [
		/\b(accessory|accessories|case|casing|cover|charger|kabel|cable|adapter|headset|earphone|strap|mouse|keyboard|tas|bag|tempered|screen protector|pelindung|stand|holder|dock|base|dudukan|plug|dust proof|anti debu)\b/,
		/\b(lcd|display|baterai|battery|sparepart|suku cadang|service|servis|repair|perbaikan|for parts|kardus|dus)\b/,
		/\b(bundle|paket|borongan|sepasang|\d+\s*(unit|pcs))\b/,
	].some((pattern) => pattern.test(normalized));
}

export function approvedMarketplaceUrl(
	value: unknown,
	source: MarketplaceSource,
) {
	if (typeof value !== "string") return undefined;
	try {
		const url = new URL(value);
		const validHost =
			source === "BLIBLI"
				? url.hostname === "blibli.com" || url.hostname.endsWith(".blibli.com")
				: url.hostname === "facebook.com" ||
					url.hostname.endsWith(".facebook.com");
		if (url.protocol !== "https:" || !validHost) return undefined;
		if (
			source === "FACEBOOK_MARKETPLACE" &&
			!/^\/marketplace\/item\/[^/]+\/?$/i.test(url.pathname)
		)
			return undefined;
		return url.toString();
	} catch {
		return undefined;
	}
}

export function cacheKey(input: {
	searchTerms: string[];
	condition: MarketplaceCondition;
	location?: string;
}) {
	return JSON.stringify({
		searchTerms: input.searchTerms.map(normalizeText).sort(),
		condition: input.condition,
		location: input.location ? normalizeText(input.location) : undefined,
		region: "Indonesia",
	});
}

export function providerErrorCategory(error: unknown): ProviderErrorCategory {
	if (error instanceof ProviderBoundaryError) return error.category;
	if (error instanceof Error) {
		const value = `${error.name} ${error.message}`.toLowerCase();
		if (/timeout|timed out|abort|etimedout|econnaborted/.test(value))
			return "TIMEOUT";
		if (/network|fetch|enotfound|econnreset|socket/.test(value))
			return "NETWORK";
	}
	return "UNKNOWN";
}

export class ProviderBoundaryError extends Error {
	readonly category: ProviderErrorCategory;

	constructor(category: ProviderErrorCategory) {
		super(category);
		this.name = "ProviderBoundaryError";
		this.category = category;
	}
}
