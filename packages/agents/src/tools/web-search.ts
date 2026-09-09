import { createTool } from "@anvia/core";
import { tavily } from "@tavily/core";
import { z } from "zod";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });

export function createWebTools() {
	const webSearch = createTool({
		name: "webSearch",
		description:
			"Use only for external or current information when the user explicitly asks for it. Never use for a Devscale handbook-policy question.",
		input: z.object({
			query: z.string().meta({ description: "The query to search" }),
		}),
		execute: ({ query }) => {
			return tavilyClient.search(query, {
				searchDepth: "basic",
				includeAnswer: true,
			});
		},
	});

	const webExtract = createTool({
		name: "webExtract",
		description:
			"Use only to extract external or current information after the user explicitly asks for it. Never use for a Devscale handbook-policy question.",
		input: z.object({
			url: z.url().meta({ description: "The URL to extract" }),
		}),
		execute: ({ url }) => tavilyClient.extract([url]),
	});

	return [webSearch, webExtract];
}
