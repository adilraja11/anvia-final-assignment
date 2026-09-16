import { createFileRoute } from "@tanstack/react-router";
import { ValuationHomePage } from "#/modules/valuation/valuation-experience";

export const Route = createFileRoute("/")({
	component: ValuationHomePage,
});
