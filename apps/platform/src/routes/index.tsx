import { createFileRoute } from "@tanstack/react-router";
import { ValuationHomePage } from "#/modules/valuation";
import { listValuations } from "#/utils/api/valuations";

export const Route = createFileRoute("/")({
	loader: async () => {
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
