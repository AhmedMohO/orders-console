import { Suspense } from "react";
import { redirect } from "next/navigation";
import { HydrationBoundary } from "@tanstack/react-query";
import { OrdersWorkspace } from "@/features/orders/components/orders-workspace";
import { loadInitialOrders } from "@/features/orders/services/initial-orders.server";

export default function Home() {
	return (
		<Suspense
			fallback={
				<main className="grid min-h-dvh place-content-center p-6">
					<p role="status">Loading Orders Console…</p>
				</main>
			}>
			<InitialOrders />
		</Suspense>
	);
}

async function InitialOrders() {
	const state = await loadInitialOrders();
	if (!state) redirect("/login");
	return (
		<HydrationBoundary state={state}>
			<OrdersWorkspace />
		</HydrationBoundary>
	);
}
