import type { initialMessagesFromMemory, UIMessagePart } from "@anvia/react";

export type MemoryMessages = Parameters<typeof initialMessagesFromMemory>[0];
export type ToolPart = Extract<UIMessagePart, { type: "tool" }>;

export interface ChatSession {
	id: string;
	title: string;
	updatedAt: string;
}
