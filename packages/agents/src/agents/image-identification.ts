import {
	Agent,
	type ImageDetail,
	type ImagePart,
	type UserMessage,
} from "@anvia/core";
import { z } from "zod";
import { IMAGE_IDENTIFICATION_INSTRUCTIONS } from "../prompts/image-identification-instructions.js";
import {
	type AgentRuntimeOptions,
	createAgentRuntimeOptions,
} from "../runtime.js";

export const IMAGE_IDENTIFICATION_RESULT_SCHEMA = z.discriminatedUnion(
	"status",
	[
		z
			.object({
				status: z.literal("SUPPORTED"),
				productName: z.string().trim().min(1).max(160),
			})
			.strict(),
		z.object({ status: z.literal("UNSUPPORTED_CATEGORY") }).strict(),
		z.object({ status: z.literal("MORE_INFORMATION_REQUIRED") }).strict(),
	],
);

export type ImageIdentificationResult = z.infer<
	typeof IMAGE_IDENTIFICATION_RESULT_SCHEMA
>;

export const SANITIZED_PRODUCT_IMAGE_MEDIA_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

const sanitizedProductImageSchema = z
	.object({
		image: z.union([
			z.object({ type: z.literal("url"), url: z.url() }).strict(),
			z.object({ type: z.literal("data"), data: z.string().min(1) }).strict(),
		]),
		mediaType: z.enum(SANITIZED_PRODUCT_IMAGE_MEDIA_TYPES),
		detail: z.enum(["auto", "low", "high"]).optional(),
	})
	.strict();

export type SanitizedProductImage = {
	image: ImagePart["image"];
	mediaType: (typeof SANITIZED_PRODUCT_IMAGE_MEDIA_TYPES)[number];
	detail?: ImageDetail;
};

export interface CreateImageIdentificationAgentOptions
	extends Omit<AgentRuntimeOptions, "agentId"> {
	agentId?: string;
}

export function createImageIdentificationAgent(
	options: CreateImageIdentificationAgentOptions & {
		structuredOutput: false;
	},
): Agent;

export function createImageIdentificationAgent(
	options?: CreateImageIdentificationAgentOptions & {
		structuredOutput?: true;
	},
): Agent<ImageIdentificationResult>;

export function createImageIdentificationAgent(
	options: CreateImageIdentificationAgentOptions & {
		structuredOutput?: boolean;
	} = {},
) {
	const { structuredOutput = true, ...runtimeOptions } = options;
	const agentOptions = {
		...createAgentRuntimeOptions({
			...runtimeOptions,
			agentId: runtimeOptions.agentId ?? "asli-segini-image-identification",
		}),
		instructions: IMAGE_IDENTIFICATION_INSTRUCTIONS,
		tools: [],
		toolChoice: "none" as const,
		temperature: 0,
		maxTokens: 160,
		maxTurns: 1,
	};

	if (!structuredOutput) return new Agent(agentOptions);

	return new Agent<ImageIdentificationResult>({
		...agentOptions,
		outputSchema: IMAGE_IDENTIFICATION_RESULT_SCHEMA,
	});
}
