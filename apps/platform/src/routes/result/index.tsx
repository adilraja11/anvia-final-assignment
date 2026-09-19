import { createFileRoute } from "@tanstack/react-router";
import { ValuationResultPage } from "#/modules/valuation";

export const Route = createFileRoute("/result/")({
	component: ValuationResultPage,
});
