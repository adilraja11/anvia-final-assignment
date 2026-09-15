import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { agentApiRouter } from "./modules/agents/router.js";
import { chatRouter } from "./modules/chat/router.js";

const app = new Hono()
	.use(cors({ exposeHeaders: ["x-anvia-stream-protocol"] }))
	.route("/api/agents", agentApiRouter)
	.route("/api/chat", chatRouter);

serve(
	{
		fetch: app.fetch,
		port: Number(process.env.PORT ?? 8000),
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);
