import { createTool } from "@anvia/core";
import { ApifyApiError, ApifyClient } from "apify-client";
import { z } from "zod";

const ACTOR_ID = "abotapi/tokopedia-scraper";
const MAX_ITEMS = 10;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const conditionSchema = z.enum([
	"Baru",
	"Seperti baru",
	"Baik",
	"Cukup",
	"Rusak",
	"Tidak diketahui",
]);

const inputSchema = z.object({
	searchTerms: z.array(z.string().trim().min(1).max(160)).min(1).max(5),
	condition: conditionSchema,
	region: z.literal("Indonesia").default("Indonesia"),
});

type Condition = z.infer<typeof conditionSchema>;
type NormalizedCondition =
	| "NEW"
	| "LIKE_NEW"
	| "GOOD"
	| "FAIR"
	| "DAMAGED"
	| "UNKNOWN";

type Evidence = {
	source: "TOKOPEDIA";
	listing_id: string;
	listing_url: string;
	title: string;
	price_idr: number;
	condition: NormalizedCondition;
	city?: string;
	seller_type?: string;
	product_attributes: Record<string, string>;
	listing_status: "ACTIVE";
	posted_at?: string;
	scraped_at: string;
};

type Rejected = {
	listing_id?: string;
	reason: string;
};

type Success = {
	status: "SUCCESS";
	provider: "TOKOPEDIA";
	source: "TOKOPEDIA";
	search_terms: string[];
	condition: Condition;
	region: "Indonesia";
	fetched_at: string;
	cache_hit: boolean;
	evidence: Evidence[];
	rejected: Rejected[];
};

