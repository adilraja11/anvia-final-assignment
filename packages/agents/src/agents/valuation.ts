import { Agent, type AnyTool, type MemoryStore } from "@anvia/core";
import { VALUATION_INSTRUCTIONS } from "../prompts/valuation-instructions.js";
import {
	type AgentRuntimeOptions,
	createAgentRuntimeOptions,
} from "../runtime.js";
import { blibliSearch } from "../tools/blibli-search.js";
import { facebookMarketplaceSearch } from "../tools/facebook-search.js";
import { createWebTools } from "../tools/web-search.js";

export interface CreateValuationAgentOptions
	extends Omit<AgentRuntimeOptions, "agentId"> {
	agentId?: string;
	additionalTools?: AnyTool[];
	additionalInstructions?: string[];
	memory?: MemoryStore;
	includeWebTools?: boolean;
}

export function createValuationAgent(
	options: CreateValuationAgentOptions = {},
) {
	return new Agent({
		...createAgentRuntimeOptions({
			...options,
			agentId: options.agentId ?? "asli-segini-valuation",
		}),
		instructions: [
			VALUATION_INSTRUCTIONS,
			...(options.additionalInstructions ?? []),
		].join("\n\n"),
		tools: [
			...(options.includeWebTools ? createWebTools() : []),
			blibliSearch,
			facebookMarketplaceSearch,
			...(options.additionalTools ?? []),
		],
		temperature: 0,
		maxTokens: 1_500,
		maxTurns: 6,
		...(options.memory ? { memory: { store: options.memory } } : {}),
	});
}
