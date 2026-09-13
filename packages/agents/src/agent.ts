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
import { facebookMarketplaceSearch } from "./tools/facebook-search.js";
import { blibliSearch } from "./tools/blibli-search.js";
import { createWebTools } from "./tools/web-search.js";

const lens = new LensClient({
	optional: true,
	serviceName: "asli-segini-agent",
});
const tracing = lens.observer({ captureMode: "full" });

const logger = createPinoLogger({
	name: "asli-segini-agent",
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
			blibliSearch,
			facebookMarketplaceSearch,
			...(opts.additionalTools ?? []),
		],
		temperature: 0,
		maxTokens: 1_500,
		maxTurns: 6,
		observability: {
			observers,
			...(observers.lens ? { primaryTrace: "lens" } : {}),
		},
		...(opts.memory ? { memory: { store: opts.memory } } : {}),
	});
}

export function createValuationAgent(
	options: Omit<CreateAgentOptions, "agentId"> & { agentId?: string } = {},
) {
	return createAgent({
		...options,
		agentId: options.agentId ?? "asli-segini-valuation",
	});
}
