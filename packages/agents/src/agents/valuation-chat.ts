import { Agent, type Document, type MemoryStore } from "@anvia/core";
import { VALUATION_CHAT_INSTRUCTIONS } from "../prompts/valuation-chat-instructions.js";
import {
	type AgentRuntimeOptions,
	createAgentRuntimeOptions,
} from "../runtime.js";

export interface CreateValuationChatAgentOptions
	extends Omit<AgentRuntimeOptions, "agentId"> {
	agentId?: string;
	grounding: Document;
	memory: MemoryStore;
}

export function createValuationChatAgent(
	options: CreateValuationChatAgentOptions,
) {
	return new Agent({
		...createAgentRuntimeOptions({
			...options,
			agentId: options.agentId ?? "asli-segini-valuation-chat",
		}),
		instructions: VALUATION_CHAT_INSTRUCTIONS,
		context: [options.grounding],
		memory: { store: options.memory },
		temperature: 0.2,
		maxTokens: 800,
		maxTurns: 1,
	});
}
