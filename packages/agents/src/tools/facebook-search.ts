import { createTool } from "@anvia/core";
import { ApifyApiError, ApifyClient } from "apify-client";
import { z } from "zod";

const ACTOR_ID = "curious_coder/facebook-marketplace";
const MAX_ITEMS = 10;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const INDONESIAN_PROVINCES = new Set([
	"aceh",
	"sumatera utara",
	"sumatera barat",
	"riau",
	"jambi",
	"sumatera selatan",
	"bengkulu",
	"lampung",
	"kepulauan bangka belitung",
	"kepulauan riau",
	"dki jakarta",
	"jakarta",
	"jawa barat",
	"jawa tengah",
	"daerah istimewa yogyakarta",
	"yogyakarta",
	"jawa timur",
	"banten",
	"bali",
	"nusa tenggara barat",
	"nusa tenggara timur",
	"kalimantan barat",
	"kalimantan tengah",
	"kalimantan selatan",
	"kalimantan timur",
	"kalimantan utara",
	"sulawesi utara",
	"sulawesi tengah",
	"sulawesi selatan",
	"sulawesi tenggara",
	"gorontalo",
	"sulawesi barat",
	"maluku",
	"maluku utara",
	"papua",
	"papua barat",
	"papua selatan",
	"papua tengah",
	"papua pegunungan",
	"papua barat daya",
]);

const INDONESIAN_PROVINCE_CODES = new Set([
	"AC",
	"SU",
	"SB",
	"RI",
	"JA",
	"SS",
	"BE",
	"LA",
	"BB",
	"KR",
	"JK",
	"JB",
	"JT",
	"YO",
	"JI",
	"BT",
	"BA",
	"NB",
	"NT",
	"KB",
	"KT",
	"KS",
	"KI",
	"KU",
	"SA",
	"ST",
	"SN",
	"SG",
	"GO",
	"SR",
	"MA",
	"MU",
	"PA",
	"PB",
	"PS",
	"PT",
	"PP",
	"PD",
]);

const conditionSchema = z.enum([
	"Baru",
	"Seperti baru",
	"Baik",
	"Cukup",
	"Rusak",
	"Tidak diketahui",
]);

const evidenceRoleSchema = z.literal("CONDITION_COMPARABLE");

const inputSchema = z.object({
	searchTerms: z.array(z.string().trim().min(1).max(160)).min(1).max(5),
	condition: conditionSchema,
	evidenceRole: evidenceRoleSchema.default("CONDITION_COMPARABLE"),
	region: z.literal("Indonesia").default("Indonesia"),
});

type Condition = z.infer<typeof conditionSchema>;
type EvidenceRole = z.infer<typeof evidenceRoleSchema>;
type NormalizedCondition =
	| "NEW"
	| "LIKE_NEW"
	| "GOOD"
	| "FAIR"
	| "DAMAGED"
	| "UNKNOWN";

type Evidence = {
	source: "FACEBOOK_MARKETPLACE";
	listing_id: string;
	listing_url: string;
	title: string;
	price_idr: number;
	condition: NormalizedCondition;
	evidence_role: EvidenceRole;
	city?: string;
	seller_type?: string;
	product_attributes: Record<string, string>;
	listing_status: "LIVE";
	posted_at?: string;
	scraped_at: string;
};

type Rejected = {
	listing_id?: string;
	reason: string;
};

type Success = {
	status: "SUCCESS";
	provider: "FACEBOOK_MARKETPLACE";
	source: "FACEBOOK_MARKETPLACE";
	search_terms: string[];
	condition: Condition;
	evidence_role: EvidenceRole;
	region: "Indonesia";
	fetched_at: string;
	cache_hit: boolean;
	evidence: Evidence[];
	rejected: Rejected[];
};

