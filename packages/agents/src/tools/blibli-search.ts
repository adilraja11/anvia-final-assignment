import { createTool } from "@anvia/core";
import { ApifyApiError, ApifyClient } from "apify-client";
import { z } from "zod";
import {
	approvedMarketplaceUrl,
	boundedText,
	CACHE_TTL_MS,
	cacheKey,
	type EvidencePurpose,
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

const cache = new Map<string, { expiresAt: number; value: Success }>();

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

function lifecycleFrom(record: Record<string, unknown>, title: string) {
	const values = [
		record.lifecycle,
		record.condition,
		record.itemCondition,
		record.productCondition,
		title,
	]
		.map((value) => boundedText(value, 160))
		.filter((value): value is string => Boolean(value));
	for (const value of values) {
		const normalized = value.toLocaleLowerCase("id-ID");
		if (/\b(used|bekas|second\s*hand|preloved)\b/.test(normalized))
			return "USED" as const;
		if (/\b(new|baru|segel|unopened)\b/.test(normalized)) return "NEW" as const;
	}
	return undefined;
}

function allowedAttributes(record: Record<string, unknown>) {
	const attributes: Record<string, string> = {};
	for (const key of ["brand", "model", "storage", "capacity", "variant"]) {
		const value = boundedText(record[key], 80);
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
	purpose: EvidencePurpose,
	seenIds: Set<string>,
) {
	const source = "BLIBLI" as const;
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return {
			rejected: { source, purpose, exclusion_reason: "MALFORMED_RECORD" },
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
			purpose,
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
	if (isRejectedTitle(title)) return reject("NON_COMPARABLE_LISTING");
	const stockStatus = boundedText(
		record.stockStatus ?? record.status,
		40,
	)?.toUpperCase();
	if (!stockStatus || !["AVAILABLE", "LIVE", "ACTIVE"].includes(stockStatus))
		return reject("LISTING_NOT_AVAILABLE");
	const priceIdr = parseIdrPrice(record);
	if (priceIdr === undefined) return reject("INVALID_PRICE");
	const lifecycle = lifecycleFrom(record, title);
	if (!lifecycle) return reject("LIFECYCLE_UNCLASSIFIED");
	if (
		(purpose === "new_reference" && lifecycle !== "NEW") ||
		(purpose === "used_market" && lifecycle !== "USED")
	)
		return reject("LIFECYCLE_MISMATCH");

	seenIds.add(listingId);
	const scrapedAt = isoDate(record.scrapedAt) ?? new Date().toISOString();
	const postedAt = isoDate(record.postedAt ?? record.createdAt);
	const city = boundedText(record.city ?? record.location, 120);
	const condition = boundedText(record.condition ?? record.itemCondition, 80);
	return {
		evidence: {
			source,
			purpose,
			listing_id: listingId,
			listing_url: url,
			title,
			price_idr: priceIdr,
			...(condition ? { condition } : {}),
			lifecycle,
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

async function fetch(input: Input, purpose: EvidencePurpose): Promise<Success> {
	const client = getClient();
	const run = await client
		.actor(ACTOR_ID)
		.call(buildBlibliActorInput(input), buildBlibliActorRunOptions());
	if (!run || typeof run.defaultDatasetId !== "string" || !run.defaultDatasetId)
		throw new ProviderBoundaryError("MISSING_DATASET");
	const dataset = await client
		.dataset<Record<string, unknown>>(run.defaultDatasetId)
		.listItems({ limit: MAX_PROVIDER_RESULTS });
	if (!dataset || !Array.isArray(dataset.items))
		throw new ProviderBoundaryError("MALFORMED_RESPONSE");

	const evidence: Success["evidence"] = [];
	const rejected: Success["rejected"] = [];
	const seenIds = new Set<string>();
	for (const item of dataset.items.slice(0, MAX_PROVIDER_RESULTS)) {
		const normalized = normalizeBlibliRecord(item, input, purpose, seenIds);
		if ("evidence" in normalized) evidence.push(normalized.evidence);
		else rejected.push(normalized.rejected);
	}
	return {
		status: "SUCCESS",
		provider: "BLIBLI",
		source: "BLIBLI",
		purpose,
		search_terms: input.searchTerms,
		region: "Indonesia",
		...(input.location ? { location: input.location } : {}),
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
		timeoutSecs: 360,
	});
	client.logger.setLevel(client.logger.LEVELS.OFF);
	return client;
}

export function buildBlibliActorInput(input: Input) {
	return {
		searchTerms: input.searchTerms,
		fetchProductDetails: true,
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

export function buildBlibliActorRunOptions() {
	return { log: null };
}

async function executeSearch(
	input: Input,
	purpose: EvidencePurpose,
): Promise<MarketplaceToolResult> {
	const key = cacheKey({ ...input, purpose });
	const cached = cache.get(key);
	if (cached && cached.expiresAt > Date.now())
		return { ...cached.value, cache_hit: true };
	if (cached) cache.delete(key);

	let lastCategory: ProviderErrorCategory = "UNKNOWN";
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const result = await fetch(input, purpose);
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
			purpose,
			error_category: lastCategory,
		}),
	);
	return {
		status: "PROVIDER_FAILURE",
		provider: "BLIBLI",
		source: "BLIBLI",
		purpose,
		error_category: lastCategory,
		retried: lastCategory !== "CONFIGURATION",
	};
}

export function createBlibliSearchTool(
	purpose: EvidencePurpose,
	options: { name?: string; onResult?: MarketplaceSearchObserver } = {},
) {
	return createTool({
		name:
			options.name ??
			(purpose === "new_reference"
				? "blibliNewReferenceSearch"
				: "blibliUsedMarketSearch"),
		description:
			purpose === "new_reference"
				? "Cari referensi listing barang baru dengan identitas yang sama di Blibli. Tujuan, actor, batas, retry, proxy, dan kredensial dikunci aplikasi."
				: "Cari listing pasar barang bekas dengan identitas yang sama di Blibli. Tujuan, actor, batas, retry, proxy, dan kredensial dikunci aplikasi.",
		inputSchema,
		execute: async (input) => {
			const result = await executeSearch(input, purpose);
			options.onResult?.(result);
			return result;
		},
	});
}
