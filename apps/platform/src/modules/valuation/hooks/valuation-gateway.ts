import type {
	ImageIdentificationResult,
	MockValuationResult,
	ValuationGateway,
	ValuationInput,
	ValuationResult,
	ValuationRuntime,
} from "../type";

type AgentApiErrorCode =
	| "INVALID_REQUEST"
	| "IMAGE_TOO_LARGE"
	| "UNSUPPORTED_IMAGE_TYPE"
	| "INVALID_IMAGE"
	| "REQUEST_CANCELLED"
	| "AGENT_SERVICE_FAILURE"
	| "MALFORMED_RESPONSE"
	| "NETWORK_FAILURE";

export class ValuationGatewayError extends Error {
	constructor(
		public readonly code: AgentApiErrorCode,
		message: string,
	) {
		super(message);
		this.name = "ValuationGatewayError";
	}
}

const apiErrorCodes = new Set<AgentApiErrorCode>([
	"INVALID_REQUEST",
	"IMAGE_TOO_LARGE",
	"UNSUPPORTED_IMAGE_TYPE",
	"INVALID_IMAGE",
	"REQUEST_CANCELLED",
	"AGENT_SERVICE_FAILURE",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
	value: Record<string, unknown>,
	required: string[],
): boolean {
	const actual = Object.keys(value).sort();
	const expected = [...required].sort();
	return (
		actual.length === expected.length &&
		actual.every((key, index) => key === expected[index])
	);
}

function isNonEmptyString(value: unknown, maximum = 2_000): value is string {
	return (
		typeof value === "string" &&
		value.trim().length > 0 &&
		value.length <= maximum
	);
}

function isStringArray(
	value: unknown,
	maximumItems: number,
	maximumLength: number,
): value is string[] {
	return (
		Array.isArray(value) &&
		value.length <= maximumItems &&
		value.every((item) => isNonEmptyString(item, maximumLength))
	);
}

function isBoundedInteger(
	value: unknown,
	minimum: number,
	maximum = Number.MAX_SAFE_INTEGER,
): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= minimum &&
		value <= maximum
	);
}

function isValuationSummary(value: Record<string, unknown>) {
	return (
		isBoundedInteger(value.acceptedComparableCount, 0, 30) &&
		(value.evidenceCoverage === "LOCAL" ||
			value.evidenceCoverage === "NATIONAL") &&
		isBoundedInteger(value.outlierCount, 0, 30)
	);
}

function malformedResponse(): never {
	throw new ValuationGatewayError(
		"MALFORMED_RESPONSE",
		"Respons layanan tidak dapat diverifikasi. Silakan coba lagi.",
	);
}

function parseImageIdentificationResult(
	value: unknown,
): ImageIdentificationResult {
	if (!isRecord(value) || typeof value.status !== "string")
		return malformedResponse();

	if (value.status === "SUPPORTED") {
		if (
			!hasExactKeys(value, ["status", "productName"]) ||
			!isNonEmptyString(value.productName, 160)
		)
			return malformedResponse();
		return { status: "SUPPORTED", productName: value.productName };
	}

	if (
		(value.status === "UNSUPPORTED_CATEGORY" ||
			value.status === "MORE_INFORMATION_REQUIRED") &&
		hasExactKeys(value, ["status"])
	)
		return { status: value.status };

	return malformedResponse();
}

function parseValuationResult(value: unknown): ValuationResult {
	if (!isRecord(value) || typeof value.status !== "string")
		return malformedResponse();

	if (value.status === "VALUATED") {
		const keys = [
			"status",
			"explanation",
			"pros",
			"cons",
			"evidenceIds",
			"suggestedListingPriceIdr",
			"observedMarketRangeIdr",
			"confidence",
			"confidenceReason",
			"acceptedComparableCount",
			"evidenceCoverage",
			"outlierCount",
		];
		const range = value.observedMarketRangeIdr;
		if (
			!hasExactKeys(value, keys) ||
			!isNonEmptyString(value.explanation) ||
			!isStringArray(value.pros, 8, 300) ||
			!isStringArray(value.cons, 8, 300) ||
			!isStringArray(value.evidenceIds, 30, 160) ||
			!isBoundedInteger(value.suggestedListingPriceIdr, 1) ||
			!isRecord(range) ||
			!hasExactKeys(range, ["minimum", "maximum"]) ||
			!isBoundedInteger(range.minimum, 1) ||
			!isBoundedInteger(range.maximum, 1) ||
			range.minimum > range.maximum ||
			(value.confidence !== "HIGH" && value.confidence !== "MEDIUM") ||
			!isNonEmptyString(value.confidenceReason) ||
			!isValuationSummary(value)
		)
			return malformedResponse();
		return value as ValuationResult;
	}

	if (value.status === "UNSUPPORTED_CATEGORY") {
		if (
			!hasExactKeys(value, ["status", "explanation"]) ||
			!isNonEmptyString(value.explanation)
		)
			return malformedResponse();
		return value as ValuationResult;
	}

	if (value.status === "MORE_INFORMATION_REQUIRED") {
		if (
			!hasExactKeys(value, ["status", "explanation", "missingFields"]) ||
			!isNonEmptyString(value.explanation) ||
			!isStringArray(value.missingFields, 12, 300) ||
			value.missingFields.length === 0
		)
			return malformedResponse();
		return value as ValuationResult;
	}

	if (value.status === "INSUFFICIENT_EVIDENCE") {
		const keys = [
			"status",
			"explanation",
			"evidenceIds",
			"acceptedComparableCount",
			"evidenceCoverage",
			"outlierCount",
		];
		if (
			!hasExactKeys(value, keys) ||
			!isNonEmptyString(value.explanation) ||
			!isStringArray(value.evidenceIds, 30, 160) ||
			!isValuationSummary(value)
		)
			return malformedResponse();
		return value as ValuationResult;
	}

	if (value.status === "SERVICE_FAILURE") {
		if (
			!hasExactKeys(value, ["status", "explanation"]) ||
			!isNonEmptyString(value.explanation)
		)
			return malformedResponse();
		return value as ValuationResult;
	}

	return malformedResponse();
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return malformedResponse();
	}
}

