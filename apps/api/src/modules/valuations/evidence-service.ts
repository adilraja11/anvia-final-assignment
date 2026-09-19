import { createHash } from "node:crypto";
import type { ComparableListing, MarketplaceToolResult } from "@repo/agents";
import { Redis } from "ioredis";
import { z } from "zod";

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const MAX_EVIDENCE = 30;

const cachedListingSchema = z
	.object({
		listingId: z.string().trim().min(1).max(160),
		title: z.string().trim().min(1).max(500),
		priceIdr: z.number().int().positive().safe(),
		listingUrl: z.string().url().max(2_048),
	})
	.strict();

const cachedEvidenceSchema = z
	.object({
		fetchedAt: z.string().datetime({ offset: true }),
		listings: z.array(cachedListingSchema).min(1).max(MAX_EVIDENCE),
	})
	.strict();

type CachedEvidence = z.infer<typeof cachedEvidenceSchema>;

const redis = new Redis({
	host: process.env.REDIS_HOST?.trim() || "localhost",
	port: Number(process.env.REDIS_PORT ?? 16379),
	connectTimeout: 2_000,
	enableOfflineQueue: false,
	maxRetriesPerRequest: 1,
});

redis.on("error", () => undefined);

function normalizedIdentity(value: string) {
	return value
		.toLocaleLowerCase("id-ID")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

function cacheKey(productName: string) {
	const hash = createHash("sha256")
		.update(normalizedIdentity(productName))
		.digest("hex");
	return `asli-segini:valuation-evidence:v1:${hash}`;
}

function approvedBlibliUrl(value: string) {
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

function comparableIdentityMatches(productName: string, title: string) {
	const productTokens = normalizedIdentity(productName)
		.split(/\s+/)
		.filter((token) => token.length > 1 || /^\d+$/.test(token));
	const titleTokens = new Set(normalizedIdentity(title).split(/\s+/));
	return (
		productTokens.length > 0 &&
		productTokens.every((token) => titleTokens.has(token))
	);
}

function acceptedComparable(
	productName: string,
	listing: ComparableListing,
): ComparableListing | undefined {
	const listingUrl = approvedBlibliUrl(listing.listing_url);
	if (
		!listingUrl ||
		listing.source !== "BLIBLI" ||
		!Number.isSafeInteger(listing.price_idr) ||
		listing.price_idr <= 0 ||
		!listing.listing_id.trim() ||
		!listing.title.trim() ||
		!comparableIdentityMatches(productName, listing.title)
	)
		return undefined;
	return { ...listing, listing_url: listingUrl };
}

export function acceptedEvidence(
	productName: string,
	providerResult: MarketplaceToolResult,
): MarketplaceToolResult {
	if (providerResult.status !== "SUCCESS") return providerResult;
	const seen = new Set<string>();
	const evidence: ComparableListing[] = [];
	for (const listing of providerResult.evidence) {
		const accepted = acceptedComparable(productName, listing);
		if (!accepted) continue;
		const key = `${accepted.listing_id}:${accepted.listing_url}`;
		if (seen.has(key)) continue;
		seen.add(key);
		evidence.push(accepted);
	}
	return { ...providerResult, evidence };
}

export function evidenceForPersistence(evidence: ComparableListing[]) {
	return evidence.map((listing) => ({
		productName: listing.title,
		productPrice: BigInt(listing.price_idr),
		productLink: listing.listing_url,
	}));
}

function cachedToProviderResult(cached: CachedEvidence): MarketplaceToolResult {
	return {
		status: "SUCCESS",
		provider: "BLIBLI",
		source: "BLIBLI",
		search_terms: [],
		region: "Indonesia",
		fetched_at: cached.fetchedAt,
		cache_hit: true,
		rejected: [],
		evidence: cached.listings.map((listing) => ({
			source: "BLIBLI",
			listing_id: listing.listingId,
			listing_url: listing.listingUrl,
			title: listing.title,
			price_idr: listing.priceIdr,
			product_attributes: {},
			listing_status: "AVAILABLE",
			scraped_at: cached.fetchedAt,
		})),
	};
}

export async function readEvidenceCache(productName: string) {
	try {
		const value = await redis.get(cacheKey(productName));
		if (!value) return undefined;
		const parsed = cachedEvidenceSchema.safeParse(JSON.parse(value));
		if (!parsed.success) {
			await redis.del(cacheKey(productName));
			return undefined;
		}
		return cachedToProviderResult(parsed.data);
	} catch {
		return undefined;
	}
}

export async function writeEvidenceCache(
	productName: string,
	providerResult: MarketplaceToolResult,
) {
	if (
		providerResult.status !== "SUCCESS" ||
		providerResult.evidence.length === 0
	)
		return;
	const value = cachedEvidenceSchema.parse({
		fetchedAt: providerResult.fetched_at,
		listings: providerResult.evidence.map((listing) => ({
			listingId: listing.listing_id,
			title: listing.title,
			priceIdr: listing.price_idr,
			listingUrl: listing.listing_url,
		})),
	});
	try {
		await redis.set(
			cacheKey(productName),
			JSON.stringify(value),
			"EX",
			CACHE_TTL_SECONDS,
		);
	} catch {
		// Cache failure must not alter an already validated valuation outcome.
	}
}

export async function reserveValuationUsage() {
	const date = new Date().toISOString().slice(0, 10);
	const globalKey = `asli-segini:valuation-usage:global:${date}`;
	const secondsUntilTomorrow = Math.max(
		1,
		Math.ceil(
			(Date.UTC(
				new Date().getUTCFullYear(),
				new Date().getUTCMonth(),
				new Date().getUTCDate() + 1,
			) -
				Date.now()) /
				1_000,
		),
	);
	const globalLimit = Number(process.env.VALUATION_GLOBAL_DAILY_LIMIT ?? 100);
	if (!Number.isSafeInteger(globalLimit) || globalLimit < 1)
		throw new Error("Invalid valuation usage limit configuration.");

	try {
		const allowed = await redis.eval(
			[
				"local global = redis.call('INCR', KEYS[1])",
				"if global == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
				"if global > tonumber(ARGV[2]) then return 0 end",
				"return 1",
			].join("\n"),
			1,
			globalKey,
			secondsUntilTomorrow,
			globalLimit,
		);
		return Number(allowed) === 1;
	} catch {
		throw new Error("Valuation usage controls are unavailable.");
	}
}

export async function closeValuationRedis() {
	if (redis.status === "ready" || redis.status === "connect")
		await redis.quit();
}
