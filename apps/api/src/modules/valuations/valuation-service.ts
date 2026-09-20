import { randomUUID } from "node:crypto";
import { valuationQueue } from "../../config/queue.js";
import {
	ProductCondition,
	type Valuation,
	ValuationConfidence,
	ValuationStatus,
} from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { reserveValuationUsage } from "./evidence-service.js";
import { limitations, SERVICE_FAILURE_EXPLANATION } from "./runner.js";
import type { CreateValuationRequest } from "./schema.js";

const RETENTION_MS = 24 * 60 * 60 * 1_000;
const POLL_AFTER_MS = 1_000;

export class ValuationServiceError extends Error {
	constructor(
		readonly code:
			| "IDEMPOTENCY_CONFLICT"
			| "RATE_LIMITED"
			| "SERVICE_UNAVAILABLE",
	) {
		super(code);
		this.name = "ValuationServiceError";
	}
}

const conditionToDatabase = {
	"Seperti baru": ProductCondition.LIKE_NEW,
	Baik: ProductCondition.GOOD,
	Cukup: ProductCondition.FAIR,
	Rusak: ProductCondition.DAMAGED,
} as const;

const conditionToPublic = {
	[ProductCondition.LIKE_NEW]: "Seperti baru",
	[ProductCondition.GOOD]: "Baik",
	[ProductCondition.FAIR]: "Cukup",
	[ProductCondition.DAMAGED]: "Rusak",
} as const;

type PublicCondition = keyof typeof conditionToDatabase;

function toDateString(date: Date) {
	return date.toISOString();
}

function expiresAt(createdAt: Date) {
	return new Date(createdAt.getTime() + RETENTION_MS);
}

