import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { handleMcpRequest } from "./server.js";

const MAX_REQUEST_BYTES = 64 * 1024;

export const mcpRouter = new Hono().all(
	"/",
	bodyLimit({
		maxSize: MAX_REQUEST_BYTES,
		onError: () =>
			new Response("Permintaan terlalu besar.", {
				status: 413,
				headers: { "cache-control": "no-store" },
			}),
	}),
	async (c) => {
		try {
			return await handleMcpRequest(c.req.raw);
		} catch {
			return new Response("Layanan sementara tidak tersedia.", {
				status: 503,
				headers: { "cache-control": "no-store" },
			});
		}
	},
);
