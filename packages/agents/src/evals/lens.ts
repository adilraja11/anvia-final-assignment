import { LensClient } from "@anvia/lens";

const client = new LensClient({
	optional: true,
	serviceName: "rag-agent-evals",
});

export const lensEval = {
	observer: client.observer({ captureMode: "safe" }),
	reporter: client.evalReporter({
		traceObserver: "lens",
		includePayloads: true,
		onMissingTrace: "emit",
	}),
	flush: () => client.flush(),
	shutdown: () => client.close(),
};