type Failure = {
	status: "PROVIDER_FAILURE";
	provider: "TOKOPEDIA";
	source: "TOKOPEDIA";
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

type ToolOutput = Success | Failure;

type CacheEntry = {
	expiresAt: number;
	value: Success;
};

const cache = new Map<string, CacheEntry>();

class ProviderBoundaryError extends Error {
	readonly category: Failure["error_category"];

	constructor(category: Failure["error_category"]) {
		super(category);
		this.name = "ProviderBoundaryError";
		this.category = category;
	}
}

function boundedText(value: unknown, maxLength: number) {
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

function normalizeText(value: string) {
	return value
		.toLocaleLowerCase("id-ID")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/(\p{N})(?=\p{L})/gu, "$1 ")
		.replace(/(\p{L})(?=\p{N})/gu, "$1 ")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

function tokens(value: string) {
	return normalizeText(value)
		.split(/\s+/)
		.filter((token) => token.length > 1);
}

function matchesSearchTerms(title: string, searchTerms: string[]) {
	const titleTokens = new Set(tokens(title));
	return searchTerms.some((term) => {
		const termTokens = tokens(term);
		return (
			termTokens.length > 0 &&
			termTokens.every((token) => titleTokens.has(token))
		);
	});
}

function classifyCondition(value: unknown) {
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

function comparableCondition(
	condition: NormalizedCondition,
	requested: Condition,
	secondHand: boolean,
) {
	if (requested === "Baru")
		return condition === "NEW" || condition === "UNKNOWN";
	if (requested === "Seperti baru") return condition === "LIKE_NEW";
	if (requested === "Baik") return condition === "GOOD";
	if (requested === "Cukup") return condition === "FAIR";
	if (requested === "Rusak") return condition === "DAMAGED";
	return secondHand && condition !== "NEW";
}

function isRejectedTitle(title: string) {
	const normalized = normalizeText(title);
	return [
		/\b(accessory|accessories|case|casing|cover|charger|kabel|cable|adapter|headset|earphone|strap|mouse|keyboard|tas|bag|tempered|screen protector|pelindung)\b/,
		/\b(lcd|display|baterai|battery|sparepart|suku cadang|service|servis|repair|perbaikan|for parts)\b/,
		/\b(bundle|paket|borongan|sepasang|\d+\s*(unit|pcs))\b/,
	].some((pattern) => pattern.test(normalized));
}

function isSafeIntegerPrice(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function statusRejection(record: Record<string, unknown>) {
	const status = boundedText(record.listingStatus ?? record.status, 40);
	if (!status) return undefined;
	const normalized = normalizeText(status);
	if (["active", "live", "available"].includes(normalized)) return undefined;
	if (["sold", "hidden", "pending", "draft"].includes(normalized))
		return "listing_not_live";
	return "invalid_listing_status";
}

function approvedUrl(value: unknown) {
	if (typeof value !== "string") return undefined;
	try {
		const url = new URL(value);
		if (
			url.protocol !== "https:" ||
			(url.hostname !== "tokopedia.com" &&
				!url.hostname.endsWith(".tokopedia.com"))
		)
			return undefined;
		return url.toString();
	} catch {
		return undefined;
	}
}

function isoDate(value: unknown) {
	if (typeof value !== "string" && typeof value !== "number") return undefined;
	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function allowedAttributes(record: Record<string, unknown>) {
	const attributes: Record<string, string> = {};
	const allowedKeys = [
		"brand",
		"model",
		"storage",
		"ram",
		"cpu",
		"gpu",
		"edition",
		"connectivity",
	];
	for (const key of allowedKeys) {
		const value = boundedText(record[key], 80);
		if (value) attributes[key] = value;
	}
	return attributes;
}

function cacheKey(input: z.infer<typeof inputSchema>) {
	return JSON.stringify({
		searchTerms: input.searchTerms.map(normalizeText).sort(),
		condition: input.condition,
		region: "Indonesia",
	});
}

function getClient() {
	const token = process.env.APIFY_API_TOKEN?.trim();
	if (!token) throw new ProviderBoundaryError("CONFIGURATION");
	return new ApifyClient({
		token,
		maxRetries: 1,
		minDelayBetweenRetriesMillis: 500,
		timeoutSecs: 360,
	});
}

function errorCategory(error: unknown): Failure["error_category"] {
	if (error instanceof ProviderBoundaryError) return error.category;
	if (error instanceof ApifyApiError) return "APIFY_ERROR";
	if (error instanceof Error) {
		const value = `${error.name} ${error.message}`.toLowerCase();
		if (/timeout|timed out|abort|etimedout|econnaborted/.test(value))
			return "TIMEOUT";
		if (/network|fetch|enotfound|econnreset|socket/.test(value))
			return "NETWORK";
	}
	return "UNKNOWN";
}

function normalizeRecord(
	value: unknown,
	input: z.infer<typeof inputSchema>,
	seenIds: Set<string>,
): { evidence?: Evidence; rejected?: Rejected } {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return { rejected: { reason: "malformed_record" } };
	const record = value as Record<string, unknown>;
	const listingId = boundedText(record.productId, 160);
	const reject = (reason: string): { rejected: Rejected } => ({
		rejected: { ...(listingId ? { listing_id: listingId } : {}), reason },
	});
	if (!listingId) return reject("missing_listing_id");
	if (seenIds.has(listingId)) return reject("duplicate_listing");
	seenIds.add(listingId);

	const title = boundedText(record.name, 400);
	if (!title) return reject("missing_title");
	if (!matchesSearchTerms(title, input.searchTerms))
		return reject("identity_mismatch");
	if (isRejectedTitle(title)) return reject("non_comparable_listing");

	const url = approvedUrl(record.url);
	if (!url) return reject("invalid_listing_url");
	if (!isSafeIntegerPrice(record.price)) return reject("invalid_price");
	const status = statusRejection(record);
	if (status) return reject(status);

	const detected = classifyCondition(record.condition);
	if (
		!comparableCondition(
			detected.condition,
			input.condition,
			detected.explicitSecondHand,
		)
	) {
		return reject("condition_not_comparable");
	}
	const scrapedAt = isoDate(record.scrapedAt) ?? new Date().toISOString();
	const postedAt = isoDate(record.postedAt ?? record.createdAt);
	const city = boundedText(record.shopCity, 120);

	return {
		evidence: {
			source: "TOKOPEDIA",
			listing_id: listingId,
			listing_url: url,
			title,
			price_idr: record.price,
			condition: detected.condition,
			...(city ? { city } : {}),
			product_attributes: allowedAttributes(record),
			listing_status: "ACTIVE",
			...(postedAt ? { posted_at: postedAt } : {}),
			scraped_at: scrapedAt,
		},
	};
}

async function fetch(input: z.infer<typeof inputSchema>): Promise<Success> {
	const client = getClient();
	const run = await client
		.actor(ACTOR_ID)
		.call(buildTokopediaActorInput(input));
	if (!run || typeof run.defaultDatasetId !== "string" || !run.defaultDatasetId)
		throw new ProviderBoundaryError("MISSING_DATASET");

	const dataset = await client
		.dataset<Record<string, unknown>>(run.defaultDatasetId)
		.listItems({ limit: MAX_ITEMS });
	if (!dataset || !Array.isArray(dataset.items))
		throw new ProviderBoundaryError("MALFORMED_RESPONSE");

	const evidence: Evidence[] = [];
	const rejected: Rejected[] = [];
	const seenIds = new Set<string>();
	for (const item of dataset.items.slice(0, MAX_ITEMS)) {
		const normalized = normalizeRecord(item, input, seenIds);
		if (normalized.evidence) evidence.push(normalized.evidence);
		if (normalized.rejected) rejected.push(normalized.rejected);
	}
	return {
		status: "SUCCESS",
		provider: "TOKOPEDIA",
		source: "TOKOPEDIA",
		search_terms: input.searchTerms,
		condition: input.condition,
		region: "Indonesia",
		fetched_at: new Date().toISOString(),
		cache_hit: false,
		evidence,
		rejected,
	};
}

export function buildTokopediaActorInput(input: z.infer<typeof inputSchema>) {
	return {
		mode: "search",
		searchTerms: input.searchTerms.slice(0, 5),
		fetchDetails: false,
		discountOnly: false,
		freeShippingOnly: false,
		maxPages: 5,
		maxItems: MAX_ITEMS,
		sortBy: "relevance",
		condition: "any",
		shopTier: "any",
		urls: [],
		proxy: { useApifyProxy: true },
	};
}

async function executeSearch(
	input: z.infer<typeof inputSchema>,
): Promise<ToolOutput> {
	const key = cacheKey(input);
	const cached = cache.get(key);
	if (cached && cached.expiresAt > Date.now())
		return { ...cached.value, cache_hit: true };
	if (cached) cache.delete(key);

	let lastCategory: Failure["error_category"] = "UNKNOWN";
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const result = await fetch(input);
			cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
			return result;
		} catch (error) {
			lastCategory = errorCategory(error);
			if (lastCategory === "CONFIGURATION" || attempt === 1) break;
		}
	}
	console.error(
		JSON.stringify({ provider: "TOKOPEDIA", error_category: lastCategory }),
	);
	return {
		status: "PROVIDER_FAILURE",
		provider: "TOKOPEDIA",
		source: "TOKOPEDIA",
		error_category: lastCategory,
		retried: lastCategory !== "CONFIGURATION",
	};
}

export const tokopediaSearch = createTool({
	name: "tokopediaSearch",
	description:
		"Cari listing produk di Tokopedia untuk bukti harga. Gunakan hanya setelah identitas, kondisi, dan istilah pencarian produk sudah jelas. Actor, batas hasil, proxy, dan konfigurasi provider dikunci oleh aplikasi.",
	inputSchema,
	execute: executeSearch,
});
