import { Studio } from "@anvia/studio";
import {
	createImageIdentificationAgent,
	createValuationAgent,
} from "./agent.js";

const valuationAgent = createValuationAgent({
	productionTracing: false,
});

const imageIdentificationAgent = createImageIdentificationAgent({
	productionTracing: false,
});

new Studio([imageIdentificationAgent, valuationAgent]).start({
	hostname: "localhost",
	port: 4021,
});
