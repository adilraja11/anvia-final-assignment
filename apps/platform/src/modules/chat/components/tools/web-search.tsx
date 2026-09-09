import type { ToolPart } from "../../types";

export function WebSearchTool({ part }: { part: ToolPart }) {
	const input = part.input as { query?: string } | undefined;

	return (
		<div className="tool-call">
			<code className="tool-tag">webSearch</code>
			<code className="tool-value">{input?.query}</code>
		</div>
	);
}
