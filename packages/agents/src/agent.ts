import {
	AgentBuilder,
	type AnyTool,
	type CompletionModel,
	type MemoryStore,
} from "@anvia/core";
import type { AgentObserver } from "@anvia/core/observability";
import { lens } from "@anvia/lens";
import { createLoggerObserver, createPinoLogger } from "@anvia/logger";
import { BASE_INSTRUCTIONS } from "./prompts/base-instructions.js";
import { defaultModel } from "./providers/openai.js";
import { handbookSearch } from "./tools/handbook-search.js";
import { createWebTools } from "./tools/web-search.js";

const tracing = lens.createFromEnv({
	optional: true,
	serviceName: "rag-agent",
	captureMode: "full",
});

const logger = createPinoLogger({
	name: "rag-agent",
	level: "info",
	pinoOptions: {
		transport: {
			target: "pino-pretty",
			options: {
				colorize: process.stdout.isTTY,
				translateTime: "SYS:standard",
			},
		},
	},
});

const logging = createLoggerObserver(logger);

export function flushAgentTracing() {
	return tracing.flush();
}

interface CreateAgentOptions {
	agentId: string;
	model?: CompletionModel;
	additionalTools?: AnyTool[];
	additionalInstructions?: string[];
	memory?: MemoryStore;
	observers?: AgentObserver[];
	productionTracing?: boolean;
	includeWebTools?: boolean;
}

export function createAgent(opts: CreateAgentOptions) {
	const agent = new AgentBuilder(opts.agentId, opts.model ?? defaultModel)
		.instructions(BASE_INSTRUCTIONS)
		.tools([
			...(opts.includeWebTools ? createWebTools() : []),
			handbookSearch,
			...(opts.additionalTools ?? []),
		])
		.temperature(0)
		.maxTokens(180)
		.defaultMaxTurns(4)
		.observe(logging);

	if (opts.productionTracing !== false) {
		agent.observe(tracing);
	}

	for (const observer of opts.observers ?? []) {
		agent.observe(observer);
	}

	for (const instruction of opts.additionalInstructions ?? []) {
		agent.instructions(instruction);
	}

	if (opts.memory) {
		agent.memory(opts.memory);
	}

	return agent.build();
}
