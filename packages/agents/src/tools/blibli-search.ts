import { createTool } from "@anvia/core";
import { ApifyApiError, ApifyClient } from "apify-client";
import { z } from "zod";

const ACTOR_ID = "fanndev/blibli-product-price-monitor";
const MAX_ITEMS_PER_QUERY = 10;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const conditionSchema = z.enum([
	"Baru",
	"Seperti baru",
	"Baik",
	"Cukup",
	"Rusak",
	"Tidak diketahui",
]);

const evidenceRoleSchema = z.enum([
	"CONDITION_COMPARABLE",
	"RETAIL_ANCHOR",
]);

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
	source: "BLIBLI";
	listing_id: string;
	listing_url: string;
	title: string;
	price_idr: number;
	condition: NormalizedCondition;
	evidence_role: EvidenceRole;
	city?: string;
	product_attributes: Record<string, string>;
	listing_status: "AVAILABLE";
	merchant_name?: string;
	posted_at?: string;
	scraped_at: string;
};

type Rejected = {
	source: "BLIBLI";
	listing_id?: string;
	listing_url?: string;
	title?: string;
	price_idr?: number;
	condition: NormalizedCondition;
	evidence_role: EvidenceRole;
	city?: string;
	product_attributes: Record<string, string>;
	listing_status?: string;
	merchant_name?: string;
	posted_at?: string;
	scraped_at: string;
	reason: string;
};

type Success = {
	status: "SUCCESS";
	provider: "BLIBLI";
	source: "BLIBLI";
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
	provider: "BLIBLI";
	source: "BLIBLI";
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
		.replace(/\bps\s*([345])\b/gu, "playstation $1")
		.trim();
}

function tokens(value: string) {
	return normalizeText(value)
		.split(/\s+/)
		.filter((token) => token.length > 1 || /^\d+$/.test(token));
}

const searchQualifierTokens = new Set([
	"baru",
	"diskon",
	"flagship",
	"free",
	"garansi",
	"indonesia",
	"official",
	"ongkir",
	"ori",
	"original",
	"promo",
	"ready",
	"resmi",
	"segel",
	"stok",
	"stock",
	"store",
	"terbaru",
]);

