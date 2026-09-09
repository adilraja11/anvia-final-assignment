import { lens } from "@anvia/lens";

export const lensEval = lens.evals({
	serviceName: "rag-agent-evals",
	captureMode: "safe",
	includePayloads: true,
	onMissingTrace: "emit",
});
