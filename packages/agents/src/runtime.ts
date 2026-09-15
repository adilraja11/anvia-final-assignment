import type { CompletionModel } from "@anvia/core";
import type { AgentObserver } from "@anvia/core/observability";
import { LensClient } from "@anvia/lens";
import { createLoggerObserver, createPinoLogger } from "@anvia/logger";
import { defaultModel } from "./providers/openai.js";

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

export interface AgentRuntimeOptions {
	agentId: string;
	model?: CompletionModel;
	observers?: Record<string, AgentObserver>;
	productionLogging?: boolean;
	productionTracing?: boolean;
}

export function createAgentRuntimeOptions(options: AgentRuntimeOptions) {
	const includeProductionLogging = options.productionLogging !== false;
	const includeProductionTracing = options.productionTracing !== false;
	const observers: Record<string, AgentObserver> = {
		...(includeProductionLogging ? { logger: logging } : {}),
		...(includeProductionTracing ? { lens: tracing } : {}),
		...options.observers,
	};

	return {
		id: options.agentId,
		model: options.model ?? defaultModel,
		observability: {
			observers,
			...(observers.lens ? { primaryTrace: "lens" } : {}),
		},
	};
}

export function flushAgentTracing() {
	return lens.flush();
}
