import {
	type ComparableListing,
	type MarketplaceToolResult,
	normalizeText,
} from "./marketplace.js";

export type ValuationConfidence = "HIGH" | "MEDIUM";
export type EvidenceCoverage = "LOCAL" | "NATIONAL";

export type ValuationResult =
	| { status: "RATE_LIMITED" }
	| {
			status: "VALUATED";
			suggested_listing_price_idr: number;
			observed_market_range_idr: { minimum: number; maximum: number };
			confidence: ValuationConfidence;
			confidence_reason: string;
			accepted_comparable_count: number;
			evidence_coverage: EvidenceCoverage;
			accepted_evidence: ComparableListing[];
			outlier_count: number;
	  }
	| {
			status: "INSUFFICIENT_EVIDENCE";
			accepted_comparable_count: number;
			accepted_evidence: ComparableListing[];
			evidence_coverage: EvidenceCoverage;
			outlier_count: number;
	  }
	| { status: "SERVICE_FAILURE" };

export type CalculateValuationInput = {
	location?: string;
	providerResult: MarketplaceToolResult;
	rateLimited?: boolean;
};

const MIN_ACCEPTED_COMPARABLES = 5;

function percentile(values: number[], fraction: number) {
	const ordered = [...values].sort((left, right) => left - right);
	const position = (ordered.length - 1) * fraction;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	return (
		ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
	);
}

function locationMatches(city: string | undefined, location: string) {
	if (!city) return false;
	const requested = normalizeText(location);
	const actual = normalizeText(city);
	return (
		requested.length > 0 &&
		(actual.includes(requested) || requested.includes(actual))
	);
}

function selectCoverage(evidence: ComparableListing[], location?: string) {
	if (!location) return { evidence, coverage: "NATIONAL" as const };
	const local = evidence.filter((item) => locationMatches(item.city, location));
	return local.length >= MIN_ACCEPTED_COMPARABLES
		? { evidence: local, coverage: "LOCAL" as const }
		: { evidence, coverage: "NATIONAL" as const };
}

function acceptedEvidence(result: MarketplaceToolResult) {
	if (result.status !== "SUCCESS") return [];
	const seen = new Set<string>();
	const evidence: ComparableListing[] = [];
	for (const item of result.evidence) {
		if (
			item.source !== "BLIBLI" ||
			!Number.isSafeInteger(item.price_idr) ||
			item.price_idr <= 0
		)
			continue;
		const key = `${item.listing_id}:${item.listing_url}`;
		if (seen.has(key)) continue;
		seen.add(key);
		evidence.push(item);
	}
	return evidence;
}

function removeOutliers(evidence: ComparableListing[]) {
	if (evidence.length < 4) return { evidence, outlierCount: 0 };
	const prices = evidence.map((item) => item.price_idr);
	const firstQuartile = percentile(prices, 0.25);
	const thirdQuartile = percentile(prices, 0.75);
	const interquartileRange = thirdQuartile - firstQuartile;
	const lowerFence = firstQuartile - 1.5 * interquartileRange;
	const upperFence = thirdQuartile + 1.5 * interquartileRange;
	const accepted = evidence.filter(
		(item) => item.price_idr >= lowerFence && item.price_idr <= upperFence,
	);
	return {
		evidence: accepted,
		outlierCount: evidence.length - accepted.length,
	};
}

/** Rounds positive IDR values half-up to the nearest Rp1.000. */
export function roundIdr(value: number) {
	return Math.floor(value / 1_000 + 0.5) * 1_000;
}

export function formatIdr(value: number) {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(roundIdr(value));
}

export function calculateValuation(
	input: CalculateValuationInput,
): ValuationResult {
	if (input.rateLimited) return { status: "RATE_LIMITED" };
	if (input.providerResult.status === "PROVIDER_FAILURE")
		return { status: "SERVICE_FAILURE" };

	const selected = selectCoverage(
		acceptedEvidence(input.providerResult),
		input.location,
	);
	const filtered = removeOutliers(selected.evidence);
	if (filtered.evidence.length < MIN_ACCEPTED_COMPARABLES)
		return {
			status: "INSUFFICIENT_EVIDENCE",
			accepted_comparable_count: filtered.evidence.length,
			accepted_evidence: filtered.evidence,
			evidence_coverage: selected.coverage,
			outlier_count: filtered.outlierCount,
		};

	const prices = filtered.evidence.map((item) => item.price_idr);
	const highConfidence = filtered.evidence.length >= 15;
	return {
		status: "VALUATED",
		suggested_listing_price_idr: roundIdr(percentile(prices, 0.5)),
		observed_market_range_idr: {
			minimum: roundIdr(percentile(prices, 0.25)),
			maximum: roundIdr(percentile(prices, 0.75)),
		},
		confidence: highConfidence ? "HIGH" : "MEDIUM",
		confidence_reason: highConfidence
			? "Setidaknya 15 listing Blibli yang sebanding diterima."
			: "Lima sampai 14 listing Blibli yang sebanding diterima.",
		accepted_comparable_count: filtered.evidence.length,
		evidence_coverage: selected.coverage,
		accepted_evidence: filtered.evidence,
		outlier_count: filtered.outlierCount,
	};
}
