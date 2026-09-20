import type {
	ProductCondition,
	ValuationInput,
} from "#/modules/valuation/type";
import { api, retryAnonymousSessionRequired } from "../api";
import { decodeResponse } from "./errors";
export type ValuationStage =
	| "QUEUED"
	| "VALIDATING_IDENTITY"
	| "FINDING_COMPARABLES"
	| "CALCULATING_PRICE"
	| "PREPARING_EXPLANATION"
	| "COMPLETED";
export type ValuationState = "QUEUED" | "RUNNING" | "COMPLETED";
type Limitations = { limitations: string[] };
export type ServerValuationResult =
	| ({
			status: "VALUATED";
			productName: string;
			productCondition: ProductCondition;
			suggestedListingPriceIdr: number;
			observedMarketRangeIdr: { minimum: number; maximum: number };
			confidence: "HIGH" | "MEDIUM";
			confidenceReason: string;
			acceptedComparableCount: number;
			evidenceCoverage: "NATIONAL";
			evidenceRetrievedAt: string;
			explanation: string;
			pros: string[];
			cons: string[];
	  } & Limitations)
	| ({ status: "UNSUPPORTED_CATEGORY"; explanation: string } & Limitations)
	| ({
			status: "MORE_INFORMATION_REQUIRED";
			explanation: string;
			missingFields: string[];
	  } & Limitations)
	| ({
			status: "INSUFFICIENT_EVIDENCE";
			explanation: string;
			acceptedComparableCount: number;
			evidenceCoverage: "NATIONAL";
	  } & Limitations)
	| ({ status: "SERVICE_FAILURE"; explanation: string } & Limitations);
export type ValuationProgress = {
	id: string;
	state: ValuationState;
	stage: ValuationStage;
	createdAt: string;
	expiresAt: string;
	pollAfterMs: number;
};
export type ValuationRead = {
	valuation: ValuationProgress;
	result: ServerValuationResult | null;
};
export type ValuationSummary = {
	id: string;
	productName: string;
	productCondition: ProductCondition;
	productDescription: string | null;
	state: ValuationState;
	stage: ValuationStage | null;
	status: ServerValuationResult["status"] | null;
	createdAt: string;
	expiresAt: string;
};
export type ValuationEvidence = {
	valuationId: string;
	source: "BLIBLI";
	acceptedComparableCount: number;
	evidenceCoverage: "NATIONAL";
	retrievedAt: string;
	listings: {
		id: string;
		title: string;
		priceIdr: number;
		listingUrl: string;
	}[];
};
function record(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new Error("Respons layanan tidak dapat diverifikasi.");
	return value as Record<string, unknown>;
}
function progress(value: unknown): ValuationProgress {
	const item = record(value);
	if (
		typeof item.id !== "string" ||
		!["QUEUED", "RUNNING", "COMPLETED"].includes(String(item.state)) ||
		![
			"QUEUED",
			"VALIDATING_IDENTITY",
			"FINDING_COMPARABLES",
			"CALCULATING_PRICE",
			"PREPARING_EXPLANATION",
			"COMPLETED",
		].includes(String(item.stage)) ||
		typeof item.pollAfterMs !== "number"
	)
		throw new Error("Respons layanan tidak dapat diverifikasi.");
	return item as unknown as ValuationProgress;
}
function decodeRead(value: unknown): ValuationRead {
	const body = record(value);
	const valuation = progress(body.valuation);
	if (
		body.result !== null &&
		(!record(body.result).status ||
			!Array.isArray(record(body.result).limitations))
	)
		throw new Error("Respons layanan tidak dapat diverifikasi.");
	return { valuation, result: body.result as ServerValuationResult | null };
}
function decodeSummaries(value: unknown): ValuationSummary[] {
	const body = record(value);
	if (!Array.isArray(body.valuations))
		throw new Error("Respons daftar valuasi tidak dapat diverifikasi.");
	return body.valuations.map((item) => {
		const summary = record(item);
		if (
			typeof summary.id !== "string" ||
			typeof summary.productName !== "string" ||
			!["Seperti baru", "Baik", "Cukup", "Rusak"].includes(
				String(summary.productCondition),
			) ||
			!["QUEUED", "RUNNING", "COMPLETED"].includes(String(summary.state)) ||
			typeof summary.createdAt !== "string" ||
			typeof summary.expiresAt !== "string"
		)
			throw new Error("Respons daftar valuasi tidak dapat diverifikasi.");
		return summary as unknown as ValuationSummary;
	});
}
export async function listValuations(
	signal?: AbortSignal,
): Promise<ValuationSummary[]> {
	return decodeSummaries(
		await decodeResponse(
			await api.api.valuations.$get(undefined, { init: { signal } }),
			signal,
		),
	);
}
export async function createValuation(
	input: ValuationInput,
	idempotencyKey: string,
	signal?: AbortSignal,
): Promise<ValuationProgress> {
	const body = record(
		await decodeResponse(
			await retryAnonymousSessionRequired(
				() =>
					api.api.valuations.$post(
						{
							json: input,
							header: { "idempotency-key": idempotencyKey },
						} as never,
						{ init: { signal } },
					),
				signal,
			),
			signal,
		),
	);
	return progress(body.valuation);
}
export async function readValuation(
	id: string,
	signal?: AbortSignal,
): Promise<ValuationRead> {
	return decodeRead(
		await decodeResponse(
			await api.api.valuations[":valuationId"].$get(
				{ param: { valuationId: id } } as never,
				{ init: { signal } },
			),
			signal,
		),
	);
}
export async function readEvidence(
	id: string,
	signal?: AbortSignal,
): Promise<ValuationEvidence> {
	const body = record(
		await decodeResponse(
			await api.api.valuations[":valuationId"].evidence.$get(
				{ param: { valuationId: id } } as never,
				{ init: { signal } },
			),
			signal,
		),
	);
	if (!Array.isArray(body.listings))
		throw new Error("Respons layanan tidak dapat diverifikasi.");
	return body as unknown as ValuationEvidence;
}
