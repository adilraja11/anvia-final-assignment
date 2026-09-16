import { createFileRoute } from "@tanstack/react-router";
import { CreateValuationPage } from "#/modules/valuation/valuation-experience";

export const Route = createFileRoute("/create")({
	component: CreateValuationPage,
});