async function throwApiError(response: Response): Promise<never> {
	const body = await readJson(response);
	if (
		!isRecord(body) ||
		!hasExactKeys(body, ["error"]) ||
		!isRecord(body.error) ||
		!hasExactKeys(body.error, ["code", "message"]) ||
		typeof body.error.code !== "string" ||
		!apiErrorCodes.has(body.error.code as AgentApiErrorCode) ||
		!isNonEmptyString(body.error.message, 160)
	)
		return malformedResponse();

	throw new ValuationGatewayError(
		body.error.code as AgentApiErrorCode,
		body.error.message,
	);
}

async function request(
	input: string,
	init: RequestInit,
	signal?: AbortSignal,
): Promise<unknown> {
	try {
		const response = await fetch(input, {
			...init,
			signal,
			headers: { accept: "application/json", ...init.headers },
		});
		if (!response.ok) return await throwApiError(response);
		return await readJson(response);
	} catch (error) {
		if (error instanceof ValuationGatewayError) throw error;
		if (
			signal?.aborted ||
			(error instanceof DOMException && error.name === "AbortError")
		)
			throw new ValuationGatewayError(
				"REQUEST_CANCELLED",
				"Permintaan dibatalkan.",
			);
		throw new ValuationGatewayError(
			"NETWORK_FAILURE",
			"API lokal tidak dapat dihubungi. Pastikan layanan API sedang berjalan.",
		);
	}
}

export function createLocalValuationGateway(): ValuationGateway {
	return {
		async identifyImage(file, signal) {
			const formData = new FormData();
			formData.append("image", file);
			const body = await request(
				"/api/agents/image-identification",
				{ method: "POST", body: formData },
				signal,
			);
			if (!isRecord(body) || !hasExactKeys(body, ["result"]))
				return malformedResponse();
			return parseImageIdentificationResult(body.result);
		},
		async requestValuation(input, signal) {
			const productDescription = input.productDescription?.trim();
			const payload: ValuationInput = {
				productName: input.productName.trim(),
				productCondition: input.productCondition,
				...(productDescription ? { productDescription } : {}),
			};
			const body = await request(
				"/api/agents/valuation",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload),
				},
				signal,
			);
			if (!isRecord(body) || !hasExactKeys(body, ["result"]))
				return malformedResponse();
			return parseValuationResult(body.result);
		},
	};
}

export function getValuationRuntime(): ValuationRuntime {
	const configuredMode = import.meta.env.VITE_VALUATION_MODE?.trim();
	if (!configuredMode || configuredMode === "mock") return { kind: "mock" };

	if (configuredMode === "local-api") {
		if (import.meta.env.DEV)
			return { kind: "local-api", gateway: createLocalValuationGateway() };
		return {
			kind: "unavailable",
			reason:
				"Mode API lokal hanya tersedia melalui server pengembangan Vite dan tidak dapat digunakan pada build produksi.",
		};
	}

	return {
		kind: "unavailable",
		reason: `Mode valuasi "${configuredMode}" tidak dikenal. Gunakan "mock" atau "local-api".`,
	};
}

export function createMockValuationResult(): MockValuationResult {
	return {
		status: "VALUATED",
		suggestedListingPriceIdr: 8_400_000,
		observedMarketRangeIdr: { minimum: 8_000_000, maximum: 9_000_000 },
		confidence: "MEDIUM",
		confidenceReason:
			"Contoh ini memakai 14 listing mock yang sebanding untuk memperagakan hasil berkepercayaan menengah.",
		acceptedComparableCount: 14,
		evidenceCoverage: "NATIONAL",
		outlierCount: 1,
		explanation:
			"Contoh median harga listing yang diterima menghasilkan saran harga Rp8.400.000. Nilai ini hanya memperagakan tata letak dan bukan hasil pencarian marketplace langsung.",
		pros: [
			"Identitas model, edisi, dan kapasitas penyimpanan sudah cukup spesifik.",
			"Kelengkapan barang dapat membantu calon pembeli memahami isi penawaran.",
		],
		cons: [
			"Kondisi fisik tersembunyi dan fungsi perangkat belum diverifikasi.",
		],
		retrievedAtLabel: "Contoh waktu pengambilan: 12 Sep 2026, 18.20 WIB",
		evidence: [
			{
				id: "mock-blibli-01",
				title: "PlayStation 5 Slim Disc Edition 1 TB lengkap dus",
				price: 8_250_000,
				condition: "Baik",
				city: "Jakarta Selatan",
			},
			{
				id: "mock-blibli-02",
				title: "PS5 Slim Disc Edition 1 TB dengan controller",
				price: 8_000_000,
				condition: "Baik",
				city: "Bandung",
			},
			{
				id: "mock-blibli-03",
				title: "PlayStation 5 Slim Disc Edition garansi toko",
				price: 8_650_000,
				condition: "Seperti baru",
				city: "Surabaya",
			},
			{
				id: "mock-blibli-04",
				title: "PS5 Slim Disc Edition 1 TB unit normal",
				price: 8_400_000,
				condition: "Baik",
				city: "Jakarta Barat",
			},
		],
	};
}
