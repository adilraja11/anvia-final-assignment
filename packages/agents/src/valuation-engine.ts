import {
	type ComparableListing,
	type EvidencePurpose,
	type MarketplaceCondition,
	type MarketplaceToolResult,
	normalizeText,
	type ProductCategory,
} from "./marketplace.js";

export type ValuationConfidence = "HIGH" | "MEDIUM";
export type EvidenceCoverage = "LOCAL" | "NATIONAL";
export type AgeSource = "USER_PROVIDED" | "CATEGORY_DEFAULT";

export type ValuationResult =
	| { status: "RATE_LIMITED" }
	| {
			status: "VALUATED";
			suggested_listing_price_idr: number;
			observed_market_range_idr: { minimum: number; maximum: number };
			new_reference_price_idr: number;
			market_adjustment: { unclamped: number; applied: number };
			confidence: ValuationConfidence;
			confidence_reason: string;
			age_months: number;
			age_source: AgeSource;
			depreciation_rate: number;
			condition_multiplier: number;
			accepted_new_reference_count: number;
			accepted_used_market_count: number;
			evidence_coverage: EvidenceCoverage;
			accepted_evidence: ComparableListing[];
			outlier_count: number;
	  }
	| {
			status: "INSUFFICIENT_EVIDENCE";
			accepted_new_reference_count: number;
			accepted_used_market_count: number;
			accepted_evidence: ComparableListing[];
			evidence_coverage: EvidenceCoverage;
			outlier_count: number;
	  }
	| { status: "SERVICE_FAILURE"; failed_purposes: EvidencePurpose[] };

export type CalculateValuationInput = {
	category: ProductCategory;
	condition: MarketplaceCondition;
	ageMonths?: number;
	location?: string;
	providerResults: MarketplaceToolResult[];
	rateLimited?: boolean;
};

const CATEGORY_DEFAULT_AGE_MONTHS: Record<ProductCategory, number> = {
	computer: 24,
	handphone: 18,
	tablet: 24,
	gaming_console: 24,
	camera: 36,
};

const ANNUAL_DEPRECIATION: Record<ProductCategory, number> = {
	computer: 0.25,
	handphone: 0.35,
	tablet: 0.3,
	gaming_console: 0.2,
	camera: 0.2,
};

const CONDITION_MULTIPLIER: Record<MarketplaceCondition, number> = {
	"Seperti baru": 0.95,
	Baik: 0.825,
	Cukup: 0.675,
	Rusak: 0.5,
};

function percentile(values: number[], fraction: number) {
	const ordered = [...values].sort((left, right) => left - right);
	const position = (ordered.length - 1) * fraction;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	return (
		ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
	);
}

