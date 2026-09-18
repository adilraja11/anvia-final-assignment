import { createTool } from "@anvia/core";
import { ApifyApiError, ApifyClient } from "apify-client";
import { z } from "zod";
import {
	approvedMarketplaceUrl,
	boundedText,
	CACHE_TTL_MS,
	cacheKey,
	classifyCondition,
	comparableCondition,
	isoDate,
	isRejectedTitle,
	MAX_PROVIDER_RESULTS,
	type MarketplaceToolResult,
	marketplaceConditionSchema,
	type NormalizedCondition,
	ProviderBoundaryError,
	type ProviderErrorCategory,
	providerErrorCategory,
	tokens,
} from "../marketplace.js";

const ACTOR_ID = "fanndev/blibli-product-price-monitor";
const MAX_ITEMS_PER_QUERY = 10;

const inputSchema = z
	.object({
		searchTerms: z.array(z.string().trim().min(1).max(160)).min(1).max(5),
		condition: marketplaceConditionSchema,
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
		if (
			termTokens.some((token) => /^\d+$/.test(token) && !titleTokens.has(token))
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

function allowedAttributes(record: Record<string, unknown>) {
	const attributes: Record<string, string> = {};
	const brand = boundedText(record.brand, 80);
	if (brand) attributes.brand = brand;
	return attributes;
}

function conditionSearchCue(condition: Input["condition"]) {
	return {
		"Seperti baru": "bekas seperti baru",
		Baik: "bekas kondisi baik",
		Cukup: "bekas kondisi cukup",
		Rusak: "bekas rusak",
		"Tidak diketahui": "bekas",
	}[condition];
}

export function buildBlibliSearchTerms(input: Input) {
	return input.searchTerms.slice(0, 3).map((term) => {
		const detected = classifyCondition(term);
		if (detected.explicitSecondHand) return term;
		const cue = conditionSearchCue(input.condition);
		const identityLength = Math.max(1, 160 - cue.length - 1);
		return `${term.slice(0, identityLength).trim()} ${cue}`;
	});
}

export function normalizeBlibliRecord(
	value: unknown,
	input: Input,
	seenIds: Set<string>,
) {
	const source = "BLIBLI" as const;
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return { rejected: { source, exclusion_reason: "malformed_record" } };
	const record = value as Record<string, unknown>;
	const url = approvedMarketplaceUrl(record.url, source);
	const listingId = url
		? boundedText(new URL(url).pathname.split("/").filter(Boolean).pop(), 160)
		: undefined;
	const reject = (exclusion_reason: string) => ({
		rejected: {
			source,
			...(listingId ? { listing_id: listingId } : {}),
			exclusion_reason,
		},
	});
	if (!url) return reject("invalid_listing_url");
	if (!listingId) return reject("missing_listing_id");
	if (seenIds.has(listingId)) return reject("duplicate_listing");

	const title = boundedText(record.name, 400);
	if (!title) return reject("missing_title");
	if (!matchesSearchTerms(title, input.searchTerms))
		return reject("identity_mismatch");
	if (isRejectedTitle(title)) return reject("non_comparable_listing");
	if (
		typeof record.stockStatus !== "string" ||
		record.stockStatus.toUpperCase() !== "AVAILABLE"
	)
		return reject("listing_not_available");
	if (
		typeof record.salePrice !== "number" ||
		!Number.isSafeInteger(record.salePrice) ||
		record.salePrice <= 0
	)
		return reject("invalid_price");

	// Blibli has no reliable condition field. A title must explicitly identify the
	// listing as second-hand before it can enter the seller-first distribution.
	const detected = classifyCondition(title);
	if (!detected.explicitSecondHand || detected.condition === "NEW")
		return reject("missing_second_hand_condition");
	if (
		!comparableCondition(
			detected.condition,
			input.condition,
			detected.explicitSecondHand,
		)
	)
		return reject("condition_not_comparable");
	seenIds.add(listingId);
	const scrapedAt = isoDate(record.scrapedAt) ?? new Date().toISOString();
	const postedAt = isoDate(record.postedAt ?? record.createdAt);
	const city = boundedText(record.city ?? record.location, 120);
	return {
		evidence: {
			source,
			listing_id: listingId,
			listing_url: url,
			title,
			price_idr: record.salePrice,
			condition: detected.condition as Exclude<NormalizedCondition, "NEW">,
			...(city ? { city } : {}),
			product_attributes: allowedAttributes(record),
			listing_status: "AVAILABLE" as const,
			...(postedAt ? { posted_at: postedAt } : {}),
			scraped_at: scrapedAt,
			match_score: 1,
		},
	};
}

async function fetch(input: Input): Promise<Success> {
	const client = getClient();
	const identityTerms = input.searchTerms.slice(0, 3);
	const actorTerms = buildBlibliSearchTerms(input);
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
		const normalized = normalizeBlibliRecord(
			item,
			{ ...input, searchTerms: identityTerms },
			seenIds,
		);
		if ("evidence" in normalized) evidence.push(normalized.evidence);
		if ("rejected" in normalized) rejected.push(normalized.rejected);
	}
	return {
		status: "SUCCESS",
		provider: "BLIBLI",
		source: "BLIBLI",
		search_terms: actorTerms,
		condition: input.condition,
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
		searchTerms: buildBlibliSearchTerms(input),
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

export function buildBlibliActorRunOptions() {
	return { log: null };
}

async function executeSearch(input: Input): Promise<MarketplaceToolResult> {
	const key = cacheKey(input);
	const cached = cache.get(key);
	if (cached && cached.expiresAt > Date.now())
		return { ...cached.value, cache_hit: true };
	if (cached) cache.delete(key);

	let lastCategory: ProviderErrorCategory = "UNKNOWN";
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const result = await fetch(input);
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

export function createBlibliSearchTool(
	options: { onResult?: MarketplaceSearchObserver } = {},
) {
	return createTool({
		name: "blibliSearch",
		description:
			"Cari listing barang bekas yang sebanding di Blibli. Actor, batas 30 hasil, retry, proxy, kredensial, dan konfigurasi provider dikunci oleh aplikasi.",
		inputSchema,
		execute: async (input) => {
			const result = await executeSearch(input);
			options.onResult?.(result);
			return result;
		},
	});
}

export const blibliSearch = createBlibliSearchTool();
