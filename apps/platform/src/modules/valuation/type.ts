export const productConditions = [
	"Seperti baru",
	"Baik",
	"Cukup",
	"Rusak",
] as const;

export type ProductCondition = (typeof productConditions)[number];

export type ValuationInput = {
	productName: string;
	productCondition: ProductCondition;
	productDescription?: string;
};

export type ImageIdentificationResult =
	| { status: "SUPPORTED"; productName: string }
	| { status: "UNSUPPORTED_CATEGORY" }
	| { status: "MORE_INFORMATION_REQUIRED" };

type ValuationSummary = {
	acceptedComparableCount: number;
	evidenceCoverage: "LOCAL" | "NATIONAL";
	outlierCount: number;
};

export type ValuationResult =
	| ({
			status: "VALUATED";
			explanation: string;
			pros: string[];
			cons: string[];
			evidenceIds: string[];
			suggestedListingPriceIdr: number;
			observedMarketRangeIdr: { minimum: number; maximum: number };
			confidence: "HIGH" | "MEDIUM";
			confidenceReason: string;
	  } & ValuationSummary)
	| { status: "UNSUPPORTED_CATEGORY"; explanation: string }
	| {
			status: "MORE_INFORMATION_REQUIRED";
			explanation: string;
			missingFields: string[];
	  }
	| ({
			status: "INSUFFICIENT_EVIDENCE";
			explanation: string;
			evidenceIds: string[];
	  } & ValuationSummary)
	| { status: "SERVICE_FAILURE"; explanation: string };

export type RateLimitedResult = {
	status: "RATE_LIMITED";
	explanation: string;
};

export type PlatformValuationResult = ValuationResult | RateLimitedResult;

export type MockEvidence = {
	id: string;
	title: string;
	price: number;
	condition: string;
	city: string;
};

export type MockValuationResult = {
	status: "VALUATED";
	explanation: string;
	pros: string[];
	cons: string[];
	evidence: MockEvidence[];
	suggestedListingPriceIdr: number;
	observedMarketRangeIdr: { minimum: number; maximum: number };
	confidence: "MEDIUM";
	confidenceReason: string;
	acceptedComparableCount: number;
	evidenceCoverage: "NATIONAL";
	outlierCount: number;
	retrievedAtLabel: string;
};

export type ValuationGateway = {
	identifyImage(
		file: File,
		signal?: AbortSignal,
	): Promise<ImageIdentificationResult>;
};

export type ValuationRuntime =
	| { kind: "mock" }
	| { kind: "local-api"; gateway: ValuationGateway }
	| { kind: "unavailable"; reason: string };

export type ValuationDetails = {
	productName: string;
	productCondition: ProductCondition;
	productDescription: string;
	location: string;
};

export type ValuationOutcome =
	| { source: "mock"; result: MockValuationResult }
	| { source: "local-api"; result: PlatformValuationResult };

export type CorrectionRequest = {
	explanation: string;
	missingFields: string[];
};
