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
	normalizeText,
	ProviderBoundaryError,
	type ProviderErrorCategory,
	providerErrorCategory,
	tokens,
} from "../marketplace.js";

const ACTOR_ID = "apify/facebook-marketplace-scraper";

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
const IndonesianLocationTokens = new Set([
	"indonesia",
	"jakarta",
	"aceh",
	"bali",
	"banten",
	"bengkulu",
	"gorontalo",
	"jambi",
	"lampung",
	"maluku",
	"papua",
	"riau",
	"yogyakarta",
	"kalimantan",
	"sulawesi",
	"sumatera",
	"jawa",
	"ntb",
	"ntt",
	"id",
]);

function matchesSearchTerms(title: string, searchTerms: string[]) {
	const titleTokens = new Set(tokens(title));
	return searchTerms.some((term) => {
		const termTokens = [...new Set(tokens(term))];
		return (
			termTokens.length > 0 &&
			termTokens.every((token) => titleTokens.has(token))
		);
	});
}

function conditionFromAttributes(value: unknown) {
	const values: string[] = [];
	const visit = (item: unknown, depth: number, forced = false) => {
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
			const isConditionField = /condition|kondisi|item_condition/i.test(key);
			if (forced || isConditionField)
				visit(child, depth + 1, forced || isConditionField);
		}
	};
	visit(value, 0);
	for (const item of values) {
		const detected = classifyCondition(item);
		if (detected.condition !== "UNKNOWN" || detected.explicitSecondHand)
			return detected;
	}
	return { condition: "UNKNOWN" as const, explicitSecondHand: false };
}

function locationValues(record: Record<string, unknown>) {
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
	const textLocation =
		typeof record.location_text === "object" &&
		record.location_text !== null &&
		!Array.isArray(record.location_text)
			? (record.location_text as Record<string, unknown>).text
			: undefined;
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
		textLocation,
	]
		.map((value) => boundedText(value, 160))
		.filter((value): value is string => Boolean(value));
	return {
		city:
			boundedText(reverse?.city, 120) ??
			boundedText(textLocation, 120) ??
			boundedText(cityPage?.display_name, 120),
		values,
	};
}

export function isIndonesianLocation(value: unknown) {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const values = locationValues(value as Record<string, unknown>).values.map(
		normalizeText,
	);
	return values.some((item) =>
		item.split(/\s+/).some((token) => IndonesianLocationTokens.has(token)),
	);
}

function statusFrom(record: Record<string, unknown>) {
	if (record.is_hidden === true) return "HIDDEN";
	if (record.is_draft === true) return "DRAFT";
	if (record.is_pending === true) return "PENDING";
	if (record.is_sold === true) return "SOLD";
	if (record.is_live === true) return "LIVE";
	const status = boundedText(record.listing_status, 40)?.toUpperCase();
	if (["LIVE", "ACTIVE", "AVAILABLE"].includes(status ?? "")) return "LIVE";
	return status;
}

function parseIdrAmount(value: unknown) {
	if (typeof value === "number")
		return Number.isSafeInteger(value) && value > 0 ? value : undefined;
	if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))
		return undefined;
	const amount = Number(value);
	return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

function normalizeRecord(value: unknown, input: Input, seenIds: Set<string>) {
	const source = "FACEBOOK_MARKETPLACE" as const;
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return { rejected: { source, exclusion_reason: "malformed_record" } };
	const record = value as Record<string, unknown>;
	const listingId = boundedText(record.id, 160);
	const reject = (exclusion_reason: string) => ({
		rejected: {
			source,
			...(listingId ? { listing_id: listingId } : {}),
			exclusion_reason,
		},
	});
	if (!listingId) return reject("missing_listing_id");
	if (seenIds.has(listingId)) return reject("duplicate_listing");
	seenIds.add(listingId);
	const title = boundedText(record.marketplace_listing_title, 400);
	if (!title) return reject("missing_title");
	if (!matchesSearchTerms(title, input.searchTerms))
		return reject("identity_mismatch");
	if (isRejectedTitle(title)) return reject("non_comparable_listing");
	const url = approvedMarketplaceUrl(record.listingUrl, source);
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
	if (statusFrom(record) !== "LIVE") return reject("listing_not_live");

	const detected = conditionFromAttributes(record.attribute_data);
	const titleCondition = classifyCondition(title);
	const condition = detected.explicitSecondHand ? detected : titleCondition;
	if (
		!comparableCondition(
			condition.condition,
			input.condition,
			condition.explicitSecondHand,
		)
	)
		return reject("condition_not_comparable");
	const city = locationValues(record).city;
	const postedAt = isoDate(record.creation_time);
	return {
		evidence: {
			source,
			listing_id: listingId,
			listing_url: url,
			title,
			price_idr: priceIdr,
			condition: condition.condition as Exclude<NormalizedCondition, "NEW">,
			...(city ? { city } : {}),
			product_attributes: {},
			listing_status: "LIVE" as const,
			...(postedAt ? { posted_at: postedAt } : {}),
			scraped_at: new Date().toISOString(),
			match_score: 1,
		},
	};
}

async function fetch(input: Input): Promise<Success> {
	const client = getClient();
	const run = await client
		.actor(ACTOR_ID)
		.call(buildFacebookActorInput(input), buildFacebookActorRunOptions());
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
		const normalized = normalizeRecord(item, input, seenIds);
		if ("evidence" in normalized) evidence.push(normalized.evidence);
		if ("rejected" in normalized) rejected.push(normalized.rejected);
	}
	return {
		status: "SUCCESS",
		provider: sourceForResult,
		source: sourceForResult,
		search_terms: input.searchTerms,
		condition: input.condition,
		region: "Indonesia",
		...(input.location ? { location: input.location } : {}),
		fetched_at: new Date().toISOString(),
		cache_hit: false,
		evidence,
		rejected,
	};
}

const sourceForResult = "FACEBOOK_MARKETPLACE" as const;

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

export function buildFacebookActorInput(input: Input) {
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
	return { maxItems: MAX_PROVIDER_RESULTS, log: null };
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
		JSON.stringify({ provider: sourceForResult, error_category: lastCategory }),
	);
	return {
		status: "PROVIDER_FAILURE",
		provider: sourceForResult,
		source: sourceForResult,
		error_category: lastCategory,
		retried: lastCategory !== "CONFIGURATION",
	};
}

export function createFacebookMarketplaceSearchTool(
	options: { onResult?: MarketplaceSearchObserver } = {},
) {
	return createTool({
		name: "facebookMarketplaceSearch",
		description:
			"Cari listing barang bekas yang sebanding di Facebook Marketplace. Actor, batas 30 hasil, retry, proxy, kredensial, dan konfigurasi provider dikunci oleh aplikasi.",
		inputSchema,
		execute: async (input) => {
			const result = await executeSearch(input);
			options.onResult?.(result);
			return result;
		},
	});
}

export const facebookMarketplaceSearch = createFacebookMarketplaceSearchTool();
