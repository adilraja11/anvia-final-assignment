import type { ToolPart } from "../../types";

export function WebExtractTool({ part }: { part: ToolPart }) {
	const input = part.input as { url?: string } | undefined;

	return (
		<div className="tool-call">
			<code className="tool-tag">webExtract</code>
			<code className="tool-value">{input?.url}</code>
		</div>
	);
}
