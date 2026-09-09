import { randomUUID } from "node:crypto";
import {
	createPrismaMemoryScopeKey,
	createPrismaMemoryStore,
} from "@anvia/memory-prisma";
import { createEventStream } from "@anvia/server";
import { createAgent, flushAgentTracing } from "@repo/agents";
import { Hono } from "hono";
import { prisma } from "../../lib/prisma.js";

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
				scopeKey: createPrismaMemoryScopeKey({ sessionId }),
				sessionId,
				metadata: { title: prompt.trim().slice(0, 60) },
			},
		});

		return c.json({ id: sessionId }, 201);
	})
	.get("/:sessionId", async (c) => {
		const memory = createPrismaMemoryStore(prisma);
		const messages = await memory.load({
			sessionId: c.req.param("sessionId"),
		});

		return c.json(messages);
	})
	.post("/:sessionId", async (c) => {
		const body = await c.req.json();
		const lastMessage = body.messages.at(-1);
		const prompt = lastMessage.content.at(-1).text;
		const sessionId = c.req.param("sessionId");
		const memory = createPrismaMemoryStore(prisma);
		const agent = createAgent({
			agentId: "personal-assistant",
			memory,
		});

		const stream = (async function* () {
			try {
				yield* agent
					.session(sessionId)
					.prompt(prompt)
					.withTrace({
						name: "employee-handbook-chat",
						sessionId,
						metadata: {
							agentId: "personal-assistant",
						},
						tags: ["chat", "employee-handbook"],
					})
					.withCompletionRetries()
					.stream();
			} finally {
				await flushAgentTracing();
			}
		})();

		return createEventStream(stream, { format: "jsonl" });
	})
	.delete("/:sessionId", async (c) => {
		const sessionId = c.req.param("sessionId");
		const memory = createPrismaMemoryStore(prisma);
		await memory.clear({ sessionId });

		return c.body(null, 204);
	});
