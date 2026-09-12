import { createFileRoute } from "@tanstack/react-router";
import { ValuationExperience } from "#/modules/valuation/valuation-experience";

export const Route = createFileRoute("/")({
	component: ValuationExperience,
});
