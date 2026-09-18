import {
	type ComparableListing,
	type MarketplaceCondition,
	type MarketplaceToolResult,
	normalizeText,
} from "./marketplace.js";

export type ValuationConfidence = "HIGH" | "MEDIUM";
export type EvidenceCoverage = "LOCAL" | "NATIONAL";

export type ValuationResult =
	| {
			status: "RATE_LIMITED";
	  }
	| {
			status: "VALUATED";
			recommended_minimum_idr: number;
			recommended_maximum_idr: number;
			suggested_listing_price_idr: number;
			confidence: ValuationConfidence;
			confidence_reason: string;
			accepted_comparable_count: number;
			source_coverage: Record<"BLIBLI" | "FACEBOOK_MARKETPLACE", number>;
			evidence_coverage: EvidenceCoverage;
			accepted_evidence: ComparableListing[];
			outlier_count: number;
	  }
	| {
			status: "INSUFFICIENT_EVIDENCE";
			accepted_comparable_count: number;
			outlier_count: number;
			accepted_evidence: ComparableListing[];
			evidence_coverage: EvidenceCoverage;
	  }
	| {
			status: "SERVICE_FAILURE";
			failed_sources: Array<"BLIBLI" | "FACEBOOK_MARKETPLACE">;
	  };

type Source = "BLIBLI" | "FACEBOOK_MARKETPLACE";

export type CalculateValuationInput = {
	condition: MarketplaceCondition;
	location?: string;
	providerResults: MarketplaceToolResult[];
	rateLimited?: boolean;
};

const MIN_ACCEPTED_COMPARABLES = 10;

function percentile(values: number[], fraction: number) {
	const ordered = [...values].sort((left, right) => left - right);
	const position = (ordered.length - 1) * fraction;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	return (
		ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
	);
}

function weightedPercentile(evidence: ComparableListing[], fraction: number) {
	const counts = new Map<Source, number>();
	for (const item of evidence)
		counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
	const sourceWeight = 1 / counts.size;
	let cumulativeWeight = 0;
	for (const item of [...evidence].sort(
		(left, right) => left.price_idr - right.price_idr,
	)) {
		cumulativeWeight += sourceWeight / (counts.get(item.source) ?? 1);
		if (cumulativeWeight >= fraction) return item.price_idr;
	}
	return evidence.at(-1)?.price_idr;
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

function acceptedEvidence(results: MarketplaceToolResult[]) {
	const seen = new Set<string>();
	const evidence: ComparableListing[] = [];
	for (const result of results) {
		if (result.status !== "SUCCESS") continue;
		for (const item of result.evidence) {
			if (!Number.isSafeInteger(item.price_idr) || item.price_idr <= 0)
				continue;
			const key = `${item.source}:${item.listing_id}:${item.listing_url}`;
			if (seen.has(key)) continue;
			seen.add(key);
			evidence.push(item);
		}
	}
	return evidence;
}

function matchesCondition(
	condition: MarketplaceCondition,
	evidence: ComparableListing["condition"],
) {
	if (condition === "Tidak diketahui") return true;
	return (
		(condition === "Seperti baru" && evidence === "LIKE_NEW") ||
		(condition === "Baik" && evidence === "GOOD") ||
		(condition === "Cukup" && evidence === "FAIR") ||
		(condition === "Rusak" && evidence === "DAMAGED")
	);
}

export function roundIdr(value: number) {
	return Math.round(value / 1_000) * 1_000;
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

	const failures = input.providerResults
		.filter(
			(
				result,
			): result is Extract<
				MarketplaceToolResult,
				{ status: "PROVIDER_FAILURE" }
			> => result.status === "PROVIDER_FAILURE",
		)
		.map((result) => result.source);
	const successes = input.providerResults.filter(
		(result) => result.status === "SUCCESS",
	);
	if (successes.length === 0 && failures.length >= 2)
		return { status: "SERVICE_FAILURE", failed_sources: failures };

	const conditionEvidence = acceptedEvidence(input.providerResults).filter(
		(item) => matchesCondition(input.condition, item.condition),
	);
	const conditionSelected = selectCoverage(conditionEvidence, input.location);
	if (conditionSelected.evidence.length < MIN_ACCEPTED_COMPARABLES)
		return {
			status: "INSUFFICIENT_EVIDENCE",
			accepted_comparable_count: conditionSelected.evidence.length,
			outlier_count: 0,
			accepted_evidence: conditionSelected.evidence,
			evidence_coverage: conditionSelected.coverage,
		};

	const prices = conditionSelected.evidence.map((item) => item.price_idr);
	const firstQuartile = percentile(prices, 0.25);
	const thirdQuartile = percentile(prices, 0.75);
	const interquartileRange = thirdQuartile - firstQuartile;
	const lowerFence = firstQuartile - 1.5 * interquartileRange;
	const upperFence = thirdQuartile + 1.5 * interquartileRange;
	const filtered = conditionSelected.evidence.filter(
		(item) => item.price_idr >= lowerFence && item.price_idr <= upperFence,
	);
	const outlierCount = conditionSelected.evidence.length - filtered.length;
	if (filtered.length < MIN_ACCEPTED_COMPARABLES)
		return {
			status: "INSUFFICIENT_EVIDENCE",
			accepted_comparable_count: filtered.length,
			outlier_count: outlierCount,
			accepted_evidence: filtered,
			evidence_coverage: conditionSelected.coverage,
		};

	const minimum = weightedPercentile(filtered, 0.25);
	const maximum = weightedPercentile(filtered, 0.75);
	const suggested = weightedPercentile(filtered, 0.5);
	if (minimum === undefined || maximum === undefined || suggested === undefined)
		return {
			status: "INSUFFICIENT_EVIDENCE",
			accepted_comparable_count: filtered.length,
			outlier_count: outlierCount,
			accepted_evidence: filtered,
			evidence_coverage: conditionSelected.coverage,
		};

	const sourceCoverage = {
		BLIBLI: filtered.filter((item) => item.source === "BLIBLI").length,
		FACEBOOK_MARKETPLACE: filtered.filter(
			(item) => item.source === "FACEBOOK_MARKETPLACE",
		).length,
	};
	const highConfidence =
		input.condition !== "Tidak diketahui" &&
		sourceCoverage.BLIBLI >= 3 &&
		sourceCoverage.FACEBOOK_MARKETPLACE >= 3;
	return {
		status: "VALUATED",
		recommended_minimum_idr: roundIdr(minimum),
		recommended_maximum_idr: roundIdr(maximum),
		suggested_listing_price_idr: roundIdr(suggested),
		confidence: highConfidence ? "HIGH" : "MEDIUM",
		confidence_reason: highConfidence
			? "Setidaknya 10 pembanding diterima, termasuk minimal 3 dari masing-masing marketplace."
			: input.condition === "Tidak diketahui"
				? "Setidaknya 10 pembanding diterima, tetapi kondisi barang tidak diketahui sehingga kepercayaan dibatasi."
				: `Setidaknya 10 pembanding diterima; cakupan sumber adalah ${sourceCoverage.BLIBLI} Blibli dan ${sourceCoverage.FACEBOOK_MARKETPLACE} Facebook Marketplace.`,
		accepted_comparable_count: filtered.length,
		source_coverage: sourceCoverage,
		evidence_coverage: conditionSelected.coverage,
		accepted_evidence: filtered,
		outlier_count: outlierCount,
	};
}
