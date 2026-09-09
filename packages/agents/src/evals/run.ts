import type { PromptResponse } from "@anvia/core";
import type { EvalMetric } from "@anvia/core/evals";
import {
	abstention,
	EvalOutcome,
	exactMatch,
	gEval,
	runEvalCli,
} from "@anvia/core/evals";
import { createAgent } from "../agent.js";
import { judgeModel } from "../providers/openai.js";
import { cases, type MetricName } from "./cases.js";
import { lensEval } from "./lens.js";

const agent = createAgent({
	agentId: "employee-handbook-eval",
	productionTracing: false,
	observers: [lensEval.observer],
});

async function runAgent(input: string): Promise<PromptResponse> {
	return agent.prompt(input).withCompletionRetries().send();
}

function casesFor(metric: MetricName) {
	return cases.filter((testCase) => testCase.metadata.metric === metric);
}

/** Read only handbookSearch tool-result payloads from this agent run. */
function handbookEvidenceFrom(messages: PromptResponse["messages"]): string[] {
	const evidence: string[] = [];
	for (const message of messages) {
		if (message.role !== "tool") continue;
		for (const content of message.content) {
			if (
				content.type !== "tool_result" ||
				content.toolName !== "handbookSearch"
			)
				continue;
			for (const item of content.content) {
				if (item.type !== "text") continue;
				try {
					const results: unknown = JSON.parse(item.text);
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
				} catch {
					// A malformed tool payload is not evidence.
				}
			}
		}
	}
	return [...new Set(evidence)];
}

const groundedAnswerQuality = gEval<string, PromptResponse, string>({
	name: "grounded-answer-quality",
	model: judgeModel,
	threshold: 0.8,
	evaluationParams: [
		"input",
		"actualOutput",
		"expectedOutput",
		"retrievalContext",
	],
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
	PromptResponse,
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
						content.type === "tool_result" &&
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
			abstention<string, PromptResponse, string>({
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