function matchesSearchTerms(title: string, searchTerms: string[]) {
	const titleTokens = new Set(tokens(title));
	return searchTerms.some((term) => {
		const termTokens = [
			...new Set(
				tokens(term).filter((token) => !searchQualifierTokens.has(token)),
			),
		];
		if (termTokens.length === 0) return false;

		// Numeric model and specification tokens remain exact (for example, PS5,
		// 256 GB, or 1 TB). Other title tokens use a majority match so retailer
		// qualifiers such as "garansi resmi" do not reject relevant products.
		if (
			termTokens.some(
				(token) => /^\d+$/.test(token) && !titleTokens.has(token),
			)
		)
			return false;
		const matched = termTokens.filter((token) => titleTokens.has(token)).length;
		const required =
			termTokens.length <= 2
				? termTokens.length
				: Math.max(2, Math.ceil(termTokens.length * 0.6));
		return matched >= required;
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
	evidenceRole: EvidenceRole,
) {
	// Blibli's result does not expose item condition. Available retail results are
	// usable for a Baru request, or as a separately labeled retail anchor. They
	// cannot establish a second-hand condition for any other valuation condition.
	if (evidenceRole === "RETAIL_ANCHOR") return !secondHand;
	return requested === "Baru" && !secondHand && condition === "NEW";
}

function isRejectedTitle(title: string) {
	const normalized = normalizeText(title);
	return [
		/\b(accessory|accessories|case|casing|cover|charger|kabel|cable|adapter|headset|earphone|strap|mouse|keyboard|tas|bag|tempered|screen protector|pelindung|stand|holder|dock|base|dudukan|plug|dust proof|anti debu)\b/,
		/\b(lcd|display|baterai|battery|sparepart|suku cadang|service|servis|repair|perbaikan|for parts|kardus|dus)\b/,
		/\b(borongan|\d+\s*(unit|pcs))\b/,
	].some((pattern) => pattern.test(normalized));
}

function isSafeIntegerPrice(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function approvedUrl(value: unknown) {
	if (typeof value !== "string") return undefined;
	try {
		const url = new URL(value);
		if (
			url.protocol !== "https:" ||
			(url.hostname !== "blibli.com" &&
				!url.hostname.endsWith(".blibli.com"))
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
	const allowedKeys = ["brand"];
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
		evidenceRole: input.evidenceRole,
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
		return {
			rejected: {
				source: "BLIBLI",
				condition: "UNKNOWN",
				evidence_role: input.evidenceRole,
				product_attributes: {},
				scraped_at: new Date().toISOString(),
				reason: "malformed_record",
			},
		};
	const record = value as Record<string, unknown>;
	const url = approvedUrl(record.url);
	const listingId = url
		? boundedText(new URL(url).pathname.split("/").filter(Boolean).pop(), 160)
		: undefined;
	const title = boundedText(record.name, 400);
	const stockStatus = boundedText(record.stockStatus, 40)?.toUpperCase();
	const titleCondition = classifyCondition(title);
	const detected =
		input.evidenceRole === "RETAIL_ANCHOR"
			? { condition: "UNKNOWN" as const, explicitSecondHand: titleCondition.explicitSecondHand }
			: input.condition === "Baru" && !titleCondition.explicitSecondHand
				? { condition: "NEW" as const, explicitSecondHand: false }
				: titleCondition;
	const scrapedAt = isoDate(record.scrapedAt) ?? new Date().toISOString();
	const postedAt = isoDate(record.postedAt ?? record.createdAt);
	const merchantName = boundedText(record.merchantName, 160);
	const rejectionSnapshot: Omit<Rejected, "reason"> = {
		source: "BLIBLI",
		...(listingId ? { listing_id: listingId } : {}),
		...(url ? { listing_url: url } : {}),
		...(title ? { title } : {}),
		...(isSafeIntegerPrice(record.salePrice)
			? { price_idr: record.salePrice }
			: {}),
		condition: detected.condition,
		evidence_role: input.evidenceRole,
		...(merchantName ? { merchant_name: merchantName } : {}),
		product_attributes: allowedAttributes(record),
		...(stockStatus ? { listing_status: stockStatus } : {}),
		...(postedAt ? { posted_at: postedAt } : {}),
		scraped_at: scrapedAt,
	};
	const reject = (reason: string): { rejected: Rejected } => ({
		rejected: { ...rejectionSnapshot, reason },
	});
	if (!url) return reject("invalid_listing_url");
	if (!listingId) return reject("missing_listing_id");
	if (seenIds.has(listingId)) return {};

	if (!title) return reject("missing_title");
	if (!matchesSearchTerms(title, input.searchTerms))
		return reject("identity_mismatch");
	if (isRejectedTitle(title)) return reject("non_comparable_listing");

	if (!isSafeIntegerPrice(record.salePrice)) return reject("invalid_price");
	if (stockStatus !== "AVAILABLE") return reject("listing_not_available");

	// Blibli does not expose a condition field. A title that explicitly says used/damaged
	// must not be accepted as a new comparable listing; otherwise an available result is
	// treated as new only in the context of a Baru request, or as UNKNOWN retail context.
	if (
		!comparableCondition(
			detected.condition,
			input.condition,
			detected.explicitSecondHand,
			input.evidenceRole,
		)
	) {
		return reject("condition_not_comparable");
	}
	seenIds.add(listingId);
	return {
		evidence: {
			source: "BLIBLI",
			listing_id: listingId,
			listing_url: url,
			title,
			price_idr: record.salePrice,
			condition: detected.condition,
			evidence_role: input.evidenceRole,
			...(merchantName ? { merchant_name: merchantName } : {}),
			product_attributes: allowedAttributes(record),
			listing_status: "AVAILABLE",
			...(postedAt ? { posted_at: postedAt } : {}),
			scraped_at: scrapedAt,
		},
	};
}

async function fetch(input: z.infer<typeof inputSchema>): Promise<Success> {
	const client = getClient();
	const run = await client
		.actor(ACTOR_ID)
		.call(buildBlibliActorInput(input));
	if (!run || typeof run.defaultDatasetId !== "string" || !run.defaultDatasetId)
		throw new ProviderBoundaryError("MISSING_DATASET");

	const dataset = await client
		.dataset<Record<string, unknown>>(run.defaultDatasetId)
		.listItems({ limit: input.searchTerms.length * MAX_ITEMS_PER_QUERY });
	if (!dataset || !Array.isArray(dataset.items))
		throw new ProviderBoundaryError("MALFORMED_RESPONSE");

	const evidence: Evidence[] = [];
	const rejected: Rejected[] = [];
	const seenIds = new Set<string>();
	for (const item of dataset.items.slice(0, input.searchTerms.length * MAX_ITEMS_PER_QUERY)) {
		const normalized = normalizeRecord(item, input, seenIds);
		if (normalized.evidence) evidence.push(normalized.evidence);
		if (normalized.rejected) rejected.push(normalized.rejected);
	}
	return {
		status: "SUCCESS",
		provider: "BLIBLI",
		source: "BLIBLI",
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

export function buildBlibliActorInput(input: z.infer<typeof inputSchema>) {
	return {
		searchTerms: input.searchTerms.slice(0, 5),
		fetchProductDetails: false,
		includeOutOfStock: true,
		maxItemsPerQuery: MAX_ITEMS_PER_QUERY,
		sortBy: "relevance",
		maxConcurrency: 8,
		proxyConfiguration: {
			useApifyProxy: true,
			apifyProxyGroups: ["RESIDENTIAL"],
			apifyProxyCountry: "ID",
		},
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
		JSON.stringify({ provider: "BLIBLI", error_category: lastCategory }),
	);
	return {
		status: "PROVIDER_FAILURE",
		provider: "BLIBLI",
		source: "BLIBLI",
		error_category: lastCategory,
		retried: lastCategory !== "CONFIGURATION",
	};
}

export const blibliSearch = createTool({
	name: "blibliSearch",
	description:
		"Cari listing produk di Blibli. Gunakan evidenceRole CONDITION_COMPARABLE untuk produk Baru, atau RETAIL_ANCHOR untuk referensi harga retail yang harus dilaporkan terpisah. Actor, batas hasil, proxy, dan konfigurasi provider dikunci oleh aplikasi.",
	inputSchema,
	execute: executeSearch,
});
