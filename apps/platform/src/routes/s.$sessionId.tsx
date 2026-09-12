import { createFileRoute } from "@tanstack/react-router";
import { ValuationExperience } from "#/modules/valuation/valuation-experience";

export const Route = createFileRoute("/s/$sessionId")({
	// Retained so existing bookmarked development URLs continue to open the mockup.
	component: ValuationExperience,
});
