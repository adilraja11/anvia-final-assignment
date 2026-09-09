import type { ToolPart } from "../../types";
import { WebExtractTool } from "./web-extract";
import { WebSearchTool } from "./web-search";

export function ToolCall({ part }: { part: ToolPart }) {
	switch (part.toolName) {
		case "webSearch":
			return <WebSearchTool part={part} />;
		case "webExtract":
			return <WebExtractTool part={part} />;
		default:
			return null;
	}
}
