export const ASLI_SEGINI_AGENT_QUEUE_NAME = "job-asli-segini-agent";

export const connection = {
	host: process.env.REDIS_HOST?.trim() || "localhost",
	port: Number(process.env.REDIS_PORT ?? 16379),
	maxRetriesPerRequest: null,
};
