import type { messagesToUIMessages, UIToolMessagePart } from "@anvia/client";

export type MemoryMessages = Parameters<typeof messagesToUIMessages>[0];
export type ToolPart = UIToolMessagePart;

export interface ChatSession {
	id: string;
	title: string;
	updatedAt: string;
}
