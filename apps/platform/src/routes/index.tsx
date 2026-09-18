import { createFileRoute } from "@tanstack/react-router";
import { ValuationHomePage } from "#/modules/valuation";

export const Route = createFileRoute("/")({
	component: ValuationHomePage,
});
