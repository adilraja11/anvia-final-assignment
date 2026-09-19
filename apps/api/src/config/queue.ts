import { Queue } from "bullmq";
import {
	ASLI_SEGINI_AGENT_QUEUE_NAME,
	connection,
} from "./queue-connection.js";

export const valuationQueue = new Queue(ASLI_SEGINI_AGENT_QUEUE_NAME, {
	connection,
	defaultJobOptions: {
		attempts: 1,
		removeOnComplete: 1_000,
		removeOnFail: 1_000,
	},
});