function median(values: number[]) {
	return percentile(values, 0.5);
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

function selectCoverage(
	newReference: ComparableListing[],
	usedMarket: ComparableListing[],
	location?: string,
) {
	if (!location)
		return { newReference, usedMarket, coverage: "NATIONAL" as const };
	const localNewReference = newReference.filter((item) =>
		locationMatches(item.city, location),
	);
	const localUsedMarket = usedMarket.filter((item) =>
		locationMatches(item.city, location),
	);
	return localNewReference.length >= 3 && localUsedMarket.length >= 5
		? {
				newReference: localNewReference,
				usedMarket: localUsedMarket,
				coverage: "LOCAL" as const,
			}
		: { newReference, usedMarket, coverage: "NATIONAL" as const };
}

function acceptedEvidence(
	results: MarketplaceToolResult[],
	purpose: EvidencePurpose,
) {
	const seen = new Set<string>();
	const evidence: ComparableListing[] = [];
	for (const result of results) {
		if (result.status !== "SUCCESS" || result.purpose !== purpose) continue;
		for (const item of result.evidence) {
			if (
				item.source !== "BLIBLI" ||
				item.purpose !== purpose ||
				!Number.isSafeInteger(item.price_idr) ||
				item.price_idr <= 0 ||
				(purpose === "new_reference" && item.lifecycle !== "NEW") ||
				(purpose === "used_market" && item.lifecycle !== "USED")
			)
				continue;
			const key = `${item.listing_id}:${item.listing_url}`;
			if (seen.has(key)) continue;
			seen.add(key);
			evidence.push(item);
		}
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

	const failedPurposes = ["new_reference", "used_market"] as const;
	const failures = failedPurposes.filter((purpose) => {
		const purposeResults = input.providerResults.filter(
			(result) => result.purpose === purpose,
		);
		return (
			purposeResults.length === 0 ||
			purposeResults.some((result) => result.status === "PROVIDER_FAILURE")
		);
	});
	if (failures.length > 0)
		return { status: "SERVICE_FAILURE", failed_purposes: [...failures] };

	const selected = selectCoverage(
		acceptedEvidence(input.providerResults, "new_reference"),
		acceptedEvidence(input.providerResults, "used_market"),
		input.location,
	);
	const newReference = removeOutliers(selected.newReference);
	const usedMarket = removeOutliers(selected.usedMarket);
	const acceptedEvidenceAll = [
		...newReference.evidence,
		...usedMarket.evidence,
	];
	const outlierCount = newReference.outlierCount + usedMarket.outlierCount;
	if (newReference.evidence.length < 3 || usedMarket.evidence.length < 5)
		return {
			status: "INSUFFICIENT_EVIDENCE",
			accepted_new_reference_count: newReference.evidence.length,
			accepted_used_market_count: usedMarket.evidence.length,
			accepted_evidence: acceptedEvidenceAll,
			evidence_coverage: selected.coverage,
			outlier_count: outlierCount,
		};

	const ageMonths =
		input.ageMonths ?? CATEGORY_DEFAULT_AGE_MONTHS[input.category];
	if (!Number.isInteger(ageMonths) || ageMonths < 0 || ageMonths > 240)
		throw new RangeError(
			"ageMonths must be a whole number from 0 through 240.",
		);
	const ageSource: AgeSource =
		input.ageMonths === undefined ? "CATEGORY_DEFAULT" : "USER_PROVIDED";
	const newReferencePrice = median(
		newReference.evidence.map((item) => item.price_idr),
	);
	const depreciationRate = ANNUAL_DEPRECIATION[input.category];
	const conditionMultiplier = CONDITION_MULTIPLIER[input.condition];
	const baseline =
		newReferencePrice *
		(1 - depreciationRate) ** (ageMonths / 12) *
		conditionMultiplier;
	const unclampedMarketAdjustment =
		median(usedMarket.evidence.map((item) => item.price_idr)) / baseline;
	const marketAdjustment = Math.max(
		0.85,
		Math.min(1.15, unclampedMarketAdjustment),
	);
	const suggested = baseline * marketAdjustment;
	const usedPrices = usedMarket.evidence.map((item) => item.price_idr);
	const highConfidence =
		usedMarket.evidence.length >= 15 && ageSource !== "CATEGORY_DEFAULT";
	return {
		status: "VALUATED",
		suggested_listing_price_idr: roundIdr(suggested),
		observed_market_range_idr: {
			minimum: roundIdr(percentile(usedPrices, 0.25)),
			maximum: roundIdr(percentile(usedPrices, 0.75)),
		},
		new_reference_price_idr: roundIdr(newReferencePrice),
		market_adjustment: {
			unclamped: unclampedMarketAdjustment,
			applied: marketAdjustment,
		},
		confidence: highConfidence ? "HIGH" : "MEDIUM",
		confidence_reason: highConfidence
			? "Terdapat setidaknya 3 referensi barang baru dan 15 listing barang bekas yang diterima."
			: ageSource === "CATEGORY_DEFAULT"
				? "Usia default kategori digunakan sehingga tingkat kepercayaan dibatasi ke MEDIUM."
				: "Terdapat setidaknya 3 referensi barang baru dan 5 listing barang bekas yang diterima.",
		age_months: ageMonths,
		age_source: ageSource,
		depreciation_rate: depreciationRate,
		condition_multiplier: conditionMultiplier,
		accepted_new_reference_count: newReference.evidence.length,
		accepted_used_market_count: usedMarket.evidence.length,
		evidence_coverage: selected.coverage,
		accepted_evidence: acceptedEvidenceAll,
		outlier_count: outlierCount,
	};
}
