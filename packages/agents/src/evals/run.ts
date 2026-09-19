import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
	Agent,
	type AgentResponse,
	createTool,
	Usage,
	type UserMessage,
} from "@anvia/core";
import type { EvalCase, EvalMetric, EvalTraceRef } from "@anvia/core/evals";
import { EvalOutcome, gEval, runEvalCli } from "@anvia/core/evals";
import { extract } from "@anvia/core/extractor";
import { z } from "zod";
import {
	createImageIdentificationAgent,
	IMAGE_IDENTIFICATION_RESULT_SCHEMA,
	type ImageIdentificationResult,
} from "../agents/image-identification.js";
import {
	VALUATION_RESULT_SCHEMA,
	type ValuationResult,
} from "../agents/valuation.js";
import type { MarketplaceToolResult } from "../marketplace.js";
import { VALUATION_INSTRUCTIONS } from "../prompts/valuation-instructions.js";
import { judgeModel } from "../providers/openai.js";
import { createAgentRuntimeOptions } from "../runtime.js";
import {
	cases,
	type DeterministicCheck,
	type ExpectedAgentBehavior,
	type ImageIdentificationEvalCase,
	type ImageIdentificationEvalInput,
	type MockComparable,
	type ValuationEvalCase,
	type ValuationEvalInput,
} from "./cases.js";
import { lensEval } from "./lens.js";

type ProductEvalOutput<Result> = {
	result: Result;
	rawText: string;
	usage: Usage;
	toolCallCount: number;
	trace?: EvalTraceRef;
};

type ImageEvalOutput = ProductEvalOutput<ImageIdentificationResult>;
type ValuationEvalOutput = ProductEvalOutput<ValuationResult>;

const evalDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = resolve(evalDirectory, "fixtures");

const imageCases = cases.filter(
	(testCase): testCase is ImageIdentificationEvalCase =>
		testCase.agent === "image-identification",
);

const valuationCases = cases.filter(
	(testCase): testCase is ValuationEvalCase => testCase.agent === "valuation",
);

const imageAgent = createImageIdentificationAgent({
	agentId: "asli-segini-image-identification-eval",
	productionLogging: false,
	productionTracing: false,
	observers: { lens: lensEval.observer },
});

function traceFrom(response: AgentResponse): EvalTraceRef | undefined {
	if (!response.trace?.traceId) return undefined;
	return {
		observer: response.trace.observer,
		traceId: response.trace.traceId,
		...(response.trace.observationId
			? { observationId: response.trace.observationId }
			: {}),
	};
}

function resultText(result: ImageIdentificationResult | ValuationResult) {
	if ("explanation" in result) {
		return [
			result.explanation,
			...("pros" in result ? result.pros : []),
			...("cons" in result ? result.cons : []),
			...("missingFields" in result ? result.missingFields : []),
			...("evidenceIds" in result ? result.evidenceIds : []),
		].join("\n");
	}
	return JSON.stringify(result);
}

