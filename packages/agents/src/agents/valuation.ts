import { Agent, type AnyTool, type MemoryStore } from "@anvia/core";
import { extract } from "@anvia/core/extractor";
import { z } from "zod";
import { VALUATION_INSTRUCTIONS } from "../prompts/valuation-instructions.js";
import {
	type AgentRuntimeOptions,
	createAgentRuntimeOptions,
} from "../runtime.js";
import { blibliSearch } from "../tools/blibli-search.js";
import { facebookMarketplaceSearch } from "../tools/facebook-search.js";
import { createWebTools } from "../tools/web-search.js";

const explanationSchema = z.string().trim().min(1).max(2_000);
const explanationItemSchema = z.string().trim().min(1).max(300);
const evidenceIdSchema = z.string().trim().min(1).max(160);

export const VALUATION_RESULT_SCHEMA = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("SUCCESS"),
			explanation: explanationSchema,
			pros: z.array(explanationItemSchema).max(8),
			cons: z.array(explanationItemSchema).max(8),
			evidenceIds: z.array(evidenceIdSchema).max(30),
		})
		.strict(),
	z
		.object({
			status: z.literal("UNSUPPORTED_CATEGORY"),
			explanation: explanationSchema,
		})
		.strict(),
	z
		.object({
			status: z.literal("MORE_INFORMATION_REQUIRED"),
			explanation: explanationSchema,
			missingFields: z.array(explanationItemSchema).min(1).max(12),
		})
		.strict(),
	z
		.object({
			status: z.literal("INSUFFICIENT_EVIDENCE"),
			explanation: explanationSchema,
			evidenceIds: z.array(evidenceIdSchema).max(30),
		})
		.strict(),
	z
		.object({
			status: z.literal("SERVICE_FAILURE"),
			explanation: explanationSchema,
		})
		.strict(),
]);

export type ValuationResult = z.infer<typeof VALUATION_RESULT_SCHEMA>;

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

export async function generateValuationResult(
	agent: Agent,
	request: Parameters<Agent["generate"]>[0],
): Promise<ValuationResult> {
	const response = await agent.generate(request);

	if (response.type !== "response") {
		throw new Error("Valuation did not produce a response.");
	}

	const result = await extract({
		model: agent.model,
		text: response.output,
		instructions:
			"Ubah hasil agen valuasi ke schema yang diberikan tanpa menambahkan fakta, listing_id, harga, perhitungan, atau kesimpulan baru. Pertahankan status eksplisit. Gunakan SUCCESS hanya bila hasil selesai tanpa status kegagalan. Salin hanya listing_id yang dirujuk secara eksplisit. Untuk evidence yang tidak cukup, gunakan INSUFFICIENT_EVIDENCE; untuk kegagalan provider, gunakan SERVICE_FAILURE. Pertahankan penjelasan, pros, cons, dan field yang hilang dalam Bahasa Indonesia.",
		outputSchema: VALUATION_RESULT_SCHEMA,
		temperature: 0,
		maxTokens: 1_000,
		abortSignal: request.abortSignal,
	});

	return result.output;
}