type Failure = {
	status: "PROVIDER_FAILURE";
	provider: "FACEBOOK_MARKETPLACE";
	source: "FACEBOOK_MARKETPLACE";
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
type CacheEntry = { expiresAt: number; value: Success };
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

function conditionFromAttributes(value: unknown): {
	condition: NormalizedCondition;
	explicitSecondHand: boolean;
} {
	const values: string[] = [];
	const visit = (item: unknown, depth: number) => {
		if (depth > 3 || values.length >= 20) return;
		if (typeof item === "string") {
			values.push(item.slice(0, 160));
			return;
		}
		if (Array.isArray(item)) {
			for (const child of item) visit(child, depth + 1);
			return;
		}
		if (typeof item !== "object" || item === null) return;
		for (const [key, child] of Object.entries(item)) {
			if (/condition|kondisi|item_condition/i.test(key))
				visit(child, depth + 1);
		}
	};
	visit(value, 0);
	for (const item of values) {
		const detected = classifyCondition(item);
		if (detected.condition !== "UNKNOWN" || detected.explicitSecondHand)
			return detected;
	}
	return { condition: "UNKNOWN", explicitSecondHand: false };
}

function comparableCondition(
	condition: NormalizedCondition,
	requested: Condition,
	secondHand: boolean,
) {
	if (requested === "Baru") return condition === "NEW";
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

function approvedUrl(value: unknown) {
	if (typeof value !== "string") return undefined;
	try {
		const url = new URL(value);
		const allowedHost = [
			"facebook.com",
			"www.facebook.com",
			"m.facebook.com",
		].includes(url.hostname);
		if (
			url.protocol !== "https:" ||
			!allowedHost ||
			!/^\/marketplace\/item\/[^/]+\/?$/i.test(url.pathname)
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

function cityFrom(value: unknown) {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return undefined;
	return boundedText((value as Record<string, unknown>).text, 120);
}

function recordLocationText(record: Record<string, unknown>) {
	const location =
		typeof record.location === "object" &&
		record.location !== null &&
		!Array.isArray(record.location)
			? (record.location as Record<string, unknown>)
			: undefined;
	const reverse =
		location &&
		typeof location.reverse_geocode === "object" &&
		location.reverse_geocode !== null &&
		!Array.isArray(location.reverse_geocode)
			? (location.reverse_geocode as Record<string, unknown>)
			: undefined;
	const cityPage =
		reverse &&
		typeof reverse.city_page === "object" &&
		reverse.city_page !== null &&
		!Array.isArray(reverse.city_page)
			? (reverse.city_page as Record<string, unknown>)
			: undefined;
	const locationText = cityFrom(record.location_text);
	const values = [
		record.country,
		record.country_name,
		record.country_code,
		location?.country,
		location?.country_name,
		location?.country_code,
		reverse?.country,
		reverse?.country_name,
		reverse?.country_code,
		reverse?.state,
		reverse?.city,
		cityPage?.display_name,
		locationText,
	]
		.map((value) => boundedText(value, 160))
		.filter((value): value is string => Boolean(value));
	return {
		city:
			boundedText(reverse?.city, 120) ??
			locationText ??
			boundedText(cityPage?.display_name, 120),
		values,
	};
}

export function isIndonesianLocation(value: unknown) {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const location = recordLocationText(value as Record<string, unknown>);
	const normalizedValues = location.values.map(normalizeText);
	if (
		normalizedValues.some(
			(item) =>
				item === "id" || item === "indonesia" || item.includes("indonesia"),
		)
	)
		return true;
	return normalizedValues.some(
		(item) =>
			INDONESIAN_PROVINCES.has(item) ||
			INDONESIAN_PROVINCE_CODES.has(item.toUpperCase()),
	);
}

function statusFrom(record: Record<string, unknown>) {
	if (record.is_hidden === true) return "HIDDEN" as const;
	if (record.is_draft === true) return "DRAFT" as const;
	if (record.is_pending === true) return "PENDING" as const;
	if (record.is_sold === true) return "SOLD" as const;
	if (record.is_live === true) return "LIVE" as const;
	const status = boundedText(record.listing_status, 40)?.toUpperCase();
	if (status === "LIVE" || status === "ACTIVE" || status === "AVAILABLE")
		return "LIVE" as const;
	if (
		status === "SOLD" ||
		status === "HIDDEN" ||
		status === "PENDING" ||
		status === "DRAFT"
	)
		return status;
	return undefined;
}

function parseIdrAmount(value: unknown) {
	if (typeof value === "number")
		return Number.isSafeInteger(value) && value > 0 ? value : undefined;
	if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))
		return undefined;
	const amount = Number(value);
	return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

function cacheKey(input: z.infer<typeof inputSchema>) {
	return JSON.stringify({
		searchTerms: input.searchTerms.map(normalizeText).sort(),
		condition: input.condition,
		evidenceRole: input.evidenceRole,
		region: "Indonesia",
	});
}

function getClient() {
	const token = process.env.APIFY_API_TOKEN?.trim();
	if (!token) throw new ProviderBoundaryError("CONFIGURATION");
	const client = new ApifyClient({
		token,
		maxRetries: 1,
		minDelayBetweenRetriesMillis: 500,
		timeoutSecs: 360,
	});
	client.logger.setLevel(client.logger.LEVELS.OFF);
	return client;
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
	const listingId = boundedText(record.id, 160);
	const reject = (reason: string): { rejected: Rejected } => ({
		rejected: { ...(listingId ? { listing_id: listingId } : {}), reason },
	});
	if (!listingId) return reject("missing_listing_id");
	if (seenIds.has(listingId)) return reject("duplicate_listing");
	seenIds.add(listingId);

	const title = boundedText(record.marketplace_listing_title, 400);
	if (!title) return reject("missing_title");
	if (!matchesSearchTerms(title, input.searchTerms))
		return reject("identity_mismatch");
	if (isRejectedTitle(title)) return reject("non_comparable_listing");

	const url = approvedUrl(record.listingUrl);
	if (!url) return reject("invalid_listing_url");
	if (!isIndonesianLocation(record)) return reject("location_not_indonesia");
	const price = record.listing_price;
	if (typeof price !== "object" || price === null || Array.isArray(price))
		return reject("invalid_price");
	const priceRecord = price as Record<string, unknown>;
	const currency = boundedText(
		priceRecord.currency ?? record.currency,
		8,
	)?.toUpperCase();
	if (currency !== "IDR") return reject("non_idr_price");
	if (
		record.min_listing_price != null ||
		record.max_listing_price != null ||
		priceRecord.min_listing_price != null ||
		priceRecord.max_listing_price != null
	)
		return reject("variant_range_price");
	const priceIdr = parseIdrAmount(priceRecord.amount);
	if (priceIdr === undefined) return reject("invalid_price");

	const status = statusFrom(record);
	if (status !== "LIVE")
		return reject(status ? "listing_not_live" : "invalid_listing_status");
	const detected = conditionFromAttributes(record.attribute_data);
	if (
		!comparableCondition(
			detected.condition,
			input.condition,
			detected.explicitSecondHand,
		)
	)
		return reject("condition_not_comparable");

	const city = recordLocationText(record).city;
	const postedAt = isoDate(record.creation_time);
	return {
		evidence: {
			source: "FACEBOOK_MARKETPLACE",
			listing_id: listingId,
			listing_url: url,
			title,
			price_idr: priceIdr,
			condition: detected.condition,
			evidence_role: input.evidenceRole,
			...(city ? { city } : {}),
			product_attributes: {},
			listing_status: "LIVE",
			...(postedAt ? { posted_at: postedAt } : {}),
			scraped_at: new Date().toISOString(),
		},
	};
}

async function fetch(input: z.infer<typeof inputSchema>): Promise<Success> {
	const client = getClient();
	const run = await client
		.actor(ACTOR_ID)
		.call(buildFacebookActorInput(input), buildFacebookActorRunOptions());
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
		provider: "FACEBOOK_MARKETPLACE",
		source: "FACEBOOK_MARKETPLACE",
		search_terms: input.searchTerms,
		condition: input.condition,
		evidence_role: input.evidenceRole,
		region: "Indonesia",
		fetched_at: new Date().toISOString(),
		cache_hit: false,
		evidence,
		rejected,
	};
}

export function buildFacebookActorInput(input: z.infer<typeof inputSchema>) {
	return {
		getAllListingPhotos: false,
		getListingDetails: true,
		location: "Indonesia",
		maxPagesPerUrl: 1,
		onlyNewListings: false,
		proxy: { useApifyProxy: false },
		searchKeyword: input.searchTerms[0],
		strictFiltering: false,
		sortBy: "",
		daysSinceListed: "",
		availability: "",
		deliveryMethod: "",
	};
}

export function buildFacebookActorRunOptions() {
	return { maxItems: MAX_ITEMS, log: null };
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
		JSON.stringify({
			provider: "FACEBOOK_MARKETPLACE",
			error_category: lastCategory,
		}),
	);
	return {
		status: "PROVIDER_FAILURE",
		provider: "FACEBOOK_MARKETPLACE",
		source: "FACEBOOK_MARKETPLACE",
		error_category: lastCategory,
		retried: lastCategory !== "CONFIGURATION",
	};
}

export const facebookMarketplaceSearch = createTool({
	name: "facebookMarketplaceSearch",
	description:
		"Cari listing barang bekas yang sebanding di Facebook Marketplace. Hanya mendukung evidenceRole CONDITION_COMPARABLE; untuk kondisi Rusak, letakkan cue kerusakan di searchTerms pertama. URL pencarian, actor, batas hasil, dan konfigurasi provider dikunci oleh aplikasi.",
	inputSchema,
	execute: executeSearch,
});
