import { createFileRoute } from "@tanstack/react-router";
import { CreateValuationPage } from "#/modules/valuation";

export const Route = createFileRoute("/create")({
	component: CreateValuationPage,
});
