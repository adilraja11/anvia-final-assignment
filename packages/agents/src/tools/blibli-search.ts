import { createTool } from "@anvia/core";
import { ApifyApiError, ApifyClient } from "apify-client";
import { z } from "zod";
import {
	approvedMarketplaceUrl,
	boundedText,
	CACHE_TTL_MS,
	cacheKey,
	isoDate,
	isRejectedTitle,
	MAX_ITEMS_PER_QUERY,
	MAX_PROVIDER_RESULTS,
	MAX_QUERY_VARIANTS,
	type MarketplaceToolResult,
	ProviderBoundaryError,
	type ProviderErrorCategory,
	providerErrorCategory,
	tokens,
} from "../marketplace.js";

const ACTOR_ID = "fanndev/blibli-product-price-monitor";
const MAX_ACTOR_SECONDS_PER_ATTEMPT = 40;

const inputSchema = z
	.object({
		searchTerms: z
			.array(z.string().trim().min(1).max(160))
			.min(1)
			.max(MAX_QUERY_VARIANTS),
		location: z.string().trim().min(1).max(120).optional(),
	})
	.strict();

type Input = z.infer<typeof inputSchema>;
type Success = Extract<MarketplaceToolResult, { status: "SUCCESS" }>;

export type MarketplaceSearchObserver = (result: MarketplaceToolResult) => void;
export type MarketplaceSearchCache = Map<
	string,
	{ expiresAt: number; value: Success }
>;

/** Server-validated identity supplied when constructing the fixed marketplace tool. */
export type ConfirmedMarketplaceIdentity = Record<
	string,
	string | boolean | readonly string[] | undefined
>;

export type BlibliSearchContext = {
	identity?: ConfirmedMarketplaceIdentity;
	location?: string;
};

const defaultCache: MarketplaceSearchCache = new Map();

const searchQualifierTokens = new Set([
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
		if (
			termTokens.some((token) => /^\d+$/.test(token) && !titleTokens.has(token))
		)
			return false;
		return termTokens.every((token) => titleTokens.has(token));
	});
}

function identityText(identity: ConfirmedMarketplaceIdentity) {
	return Object.entries(identity)
		.filter(([key, value]) => key !== "category" && value !== undefined)
		.flatMap(([, value]) => {
			if (typeof value === "string") return [value];
			return Array.isArray(value) ? value : [];
		});
}

function matchesConfirmedIdentity(
	title: string,
	record: Record<string, unknown>,
	identity?: ConfirmedMarketplaceIdentity,
) {
	if (!identity) return true;
	const attributes = Object.values(allowedAttributes(record));
	const evidenceTokens = new Set(tokens([title, ...attributes].join(" ")));
	const textMatches = identityText(identity).every((value) => {
		const expectedTokens = tokens(value);
		return (
			expectedTokens.length > 0 &&
			expectedTokens.every((token) => evidenceTokens.has(token))
		);
	});
	const booleanMatches = Object.entries(identity).every(
		([key, value]) => typeof value !== "boolean" || record[key] === value,
	);
	return textMatches && booleanMatches;
}

function allowedAttributes(record: Record<string, unknown>) {
	const attributes: Record<string, string> = {};
	for (const key of [
		"brand",
		"model",
		"storage",
		"capacity",
		"variant",
		"connectivity",
		"formFactor",
		"cpu",
		"ram",
		"gpu",
		"display",
		"displayOrPeripherals",
		"edition",
		"bundleContents",
		"lensIncluded",
		"lens",
	]) {
		const rawValue = record[key];
		const value = Array.isArray(rawValue)
			? boundedText(
					rawValue.filter((item) => typeof item === "string").join(", "),
					160,
				)
			: typeof rawValue === "boolean"
				? String(rawValue)
				: boundedText(rawValue, 160);
		if (value) attributes[key] = value;
	}
	return attributes;
}

