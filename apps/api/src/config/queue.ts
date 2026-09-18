import { Queue } from "bullmq";
import { ASLI_SEGINI_AGENT_QUEUE_NAME, connection } from "./queue-connection.js";

export const jobApplicationTrackerQueue = new Queue(ASLI_SEGINI_AGENT_QUEUE_NAME, {
  connection: connection,
});
