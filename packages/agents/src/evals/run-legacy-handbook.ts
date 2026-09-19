import type { AgentResponse, JsonValue, ToolResultOutput } from "@anvia/core";
import type { EvalMetric, EvalMetricArgs } from "@anvia/core/evals";
import {
	abstention,
	agentEvalTarget,
	EvalOutcome,
	exactMatch,
	gEval,
	runEvalCli,
} from "@anvia/core/evals";
import { createValuationAgent } from "../agent.js";
import { judgeModel } from "../providers/openai.js";
import { cases, type MetricName } from "./legacy-handbook-cases.js";
import { lensEval } from "./lens.js";

const agent = createValuationAgent({
	agentId: "employee-handbook-eval",
	productionTracing: false,
	observers: { lens: lensEval.observer },
});

const runAgent = agentEvalTarget<string>({
	agent,
	request: ({ input }) => ({ prompt: input, retries: {} }),
});

function casesFor(metric: MetricName) {
	return cases
		.filter((testCase) => testCase.metadata.metric === metric)
		.map((testCase) => ({
			...testCase,
			context: testCase.context ?? [],
			retrievalContext: testCase.retrievalContext ?? [],
		}));
}

/** Read only handbookSearch tool-result payloads from this agent run. */
function parseToolOutput(output: ToolResultOutput): JsonValue | undefined {
	if (output.type === "json") return output.value;
	if (output.type !== "text") return undefined;
	try {
		return JSON.parse(output.value) as JsonValue;
	} catch {
		return undefined;
	}
}

function handbookEvidenceFrom(messages: AgentResponse["messages"]): string[] {
	const evidence: string[] = [];
	for (const message of messages) {
		if (message.role !== "tool") continue;
		for (const content of message.content) {
			if (
				content.type !== "tool-result" ||
				content.toolName !== "handbookSearch"
			)
				continue;
			const results = parseToolOutput(content.output);
			if (!Array.isArray(results)) continue;
			for (const result of results) {
				if (
					typeof result === "object" &&
					result !== null &&
					"sourceText" in result &&
					typeof result.sourceText === "string" &&
					result.sourceText.trim()
				)
					evidence.push(result.sourceText);
			}
		}
	}
	return [...new Set(evidence)];
}

type HandbookEvidenceSelector = (
	args: EvalMetricArgs<string, AgentResponse, string>,
) => string[];

const groundedAnswerQuality = gEval<
	string,
	AgentResponse,
	string,
	"grounded-answer-quality",
	readonly ["input", "actualOutput", "expectedOutput", "retrievalContext"],
	undefined,
	undefined,
	HandbookEvidenceSelector
>({
	name: "grounded-answer-quality",
	model: judgeModel,
	threshold: 0.8,
	evaluationParams: [
		"input",
		"actualOutput",
		"expectedOutput",
		"retrievalContext",
	] as const,
	retrievalContext: ({ output }) => {
		const evidence = handbookEvidenceFrom(output.messages);
		return evidence.length > 0
			? evidence
			: ["No handbook evidence was retrieved in this run."];
	},
	evaluationSteps: [
		"Check that every requested fact is present and semantically matches the expected answer.",
		"Interpret the answer together with conditions already stated in the user input.",
		"Check that every factual addition is supported by the retrieved evidence and does not contradict it.",
		"Fail material omissions, reversed conditions, unsupported claims, or failure to follow the requested answer shape.",
	],
});

const handbookSearchInvocation: EvalMetric<
	string,
	AgentResponse,
	boolean,
	string,
	"handbook-search-invocation"
> = {
	name: "handbook-search-invocation",
	dataType: "BOOLEAN" as const,
	evaluate: ({ case: testCase, output }) => {
		if (testCase.metadata?.category !== "toolCall")
			return EvalOutcome.pass(true);
		const called = output.messages.some(
			(message) =>
				message.role === "tool" &&
				message.content.some(
					(content) =>
						content.type === "tool-result" &&
						content.toolName === "handbookSearch",
				),
		);
		return called
			? EvalOutcome.pass(true)
			: EvalOutcome.fail(false, {
					comment: "handbookSearch was not called",
				});
	},
};

try {
	await runEvalCli({
		name: "employee-handbook-grounded-answers",
		cases: casesFor("gEval"),
		target: runAgent,
		metrics: [groundedAnswerQuality],
		concurrency: 1,
		reporters: [lensEval.reporter],
	});

	await runEvalCli({
		name: "employee-handbook-exact-match",
		cases: casesFor("exactMatch"),
		target: runAgent,
		metrics: [exactMatch()],
		concurrency: 1,
		reporters: [lensEval.reporter],
	});

	await runEvalCli({
		name: "employee-handbook-abstention",
		cases: casesFor("abstention"),
		target: runAgent,
		metrics: [
			abstention<string, AgentResponse, string>({
				model: judgeModel,
				shouldAbstain: ({ case: testCase }) =>
					testCase.metadata?.shouldAbstain === true,
				context: ({ output }) => {
					const evidence = handbookEvidenceFrom(output.messages);
					return evidence.length > 0
						? evidence
						: ["No relevant handbook evidence was retrieved."];
				},
			}),
		],
		concurrency: 1,
		reporters: [lensEval.reporter],
	});

	await runEvalCli({
		name: "employee-handbook-tool-invocation",
		cases: cases.filter(
			(testCase) => testCase.metadata.category === "toolCall",
		),
		target: runAgent,
		metrics: [handbookSearchInvocation],
		concurrency: 1,
		reporters: [lensEval.reporter],
	});
} finally {
	await lensEval.flush();
	await lensEval.shutdown();
}
