import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { ValuationSessionProvider } from "./modules/valuation/valuation-session";
import { router } from "./router";

const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<ValuationSessionProvider>
			<RouterProvider router={router} />
		</ValuationSessionProvider>,
	);
}