function safeMoney(value: bigint | null) {
	if (value === null || value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
		throw new Error("Stored valuation money is invalid.");
	return Number(value);
}

function confidenceReason(confidence: ValuationConfidence) {
	return confidence === ValuationConfidence.HIGH
		? "Setidaknya 10 listing Blibli yang sebanding diterima."
		: "Tiga sampai sembilan listing Blibli yang sebanding diterima.";
}

function publicState(status: ValuationStatus) {
	if (status === ValuationStatus.QUEUED) return "QUEUED" as const;
	if (status === ValuationStatus.PROCESSING) return "RUNNING" as const;
	return "COMPLETED" as const;
}

function defaultStage(status: ValuationStatus) {
	return status === ValuationStatus.QUEUED ? "QUEUED" : "COMPLETED";
}

function summaryStage(status: ValuationStatus) {
	if (status === ValuationStatus.QUEUED) return "QUEUED" as const;
	if (status === ValuationStatus.PROCESSING) return null;
	return "COMPLETED" as const;
}

function summaryStatus(status: ValuationStatus) {
	if (
		status === ValuationStatus.QUEUED ||
		status === ValuationStatus.PROCESSING
	)
		return null;
	return status;
}

function storedResult(
	valuation: Valuation,
	acceptedComparableCount: number,
	evidenceRetrievedAt: Date | undefined,
) {
	const base = {
		limitations: limitations(),
		explanation: valuation.explanation || SERVICE_FAILURE_EXPLANATION,
	};
	switch (valuation.status) {
		case ValuationStatus.VALUATED: {
			if (
				valuation.confidence === null ||
				valuation.suggestedListingPriceIdr === null ||
				valuation.marketRangeMinimumIdr === null ||
				valuation.marketRangeMaximumIdr === null ||
				acceptedComparableCount < 3
			)
				throw new Error("Stored valuation result is incomplete.");
			return {
				status: "VALUATED" as const,
				productName: valuation.productName,
				productCondition: conditionToPublic[valuation.productCondition],
				suggestedListingPriceIdr: safeMoney(valuation.suggestedListingPriceIdr),
				observedMarketRangeIdr: {
					minimum: safeMoney(valuation.marketRangeMinimumIdr),
					maximum: safeMoney(valuation.marketRangeMaximumIdr),
				},
				confidence: valuation.confidence,
				confidenceReason: confidenceReason(valuation.confidence),
				acceptedComparableCount,
				evidenceCoverage: "NATIONAL" as const,
				evidenceRetrievedAt: toDateString(
					evidenceRetrievedAt ?? valuation.updatedAt,
				),
				...base,
				pros: valuation.pros,
				cons: valuation.cons,
			};
		}
		case ValuationStatus.UNSUPPORTED_CATEGORY:
			return { status: "UNSUPPORTED_CATEGORY" as const, ...base };
		case ValuationStatus.MORE_INFORMATION_REQUIRED:
			return {
				status: "MORE_INFORMATION_REQUIRED" as const,
				...base,
				missingFields: valuation.missingFields,
			};
		case ValuationStatus.INSUFFICIENT_EVIDENCE:
			return {
				status: "INSUFFICIENT_EVIDENCE" as const,
				...base,
				acceptedComparableCount,
				evidenceCoverage: "NATIONAL" as const,
			};
		case ValuationStatus.SERVICE_FAILURE:
			return { status: "SERVICE_FAILURE" as const, ...base };
		default:
			return null;
	}
}

function requestMatches(valuation: Valuation, input: CreateValuationRequest) {
	return (
		valuation.productName === input.productName &&
		valuation.productCondition ===
			conditionToDatabase[input.productCondition] &&
		valuation.productDescription === (input.productDescription ?? null)
	);
}

export function isValidIdempotencyKey(
	value: string | undefined,
): value is string {
	return !!value && /^[\x20-\x7E]{16,128}$/.test(value);
}

function createIdempotencyKey() {
	return randomUUID().replaceAll("-", "");
}

export async function cleanupExpiredValuations() {
	await prisma.valuation.deleteMany({
		where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
	});
}

export async function createOrReuseValuation(
	ownerKey: string,
	idempotencyKey: string | undefined,
	input: CreateValuationRequest,
) {
	if (idempotencyKey) {
		const existing = await prisma.valuation.findUnique({
			where: { ownerKey_idempotencyKey: { ownerKey, idempotencyKey } },
		});
		if (existing) {
			if (!requestMatches(existing, input))
				throw new ValuationServiceError("IDEMPOTENCY_CONFLICT");
			return existing;
		}
	}

	let usageAllowed: boolean;
	try {
		usageAllowed = await reserveValuationUsage();
	} catch {
		throw new ValuationServiceError("SERVICE_UNAVAILABLE");
	}
	if (!usageAllowed) throw new ValuationServiceError("RATE_LIMITED");

	let valuation: Valuation;
	try {
		valuation = await prisma.valuation.create({
			data: {
				ownerKey,
				idempotencyKey: idempotencyKey ?? createIdempotencyKey(),
				productName: input.productName,
				productCondition: conditionToDatabase[input.productCondition],
				productDescription: input.productDescription,
			},
		});
	} catch (error) {
		if (
			!(error instanceof Error) ||
			!error.message.includes("Unique constraint")
		)
			throw error;
		if (!idempotencyKey) throw error;
		const raced = await prisma.valuation.findUnique({
			where: { ownerKey_idempotencyKey: { ownerKey, idempotencyKey } },
		});
		if (!raced || !requestMatches(raced, input))
			throw new ValuationServiceError("IDEMPOTENCY_CONFLICT");
		return raced;
	}

	try {
		await valuationQueue.add(
			"valuation",
			{ valuationId: valuation.id, contractVersion: 1 },
			{ jobId: valuation.id },
		);
	} catch {
		valuation = await prisma.valuation.update({
			where: { id: valuation.id },
			data: {
				status: ValuationStatus.SERVICE_FAILURE,
				explanation: SERVICE_FAILURE_EXPLANATION,
			},
		});
	}
	return valuation;
}

export function createResponse(valuation: Valuation) {
	return {
		valuation: {
			id: valuation.id,
			state: publicState(valuation.status),
			stage: defaultStage(valuation.status),
			createdAt: toDateString(valuation.createdAt),
			expiresAt: toDateString(expiresAt(valuation.createdAt)),
			pollAfterMs: POLL_AFTER_MS,
		},
	};
}

export async function readValuation(ownerKey: string, valuationId: string) {
	const valuation = await prisma.valuation.findFirst({
		where: { id: valuationId, ownerKey },
		include: {
			_count: { select: { evidence: true } },
			evidence: {
				orderBy: { createdAt: "asc" },
				take: 1,
				select: { createdAt: true },
			},
		},
	});
	if (!valuation) return undefined;
	return {
		valuation,
		acceptedComparableCount: valuation._count.evidence,
		evidenceRetrievedAt: valuation.evidence[0]?.createdAt,
	};
}

export async function readValuations(ownerKey: string) {
	const valuations = await prisma.valuation.findMany({
		where: { ownerKey },
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		select: {
			id: true,
			productName: true,
			productCondition: true,
			productDescription: true,
			status: true,
			createdAt: true,
		},
	});

	return valuations.map((valuation) => summary(valuation));
}

function summary(valuation: {
	id: string;
	productName: string;
	productCondition: ProductCondition;
	productDescription: string | null;
	status: ValuationStatus;
	createdAt: Date;
}) {
	return {
		id: valuation.id,
		productName: valuation.productName,
		productCondition: conditionToPublic[valuation.productCondition],
		productDescription: valuation.productDescription,
		state: publicState(valuation.status),
		stage: summaryStage(valuation.status),
		status: summaryStatus(valuation.status),
		createdAt: toDateString(valuation.createdAt),
		expiresAt: toDateString(expiresAt(valuation.createdAt)),
	};
}

export function readResponse(
	valuation: Valuation,
	acceptedComparableCount: number,
	evidenceRetrievedAt: Date | undefined,
	stage: string | undefined,
) {
	const resolvedStage =
		stage === "QUEUED" ||
		stage === "VALIDATING_IDENTITY" ||
		stage === "FINDING_COMPARABLES" ||
		stage === "CALCULATING_PRICE" ||
		stage === "PREPARING_EXPLANATION" ||
		stage === "COMPLETED"
			? stage
			: defaultStage(valuation.status);
	return {
		valuation: {
			id: valuation.id,
			state: publicState(valuation.status),
			stage:
				valuation.status === ValuationStatus.QUEUED ||
				valuation.status === ValuationStatus.PROCESSING
					? resolvedStage
					: "COMPLETED",
			createdAt: toDateString(valuation.createdAt),
			expiresAt: toDateString(expiresAt(valuation.createdAt)),
			pollAfterMs: POLL_AFTER_MS,
		},
		result: storedResult(
			valuation,
			acceptedComparableCount,
			evidenceRetrievedAt,
		),
	};
}

export async function readEvidence(ownerKey: string, valuationId: string) {
	const valuation = await prisma.valuation.findFirst({
		where: { id: valuationId, ownerKey },
		select: {
			id: true,
			status: true,
			updatedAt: true,
			_count: { select: { evidence: true } },
			evidence: {
				orderBy: [{ productPrice: "asc" }, { id: "asc" }],
				select: {
					id: true,
					productName: true,
					productPrice: true,
					productLink: true,
					createdAt: true,
				},
			},
		},
	});
	if (!valuation) return undefined;
	if (valuation.status !== ValuationStatus.VALUATED) return { valuation };
	const evidenceRetrievedAt = valuation.evidence.reduce(
		(earliest, evidence) =>
			earliest < evidence.createdAt ? earliest : evidence.createdAt,
		valuation.updatedAt,
	);
	return {
		valuation,
		response: {
			valuationId: valuation.id,
			source: "BLIBLI" as const,
			acceptedComparableCount: valuation._count.evidence,
			evidenceCoverage: "NATIONAL" as const,
			retrievedAt: toDateString(evidenceRetrievedAt),
			listings: valuation.evidence.slice(0, 5).map((evidence) => ({
				id: evidence.id,
				title: evidence.productName,
				priceIdr: safeMoney(evidence.productPrice),
				listingUrl: evidence.productLink,
			})),
		},
	};
}

export type { PublicCondition };
