import { z } from "zod";

export const productCategorySchema = z.enum([
	"computer",
	"handphone",
	"tablet",
	"gaming_console",
	"camera",
]);
export type ProductCategory = z.infer<typeof productCategorySchema>;

export const marketplaceConditionSchema = z.enum([
	"Seperti baru",
	"Baik",
	"Cukup",
	"Rusak",
]);
export type MarketplaceCondition = z.infer<typeof marketplaceConditionSchema>;

export type MarketplaceSource = "BLIBLI";

export type ComparableListing = {
	source: MarketplaceSource;
	listing_id: string;
	listing_url: string;
	title: string;
	price_idr: number;
	condition?: string;
	city?: string;
	seller_type?: string;
	product_attributes: Record<string, string>;
	listing_status: "AVAILABLE" | "LIVE";
	posted_at?: string;
	scraped_at: string;
	match_score?: number;
	exclusion_reason?: string;
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
export const MAX_ITEMS_PER_QUERY = 10;
export const MAX_QUERY_VARIANTS = 3;
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

export function isoDate(value: unknown) {
	if (typeof value !== "string" && typeof value !== "number") return undefined;
	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

export function isRejectedTitle(title: string) {
	const normalized = normalizeText(title);
	return [
		/\b(accessory|accessories|case|casing|cover|charger|kabel|cable|adapter|headset|earphone|strap|mouse|keyboard|tas|bag|tempered|screen protector|pelindung|stand|holder|dock|base|dudukan|plug|dust proof|anti debu)\b/,
		/\b(lcd|baterai|battery|sparepart|suku cadang|service|servis|repair|perbaikan|for parts|kardus|dus)\b/,
		/\b(borongan|sepasang|(?:[2-9]|\d{2,})\s*(unit|pcs))\b/,
	].some((pattern) => pattern.test(normalized));
}

export function approvedMarketplaceUrl(value: unknown) {
	if (typeof value !== "string") return undefined;
	try {
		const url = new URL(value);
		if (
			url.protocol !== "https:" ||
			(url.hostname !== "blibli.com" && !url.hostname.endsWith(".blibli.com"))
		)
			return undefined;
		return url.toString();
	} catch {
		return undefined;
	}
}

export function cacheKey(input: {
	searchTerms: string[];
	location?: string;
	identity?: Record<string, unknown>;
}) {
	return JSON.stringify({
		...(input.identity
			? {
					identity: Object.entries(input.identity)
						.filter(([, value]) => value !== undefined)
						.sort(([left], [right]) => left.localeCompare(right))
						.map(([key, value]) => [
							key,
							Array.isArray(value)
								? value.map(String).map(normalizeText).sort()
								: typeof value === "string"
									? normalizeText(value)
									: value,
						]),
				}
			: { searchTerms: input.searchTerms.map(normalizeText).sort() }),
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
