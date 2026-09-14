import { randomUUID } from "node:crypto";
import {
	agentToClientStream,
	type ClientStreamRequest,
	parseClientStreamRequest,
} from "@anvia/client";
import { createMemoryScopeKey } from "@anvia/core/memory";
import { PrismaMemoryStore } from "@anvia/memory-prisma";
import { createClientStreamResponse } from "@anvia/server";
import { createValuationAgent, flushAgentTracing } from "@repo/agents";
import { Hono } from "hono";
import { prisma } from "../../lib/prisma.js";

const memory = new PrismaMemoryStore({ client: prisma });

export const chatRouter = new Hono()
	.get("/sessions", async (c) => {
		const sessions = await prisma.agentMemorySession.findMany({
			orderBy: { updatedAt: "desc" },
			include: {
				messages: {
					where: { role: "user" },
					orderBy: { position: "asc" },
					take: 1,
					select: { message: true },
				},
			},
		});

		return c.json(
			sessions.map((session) => {
				const metadata = session.metadata as { title?: string };
				const message = session.messages[0]?.message as {
					content?: Array<{ type: string; text?: string }>;
				};
				const title = message?.content
					?.find((content) => content.type === "text")
					?.text?.trim();

				return {
					id: session.sessionId,
					title: title?.slice(0, 60) || metadata.title || "New chat",
					updatedAt: session.updatedAt,
				};
			}),
		);
	})
	.post("/sessions", async (c) => {
		const { prompt } = await c.req.json<{ prompt: string }>();
		const sessionId = randomUUID();

		await prisma.agentMemorySession.create({
			data: {
				scopeKey: createMemoryScopeKey({ scope: { sessionId } }),
				sessionId,
				metadata: { title: prompt.trim().slice(0, 60) },
			},
		});

		return c.json({ id: sessionId }, 201);
	})
	.get("/:sessionId", async (c) => {
		const messages = await memory.load({
			scope: { sessionId: c.req.param("sessionId") },
		});

		return c.json(messages);
	})
	.post("/:sessionId", async (c) => {
		let body: ClientStreamRequest;
		try {
			body = parseClientStreamRequest(await c.req.json());
		} catch {
			return c.json({ error: "Invalid chat request" }, 400);
		}
		if (body.type !== "messages") {
			return c.json({ error: "Interaction responses are not enabled" }, 400);
		}
		const prompt = body.messages.findLast((message) => message.role === "user");
		if (prompt?.role !== "user") {
			return c.json({ error: "A user message is required" }, 400);
		}
		const sessionId = c.req.param("sessionId");
		const agent = createValuationAgent({
			agentId: "personal-assistant",
			memory,
		});

		const events = (async function* () {
			try {
				yield* agentToClientStream({
					events: agent.stream({
						prompt,
						session: { sessionId },
						abortSignal: c.req.raw.signal,
						retries: {},
						trace: {
							name: "employee-handbook-chat",
							sessionId,
							metadata: {
								agentId: "personal-assistant",
							},
							tags: ["chat", "employee-handbook"],
						},
					}),
				});
			} finally {
				await flushAgentTracing();
			}
		})();

		return createClientStreamResponse({ events, format: "jsonl" });
	})
	.delete("/:sessionId", async (c) => {
		const sessionId = c.req.param("sessionId");
		await memory.clear({ scope: { sessionId } });

		return c.body(null, 204);
	});