function normalized(value: string) {
	return value
		.toLocaleLowerCase("id-ID")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function readPath(value: unknown, path: string): unknown {
	let current = value;
	for (const segment of path.split(".")) {
		if (typeof current !== "object" || current === null) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function sameValue(left: unknown, right: unknown) {
	return JSON.stringify(left) === JSON.stringify(right);
}

const missingFieldAliases: Record<string, string[]> = {
	brand: ["brand", "merek"],
	model: ["model"],
	condition: ["condition", "kondisi"],
	productCondition: ["product condition", "kondisi"],
};

function mentionsMissingField(result: unknown, field: string) {
	const text = normalized(JSON.stringify(result));
	const aliases = missingFieldAliases[field] ?? [field];
	return aliases.some((alias) => text.includes(normalized(alias)));
}

function evidenceIds(result: unknown): string[] {
	if (typeof result !== "object" || result === null) return [];
	const value = (result as Record<string, unknown>).evidenceIds;
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function escapedPattern(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNegatedMention(text: string, pattern: string) {
	const expression = new RegExp(
		`(?:^|\\s)(?:bukan|tidak|tanpa)(?:\\s+[a-z0-9]+){0,3}\\s+${escapedPattern(normalized(pattern))}(?=\\s|$)`,
	);
	return expression.test(text);
}

function evaluateChecks(
	checks: DeterministicCheck[],
	result: ImageIdentificationResult | ValuationResult,
) {
	const failures: string[] = [];
	const text = normalized(resultText(result));
	const resultEvidenceIds = evidenceIds(result);

	for (const check of checks) {
		switch (check.kind) {
			case "status":
				if (!check.allowed.includes(result.status)) {
					failures.push(
						`status ${result.status} is not one of ${check.allowed.join(", ")}`,
					);
				}
				break;
			case "field-equals": {
				const actual = readPath(result, check.path);
				if (!sameValue(actual, check.value)) {
					failures.push(
						`${check.path} was ${JSON.stringify(actual)}, expected ${JSON.stringify(check.value)}`,
					);
				}
				break;
			}
			case "field-one-of": {
				const actual = readPath(result, check.path);
				if (!check.values.some((value) => sameValue(actual, value))) {
					failures.push(
						`${check.path} was ${JSON.stringify(actual)}, expected one allowed value`,
					);
				}
				break;
			}
			case "field-absent":
				if (readPath(result, check.path) !== undefined) {
					failures.push(`${check.path} must be absent`);
				}
				break;
			case "mentions-missing-field":
				for (const field of check.fields) {
					if (!mentionsMissingField(result, field)) {
						failures.push(`missing field ${field} was not reported`);
					}
				}
				break;
			case "evidence-subset": {
				const unexpected = resultEvidenceIds.filter(
					(id) => !check.allowedIds.includes(id),
				);
				if (unexpected.length > 0) {
					failures.push(`unexpected evidence IDs: ${unexpected.join(", ")}`);
				}
				break;
			}
			case "evidence-includes": {
				const missing = check.requiredIds.filter(
					(id) => !resultEvidenceIds.includes(id),
				);
				if (missing.length > 0) {
					failures.push(`required evidence IDs missing: ${missing.join(", ")}`);
				}
				break;
			}
			case "evidence-excludes": {
				const included = check.excludedIds.filter((id) =>
					resultEvidenceIds.includes(id),
				);
				if (included.length > 0) {
					failures.push(`excluded evidence IDs cited: ${included.join(", ")}`);
				}
				break;
			}
			case "text-excludes": {
				const included = check.patterns.filter((pattern) => {
					const normalizedPattern = normalized(pattern);
					return (
						text.includes(normalizedPattern) && !isNegatedMention(text, pattern)
					);
				});
				if (included.length > 0) {
					failures.push(`forbidden claims found: ${included.join(", ")}`);
				}
				break;
			}
			case "text-includes-concept":
				if (
					!check.concepts.some((concept) => text.includes(normalized(concept)))
				) {
					failures.push(
						`none of the required concepts were found: ${check.concepts.join(", ")}`,
					);
				}
				break;
		}
	}

	return failures;
}

async function imageTarget(
	input: ImageIdentificationEvalInput,
	testCase: EvalCase<ImageIdentificationEvalInput, ExpectedAgentBehavior>,
	context?: { signal: AbortSignal },
): Promise<ImageEvalOutput> {
	const fixturePath = resolve(evalDirectory, input.fixture.path);
	if (!fixturePath.startsWith(`${fixtureDirectory}${sep}`)) {
		throw new Error(
			`Fixture path escapes the eval fixture directory: ${testCase.id}`,
		);
	}

	const bytes = await readFile(fixturePath);
	const actualHash = createHash("sha256").update(bytes).digest("hex");
	if (actualHash !== input.fixture.sha256) {
		throw new Error(
			`Fixture hash mismatch for ${testCase.id}: expected ${input.fixture.sha256}, received ${actualHash}`,
		);
	}

	const message: UserMessage = {
		role: "user",
		content: [
			{
				type: "image",
				image: { type: "data", data: bytes.toString("base64") },
				mediaType: input.fixture.mediaType,
				detail: "high",
			},
		],
	};
	const response = await imageAgent.generate({
		messages: [message],
		abortSignal: context?.signal,
		trace: {
			name: "image-identification-eval",
			metadata: { caseId: testCase.id },
			promptRef: { name: "image-identification", version: 1 },
		},
	});
	if (response.type !== "response") {
		throw new Error(
			`Image agent did not return a response for ${testCase.id}.`,
		);
	}

	const extraction = await extract({
		model: imageAgent.model,
		text: response.output,
		instructions:
			"Ubah hasil identifikasi gambar ke schema yang diberikan. Pertahankan status dan productName eksplisit bila tersedia. Jangan pernah menyimpulkan productName; jika produk yang didukung tidak dapat dinamai, gunakan MORE_INFORMATION_REQUIRED.",
		outputSchema: IMAGE_IDENTIFICATION_RESULT_SCHEMA,
		temperature: 0,
		maxTokens: 160,
		abortSignal: context?.signal,
	});
	const trace = traceFrom(response);
	return {
		result: extraction.output,
		rawText: response.output,
		usage: Usage.add(response.usage, extraction.usage),
		toolCallCount: 0,
		...(trace ? { trace } : {}),
	};
}

const blibliSearchInputSchema = z
	.object({
		searchTerms: z.array(z.string().trim().min(1).max(160)).min(1).max(3),
		location: z.string().trim().min(1).max(120).optional(),
	})
	.strict();

function comparableAttributes(comparable: MockComparable) {
	const attributes: Record<string, string> = {};
	for (const [key, value] of Object.entries(comparable.identity)) {
		if (value === undefined || key === "category") continue;
		attributes[key] = Array.isArray(value) ? value.join(", ") : String(value);
	}
	return attributes;
}

function mockToolResult(
	input: ValuationEvalInput,
	searchTerms: string[],
	location?: string,
): MarketplaceToolResult {
	const mockEvidence = input.mockEvidence;
	return {
		status: "SUCCESS",
		provider: "BLIBLI",
		source: "BLIBLI",
		search_terms: searchTerms,
		region: "Indonesia",
		...(location ? { location } : {}),
		fetched_at:
			mockEvidence.status === "SUCCESS"
				? mockEvidence.fetchedAt
				: "2026-09-19T00:00:00.000Z",
		cache_hit: false,
		evidence:
			mockEvidence.status === "SUCCESS"
				? mockEvidence.comparables.map((comparable) => ({
						source: "BLIBLI" as const,
						listing_id: comparable.id,
						listing_url: comparable.provenance.listingUrl,
						title: comparable.title,
						price_idr: comparable.price.amount,
						condition: comparable.condition,
						...(comparable.city ? { city: comparable.city } : {}),
						product_attributes: comparableAttributes(comparable),
						listing_status: comparable.provenance.listingStatus,
						posted_at: comparable.observedAt,
						scraped_at: mockEvidence.fetchedAt,
						match_score: 1,
					}))
				: [],
		rejected: [],
	};
}

function valuationPrompt(input: ValuationEvalInput) {
	return [
		"Analisis input produk terstruktur berikut sesuai kontrak valuasi.",
		"Gunakan hanya tool Blibli yang tersedia bila identitas dan kondisi sudah lengkap.",
		JSON.stringify({
			identity: input.identity,
			productCondition: input.productCondition,
			listingContext: input.listingContext,
			location: input.location,
		}),
	].join("\n");
}

async function valuationTarget(
	input: ValuationEvalInput,
	testCase: EvalCase<ValuationEvalInput, ExpectedAgentBehavior>,
	context?: { signal: AbortSignal },
): Promise<ValuationEvalOutput> {
	let toolCallCount = 0;
	const mockBlibliSearch = createTool({
		name: "blibliSearch",
		description:
			"Cari listing Blibli dengan identitas produk yang sama. Data evaluasi dikontrol dan tidak memakai jaringan.",
		inputSchema: blibliSearchInputSchema,
		execute: async ({ searchTerms, location }) => {
			toolCallCount += 1;
			return mockToolResult(input, searchTerms, location);
		},
	});
	const agent = new Agent({
		...createAgentRuntimeOptions({
			agentId: `asli-segini-valuation-eval-${testCase.id.toLowerCase()}`,
			productionLogging: false,
			productionTracing: false,
			observers: { lens: lensEval.observer },
		}),
		instructions: VALUATION_INSTRUCTIONS,
		tools: [mockBlibliSearch],
		temperature: 0,
		maxTokens: 1_500,
		maxTurns: 2,
	});
	const response = await agent.generate({
		prompt: valuationPrompt(input),
		abortSignal: context?.signal,
		trace: {
			name: "valuation-eval",
			metadata: { caseId: testCase.id },
			promptRef: { name: "valuation", version: 1 },
		},
	});
	if (response.type !== "response") {
		throw new Error(
			`Valuation agent did not return a response for ${testCase.id}.`,
		);
	}

	const extraction = await extract({
		model: agent.model,
		text: response.output,
		instructions:
			"Ubah hasil agen valuasi ke schema yang diberikan tanpa menambahkan fakta, listing_id, harga, perhitungan, atau kesimpulan baru. Pertahankan status eksplisit. Gunakan SUCCESS hanya bila hasil selesai tanpa status kegagalan. Salin hanya listing_id yang dirujuk secara eksplisit. Untuk evidence yang tidak cukup, gunakan INSUFFICIENT_EVIDENCE; untuk kegagalan provider, gunakan SERVICE_FAILURE. Pertahankan penjelasan, pros, cons, dan field yang hilang dalam Bahasa Indonesia.",
		outputSchema: VALUATION_RESULT_SCHEMA,
		temperature: 0,
		maxTokens: 1_000,
		abortSignal: context?.signal,
	});
	const trace = traceFrom(response);
	return {
		result: extraction.output,
		rawText: response.output,
		usage: Usage.add(response.usage, extraction.usage),
		toolCallCount,
		...(trace ? { trace } : {}),
	};
}

const imageSchemaMetric: EvalMetric<
	ImageIdentificationEvalInput,
	ImageEvalOutput,
	boolean,
	ExpectedAgentBehavior,
	"schema"
> = {
	name: "schema",
	required: true,
	dataType: "BOOLEAN",
	evaluate: ({ output }) => {
		const parsed = IMAGE_IDENTIFICATION_RESULT_SCHEMA.safeParse(output.result);
		return parsed.success
			? EvalOutcome.pass(true)
			: EvalOutcome.fail(false, {
					comment: z.prettifyError(parsed.error),
				});
	},
};

const imageDeterministicMetric: EvalMetric<
	ImageIdentificationEvalInput,
	ImageEvalOutput,
	boolean,
	ExpectedAgentBehavior,
	"deterministic"
> = {
	name: "deterministic",
	required: true,
	dataType: "BOOLEAN",
	evaluate: ({ case: testCase, output }) => {
		const productCase = testCase as ImageIdentificationEvalCase;
		const failures = evaluateChecks(
			productCase.deterministicChecks,
			output.result,
		);
		return failures.length === 0
			? EvalOutcome.pass(true)
			: EvalOutcome.fail(false, { comment: failures.join("; ") });
	},
};

const valuationSchemaMetric: EvalMetric<
	ValuationEvalInput,
	ValuationEvalOutput,
	boolean,
	ExpectedAgentBehavior,
	"schema"
> = {
	name: "schema",
	required: true,
	dataType: "BOOLEAN",
	evaluate: ({ output }) => {
		const parsed = VALUATION_RESULT_SCHEMA.safeParse(output.result);
		return parsed.success
			? EvalOutcome.pass(true)
			: EvalOutcome.fail(false, {
					comment: z.prettifyError(parsed.error),
				});
	},
};

const valuationDeterministicMetric: EvalMetric<
	ValuationEvalInput,
	ValuationEvalOutput,
	boolean,
	ExpectedAgentBehavior,
	"deterministic"
> = {
	name: "deterministic",
	required: true,
	dataType: "BOOLEAN",
	evaluate: ({ case: testCase, output }) => {
		const productCase = testCase as ValuationEvalCase;
		const failures = evaluateChecks(
			productCase.deterministicChecks,
			output.result,
		);
		const suppliedIds =
			productCase.input.mockEvidence.status === "SUCCESS"
				? productCase.input.mockEvidence.comparables.map((item) => item.id)
				: [];
		const fabricatedIds = evidenceIds(output.result).filter(
			(id) => !suppliedIds.includes(id),
		);
		if (fabricatedIds.length > 0) {
			failures.push(`fabricated evidence IDs: ${fabricatedIds.join(", ")}`);
		}

		if (
			productCase.input.mockEvidence.status === "NOT_REQUESTED" &&
			output.toolCallCount !== 0
		) {
			failures.push(
				"blibliSearch was called before required input was complete",
			);
		}
		if (
			productCase.input.mockEvidence.status === "SUCCESS" &&
			output.toolCallCount !== 1
		) {
			failures.push(
				`blibliSearch call count was ${output.toolCallCount}, expected exactly 1`,
			);
		}

		return failures.length === 0
			? EvalOutcome.pass(true)
			: EvalOutcome.fail(false, { comment: failures.join("; ") });
	},
};

const valuationRubricBase = gEval<
	ValuationEvalInput,
	ValuationEvalOutput,
	ExpectedAgentBehavior,
	"rubric"
>({
	name: "rubric",
	model: judgeModel,
	required: true,
	threshold: 0.8,
	evaluationParams: ["input", "actualOutput", "expectedOutput"],
	input: ({ case: testCase }) => JSON.stringify(testCase.input),
	actual: ({ output }) => JSON.stringify(output.result),
	evaluationSteps: [
		"Check that the Bahasa Indonesia explanation clearly communicates the case's named uncertainty, conflict, evidence limitation, or source distinction.",
		"Do not require exact wording; judge whether the meaning matches the expected behavior.",
		"Fail unsupported certainty, fabricated evidence or provenance, and any authoritative AI-calculated final price.",
	],
});

const valuationRubricMetric: EvalMetric<
	ValuationEvalInput,
	ValuationEvalOutput,
	number,
	ExpectedAgentBehavior,
	"rubric"
> = {
	...valuationRubricBase,
	evaluate: (args) => {
		const productCase = args.case as ValuationEvalCase;
		if (!productCase.graders.includes("rubric")) {
			return EvalOutcome.pass(1, {
				comment: "Rubric grader is not requested for this case.",
			});
		}
		return valuationRubricBase.evaluate(args);
	},
};

try {
	await runEvalCli({
		name: "image-identification-baseline-v1",
		run: {
			datasetName: "asli-segini-image-identification",
			datasetVersion: "v1",
			promptRef: { name: "image-identification", version: 1 },
			metadata: { agent: "image-identification", caseCount: imageCases.length },
		},
		cases: imageCases,
		target: imageTarget,
		metrics: [imageSchemaMetric, imageDeterministicMetric],
		concurrency: 1,
		caseTimeoutMs: 120_000,
		targetUsage: ({ output }) => output.usage,
		reporters: [lensEval.reporter],
	});

	await runEvalCli({
		name: "valuation-baseline-v1",
		run: {
			datasetName: "asli-segini-valuation",
			datasetVersion: "v1",
			promptRef: { name: "valuation", version: 1 },
			metadata: { agent: "valuation", caseCount: valuationCases.length },
		},
		cases: valuationCases,
		target: valuationTarget,
		metrics: [
			valuationSchemaMetric,
			valuationDeterministicMetric,
			valuationRubricMetric,
		],
		concurrency: 1,
		caseTimeoutMs: 120_000,
		targetUsage: ({ output }) => output.usage,
		reporters: [lensEval.reporter],
	});
} finally {
	await lensEval.flush();
	await lensEval.shutdown();
}