function parseIdrPrice(record: Record<string, unknown>) {
	if (record.minPrice != null || record.maxPrice != null) return undefined;
	const currency = boundedText(
		record.currency ?? record.currencyCode,
		8,
	)?.toUpperCase();
	if (currency !== "IDR") return undefined;
	const price = record.salePrice ?? record.price;
	return typeof price === "number" && Number.isSafeInteger(price) && price > 0
		? price
		: undefined;
}

export function normalizeBlibliRecord(
	value: unknown,
	input: Input,
	seenIds: Set<string>,
	identity?: ConfirmedMarketplaceIdentity,
) {
	const source = "BLIBLI" as const;
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return {
			rejected: { source, exclusion_reason: "MALFORMED_RECORD" },
		};
	const record = value as Record<string, unknown>;
	const url = approvedMarketplaceUrl(record.url ?? record.productUrl);
	const listingId =
		boundedText(record.id ?? record.productId ?? record.sku, 160) ??
		(url
			? boundedText(new URL(url).pathname.split("/").filter(Boolean).pop(), 160)
			: undefined);
	const reject = (exclusion_reason: string) => ({
		rejected: {
			source,
			...(listingId ? { listing_id: listingId } : {}),
			exclusion_reason,
		},
	});
	if (!url) return reject("INVALID_LISTING_URL");
	if (!listingId) return reject("MISSING_LISTING_ID");
	if (seenIds.has(listingId)) return reject("DUPLICATE_LISTING");
	const title = boundedText(record.name ?? record.title, 400);
	if (!title) return reject("MISSING_TITLE");
	if (!matchesSearchTerms(title, input.searchTerms))
		return reject("IDENTITY_MISMATCH");
	if (!matchesConfirmedIdentity(title, record, identity))
		return reject("IDENTITY_MISMATCH");
	if (isRejectedTitle(title)) return reject("NON_COMPARABLE_LISTING");
	const stockStatus = boundedText(
		record.stockStatus ?? record.status,
		40,
	)?.toUpperCase();
	if (!stockStatus || !["AVAILABLE", "LIVE", "ACTIVE"].includes(stockStatus))
		return reject("LISTING_NOT_AVAILABLE");
	const priceIdr = parseIdrPrice(record);
	if (priceIdr === undefined) return reject("INVALID_PRICE");
	seenIds.add(listingId);
	const scrapedAt = isoDate(record.scrapedAt) ?? new Date().toISOString();
	const postedAt = isoDate(record.postedAt ?? record.createdAt);
	const city = boundedText(record.city ?? record.location, 120);
	const condition = boundedText(record.condition ?? record.itemCondition, 80);
	return {
		evidence: {
			source,
			listing_id: listingId,
			listing_url: url,
			title,
			price_idr: priceIdr,
			...(condition ? { condition } : {}),
			...(city ? { city } : {}),
			product_attributes: allowedAttributes(record),
			listing_status:
				stockStatus === "AVAILABLE"
					? ("AVAILABLE" as const)
					: ("LIVE" as const),
			...(postedAt ? { posted_at: postedAt } : {}),
			scraped_at: scrapedAt,
			match_score: 1,
		},
	};
}

