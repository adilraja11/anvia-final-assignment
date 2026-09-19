import { createFileRoute } from "@tanstack/react-router";
import { PersistentValuationResultPage } from "#/modules/valuation";

export const Route = createFileRoute("/result/$valuationId")({
	component: ResultByIdRoute,
});

function ResultByIdRoute() {
	const { valuationId } = Route.useParams();
	return <PersistentValuationResultPage valuationId={valuationId} />;
}
