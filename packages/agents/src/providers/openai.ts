import { OpenAIClient } from "@anvia/openai";

const openai = new OpenAIClient({
	apiKey: process.env.OPENROUTER_API_KEY,
	baseUrl: process.env.OPENROUTER_BASE_URL,
});

export const defaultModel = openai.completionModel(
	process.env.OPENAI_MODEL ?? "gpt-5-mini",
);

export const judgeModel = openai.completionModel(
	process.env.OPENAI_JUDGE_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5-mini",
);
