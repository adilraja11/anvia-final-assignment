import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { chatRouter } from "./modules/chat/router.js";

const app = new Hono().use(cors()).route("/api/chat", chatRouter);

serve(
	{
		fetch: app.fetch,
		port: Number(process.env.PORT ?? 8000),
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	},
);
