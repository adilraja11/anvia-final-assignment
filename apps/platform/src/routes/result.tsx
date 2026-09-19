import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/result")({
	component: ResultLayout,
});

function ResultLayout() {
	return <Outlet />;
}
