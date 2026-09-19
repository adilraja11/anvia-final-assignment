import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { agentApiRouter } from "./modules/agents/router.js";
import { chatRouter } from "./modules/chat/router.js";
import { valuationRouter } from "./modules/valuations/router.js";

const app = new Hono()
	.use(
		cors({
			origin: (origin) => {
				try {
					return origin ===
						new URL(process.env.PLATFORM_URL ?? "http://localhost:3000").origin
						? origin
						: undefined;
				} catch {
					return undefined;
				}
			},
			exposeHeaders: ["x-anvia-stream-protocol"],
		}),
	)
	.route("/api/agents", agentApiRouter)
	.route("/api/valuations", valuationRouter)
	.route("/api/chat", chatRouter);

export type AppType = typeof app;

serve(
	{
		fetch: app.fetch,
		port: Number(process.env.PORT ?? 8000),
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);
