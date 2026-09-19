import { Worker } from "bullmq";
import {
	ASLI_SEGINI_AGENT_QUEUE_NAME,
	connection,
} from "./config/queue-connection.js";
import { ValuationStatus } from "./generated/prisma/client.js";
import { prisma } from "./lib/prisma.js";
import {
	failStaleValuations,
	markServiceFailure,
	runValuation,
} from "./modules/valuations/runner.js";
import { valuationJobDataSchema } from "./modules/valuations/schema.js";
import { cleanupExpiredValuations } from "./modules/valuations/valuation-service.js";

const WORKER_TIMEOUT_MS = 120_000;

function elapsedMs(startedAt: number) {
	return Date.now() - startedAt;
}

function workerLog(
	event: string,
	fields: Record<string, string | number | boolean | undefined>,
) {
	console.log(
		JSON.stringify({
			component: "valuation-worker",
			event,
			...fields,
		}),
	);
}

function failureCategory(error: unknown, abortSignal: AbortSignal) {
	if (abortSignal.aborted) return "TIMEOUT";
	if (error instanceof Error && error.name === "AbortError") return "ABORTED";
	return "UNEXPECTED_ERROR";
}

export const worker = new Worker(
	ASLI_SEGINI_AGENT_QUEUE_NAME,
	async (job) => {
		const parsed = valuationJobDataSchema.safeParse(job.data);
		if (!parsed.success) {
			workerLog("job_rejected", { reason: "INVALID_JOB_DATA" });
			return;
		}
		const startedAt = Date.now();
		const valuationId = parsed.data.valuationId;
		let abortSignal: AbortSignal | undefined;
		workerLog("job_received", { valuationId });
		try {
			await failStaleValuations();
			const claimed = await prisma.valuation.updateMany({
				where: {
					id: valuationId,
					status: ValuationStatus.QUEUED,
				},
				data: { status: ValuationStatus.PROCESSING },
			});
			if (claimed.count !== 1) {
				workerLog("job_skipped", {
					valuationId,
					reason: "NOT_QUEUED",
					elapsedMs: elapsedMs(startedAt),
				});
				return;
			}
			workerLog("job_claimed", {
				valuationId,
				elapsedMs: elapsedMs(startedAt),
			});
			await job.updateProgress("VALIDATING_IDENTITY");
			workerLog("stage", {
				valuationId,
				stage: "VALIDATING_IDENTITY",
				elapsedMs: elapsedMs(startedAt),
			});
			await job.updateProgress("FINDING_COMPARABLES");
			workerLog("stage", {
				valuationId,
				stage: "FINDING_COMPARABLES",
				elapsedMs: elapsedMs(startedAt),
			});
			abortSignal = AbortSignal.timeout(WORKER_TIMEOUT_MS);
			await runValuation(valuationId, abortSignal);
			await job.updateProgress("CALCULATING_PRICE");
			workerLog("stage", {
				valuationId,
				stage: "CALCULATING_PRICE",
				elapsedMs: elapsedMs(startedAt),
			});
			await job.updateProgress("PREPARING_EXPLANATION");
			workerLog("stage", {
				valuationId,
				stage: "PREPARING_EXPLANATION",
				elapsedMs: elapsedMs(startedAt),
			});
			await job.updateProgress("COMPLETED");
			const terminal = await prisma.valuation.findUnique({
				where: { id: valuationId },
				select: { status: true },
			});
			workerLog("job_completed", {
				valuationId,
				status: terminal?.status,
				elapsedMs: elapsedMs(startedAt),
			});
		} catch (error) {
			workerLog("job_failed", {
				valuationId,
				reason: failureCategory(
					error,
					abortSignal ?? new AbortController().signal,
				),
				errorName: error instanceof Error ? error.name : "NON_ERROR_THROWN",
				elapsedMs: elapsedMs(startedAt),
			});
			await markServiceFailure(valuationId);
			await job.updateProgress("COMPLETED");
		}
	},
	{
		connection,
		concurrency: 1,
		lockDuration: 120_000,
	},
);

const maintenance = setInterval(
	() => {
		void Promise.all([cleanupExpiredValuations(), failStaleValuations()]);
	},
	60 * 60 * 1_000,
);
maintenance.unref();

let closing = false;
async function shutdown() {
	if (closing) return;
	closing = true;
	clearInterval(maintenance);
	await worker.close();
	await prisma.$disconnect();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