async function fetch(
	input: Input,
	context?: BlibliSearchContext,
): Promise<Success> {
	const client = getClient();
	const run = await client
		.actor(ACTOR_ID)
		.call(
			buildBlibliActorInput(input),
			buildBlibliActorRunOptions(MAX_ACTOR_SECONDS_PER_ATTEMPT),
		);
	if (!run || typeof run.defaultDatasetId !== "string" || !run.defaultDatasetId)
		throw new ProviderBoundaryError("MISSING_DATASET");
	if (run.status !== "SUCCEEDED") {
		throw new ProviderBoundaryError(
			run.status === "TIMED-OUT" ? "TIMEOUT" : "APIFY_ERROR",
		);
	}
	const dataset = await client
		.dataset<Record<string, unknown>>(run.defaultDatasetId)
		.listItems({ limit: MAX_PROVIDER_RESULTS });
	if (!dataset || !Array.isArray(dataset.items))
		throw new ProviderBoundaryError("MALFORMED_RESPONSE");

	const evidence: Success["evidence"] = [];
	const rejected: Success["rejected"] = [];
	const seenIds = new Set<string>();
	const location = context?.location ?? input.location;
	for (const item of dataset.items.slice(0, MAX_PROVIDER_RESULTS)) {
		const normalized = normalizeBlibliRecord(
			item,
			input,
			seenIds,
			context?.identity,
		);
		if ("evidence" in normalized) evidence.push(normalized.evidence);
		else rejected.push(normalized.rejected);
	}
	return {
		status: "SUCCESS",
		provider: "BLIBLI",
		source: "BLIBLI",
		search_terms: input.searchTerms,
		region: "Indonesia",
		...(location ? { location } : {}),
		fetched_at: new Date().toISOString(),
		cache_hit: false,
		evidence,
		rejected,
	};
}

function getClient() {
	const token = process.env.APIFY_API_TOKEN?.trim();
	if (!token) throw new ProviderBoundaryError("CONFIGURATION");
	const client = new ApifyClient({
		token,
		maxRetries: 1,
		minDelayBetweenRetriesMillis: 500,
		timeoutSecs: MAX_ACTOR_SECONDS_PER_ATTEMPT + 5,
	});
	client.logger.setLevel(client.logger.LEVELS.OFF);
	return client;
}

export function buildBlibliActorInput(input: Input) {
	return {
		searchTerms: input.searchTerms,
		fetchProductDetails: true,
		includeOutOfStock: false,
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

export function buildBlibliActorRunOptions(
	timeoutSeconds = MAX_ACTOR_SECONDS_PER_ATTEMPT,
) {
	return {
		log: null,
		timeout: timeoutSeconds,
		waitSecs: timeoutSeconds,
	};
}

async function executeSearch(
	input: Input,
	cache: MarketplaceSearchCache,
	context?: BlibliSearchContext,
): Promise<MarketplaceToolResult> {
	const effectiveInput = {
		...input,
		...(context?.location ? { location: context.location } : {}),
	};
	const key = cacheKey({
		...effectiveInput,
		identity: context?.identity,
	});
	const cached = cache.get(key);
	if (cached && cached.expiresAt > Date.now())
		return { ...cached.value, cache_hit: true };
	if (cached) cache.delete(key);

	let lastCategory: ProviderErrorCategory = "UNKNOWN";
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const result = await fetch(effectiveInput, context);
			cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
			return result;
		} catch (error) {
			lastCategory =
				error instanceof ApifyApiError
					? "APIFY_ERROR"
					: providerErrorCategory(error);
			if (lastCategory === "CONFIGURATION" || attempt === 1) break;
		}
	}
	console.error(
		JSON.stringify({
			provider: "BLIBLI",
			error_category: lastCategory,
		}),
	);
	return {
		status: "PROVIDER_FAILURE",
		provider: "BLIBLI",
		source: "BLIBLI",
		error_category: lastCategory,
		retried: lastCategory !== "CONFIGURATION",
	};
}

export function createBlibliSearchTool(
	options: {
		cache?: MarketplaceSearchCache;
		context?: BlibliSearchContext;
		onResult?: MarketplaceSearchObserver;
	} = {},
) {
	return createTool({
		name: "blibliSearch",
		description:
			"Cari listing Blibli dengan identitas produk yang sama. Actor, batas, retry, proxy, dan kredensial dikunci aplikasi.",
		inputSchema,
		execute: async (input) => {
			const result = await executeSearch(
				input,
				options.cache ?? defaultCache,
				options.context,
			);
			options.onResult?.(result);
			return result;
		},
	});
}
