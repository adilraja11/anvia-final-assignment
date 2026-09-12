import { Studio } from "@anvia/studio";
import { createValuationAgent } from "./agent.js";

const agent = createValuationAgent({
	productionTracing: false,
});

new Studio([agent]).start({
	hostname: "localhost",
	port: 4021,
});
