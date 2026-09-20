import { createFileRoute } from "@tanstack/react-router";
import { ValuationHomePage } from "#/modules/valuation";
import {
	getValuationRuntime,
	isApiRuntime,
} from "#/modules/valuation/hooks/valuation-gateway";
import { listValuations } from "#/utils/api/valuations";

export const Route = createFileRoute("/")({
	loader: async () => {
		// Mock mode remains a standalone labelled demo and never relies on a cookie.
		if (!isApiRuntime(getValuationRuntime()))
			return { summaries: [], error: null };
		try {
			return { summaries: await listValuations(), error: null };
		} catch (error) {
			return {
				summaries: [],
				error:
					error instanceof Error
						? error.message
						: "Riwayat valuasi tidak dapat dimuat.",
			};
		}
	},
	component: HomeRoute,
});

function HomeRoute() {
	return <ValuationHomePage {...Route.useLoaderData()} />;
}
