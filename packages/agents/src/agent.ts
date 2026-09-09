import {
	Agent,
	type AnyTool,
	type CompletionModel,
	type MemoryStore,
} from "@anvia/core";
import type { AgentObserver } from "@anvia/core/observability";
import { LensClient } from "@anvia/lens";
import { createLoggerObserver, createPinoLogger } from "@anvia/logger";
import { BASE_INSTRUCTIONS } from "./prompts/base-instructions.js";
import { defaultModel } from "./providers/openai.js";
import { handbookSearch } from "./tools/handbook-search.js";
import { createWebTools } from "./tools/web-search.js";

const lens = new LensClient({
	optional: true,
	serviceName: "rag-agent",
});
const tracing = lens.observer({ captureMode: "full" });

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

const logging = createLoggerObserver({ logger });

export function flushAgentTracing() {
	return lens.flush();
}

interface CreateAgentOptions {
	agentId: string;
	model?: CompletionModel;
	additionalTools?: AnyTool[];
	additionalInstructions?: string[];
	memory?: MemoryStore;
	observers?: Record<string, AgentObserver>;
	productionTracing?: boolean;
	includeWebTools?: boolean;
}

export function createAgent(opts: CreateAgentOptions) {
	const includeProductionTracing = opts.productionTracing !== false;
	const observers: Record<string, AgentObserver> = {
		logger: logging,
		...(includeProductionTracing ? { lens: tracing } : {}),
		...opts.observers,
	};

	return new Agent({
		id: opts.agentId,
		model: opts.model ?? defaultModel,
		instructions: [
			BASE_INSTRUCTIONS,
			...(opts.additionalInstructions ?? []),
		].join("\n\n"),
		tools: [
			...(opts.includeWebTools ? createWebTools() : []),
			handbookSearch,
			...(opts.additionalTools ?? []),
		],
		temperature: 0,
		maxTokens: 180,
		maxTurns: 4,
		observability: {
			observers,
			...(observers.lens ? { primaryTrace: "lens" } : {}),
		},
		...(opts.memory ? { memory: { store: opts.memory } } : {}),
	});
}
