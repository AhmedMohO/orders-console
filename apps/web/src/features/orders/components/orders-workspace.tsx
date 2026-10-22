"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
	orderStatuses,
	type OrderQuery,
	type OrderSummary,
} from "@repo/contracts/orders";
import { useAuthenticatedShell } from "@/components/layout/authenticated-shell";
import { ApiError, errorMessage } from "@/lib/api";
import { useDebouncedSearch } from "../../../shared/hooks/use-debounced-search";
import { useDeleteOrder } from "../hooks/use-delete-order";
import { initialOrderQuery } from "../schemas/order-query.schema";
import { OrdersTable } from "./orders-table";
import { DeleteOrderDialog } from "./delete-order-dialog";
import { useOrders } from "../hooks/use-orders";

const OrderForm = dynamic(
	() => import("./order-form").then((module) => module.OrderForm),
	{
		ssr: false,
	},
);

export function OrdersWorkspace() {
	const { user, onUnauthorized, loggingOut, onBusyChange } =
		useAuthenticatedShell();
	const [search, setSearch] = useState(initialOrderQuery.search);
	const debouncedSearch = useDebouncedSearch(search);
	const [status, setStatus] = useState<NonNullable<OrderQuery["status"]> | "">(
		"",
	);
	const [sort, setSort] = useState<NonNullable<OrderQuery["sort"]>>(
		initialOrderQuery.sort,
	);
	const [direction, setDirection] = useState<
		NonNullable<OrderQuery["direction"]>
	>(initialOrderQuery.direction);
	const [pageSize, setPageSize] = useState(initialOrderQuery.pageSize);
	const [actionError, setActionError] = useState("");
	const [orderToDelete, setOrderToDelete] = useState<OrderSummary | null>(null);
	const [deleteError, setDeleteError] = useState("");
	const actionBusy = useRef(false);
	const mounted = useRef(false);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const list = useOrders(
		{
			search: debouncedSearch,
			status: status || undefined,
			sort,
			direction,
			pageSize,
		},
		user.id,
	);

	const deletion = useDeleteOrder(list.reset);
	const deletingId = deletion.isPending ? deletion.variables : null;

	useEffect(() => {
		onBusyChange(deletingId !== null);
		return () => onBusyChange(false);
	}, [deletingId, onBusyChange]);

	async function remove() {
		if (actionBusy.current || !orderToDelete) return;
		actionBusy.current = true;
		setDeleteError("");
		try {
			await deletion.mutateAsync(orderToDelete.id);
			if (mounted.current) setOrderToDelete(null);
		} catch (error) {
			if (!mounted.current) return;
			if (error instanceof ApiError && error.status === 401) onUnauthorized();
			else {
				if (error instanceof ApiError && error.status === 404) {
					setOrderToDelete(null);
					setActionError(errorMessage(error));
					void list.reset();
				} else setDeleteError(errorMessage(error));
			}
		} finally {
			actionBusy.current = false;
		}
	}

	return (
		<>
			<main className="mx-auto flex w-full max-w-full flex-1 flex-col px-3 py-6 sm:px-8 sm:pt-8 sm:pb-12 lg:min-h-0">
				<div className="mb-6 shrink-0">
					<h1>Orders</h1>
					<p className="mt-1.5 text-muted">
						Find a purchase or register a new phone order.
					</p>
				</div>
				{actionError && (
					<p
						role="alert"
						className="my-3 rounded-md bg-error-surface px-4 py-3 wrap-anywhere text-error">
						{actionError}
					</p>
				)}
				<div className="flex min-w-0 flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row">
					<section
						className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-white lg:flex-1"
						aria-label="Order results">
						<div className="grid shrink-0 grid-cols-2 gap-3 border-b border-border bg-filter p-4 sm:grid-cols-4 sm:p-5 xl:grid-cols-5">
							<div className="col-span-2 min-w-0 xl:col-span-1">
								<label htmlFor="search">Search customers</label>
								<input
									id="search"
									type="search"
									maxLength={100}
									placeholder="Name or email"
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									disabled={loggingOut}
								/>
							</div>
							<div className="min-w-0">
								<label htmlFor="status">Status</label>
								<select
									id="status"
									value={status}
									onChange={(event) =>
										setStatus(event.target.value as typeof status)
									}
									disabled={loggingOut}>
									<option value="">All statuses</option>
									{orderStatuses.map((value) => (
										<option key={value} value={value}>
											{value[0].toUpperCase() + value.slice(1)}
										</option>
									))}
								</select>
							</div>
							<div className="min-w-0">
								<label htmlFor="sort">Sort by</label>
								<select
									id="sort"
									value={sort}
									onChange={(event) =>
										setSort(event.target.value as typeof sort)
									}
									disabled={loggingOut}>
									<option value="createdAt">Date</option>
									<option value="totalCents">Amount</option>
								</select>
							</div>
							<div className="min-w-0">
								<label htmlFor="direction">Direction</label>
								<select
									id="direction"
									value={direction}
									onChange={(event) =>
										setDirection(event.target.value as typeof direction)
									}
									disabled={loggingOut}>
									<option value="desc">Descending</option>
									<option value="asc">Ascending</option>
								</select>
							</div>
						</div>
						<div className="shrink-0 px-5 py-3 text-muted flex items-center flex-wrap justify-between">
							<span role="status" className="inline-block">
								{list.loading
									? "Loading orders…"
									: `${list.data?.items.length ?? 0} orders on this page`}
							</span>
							<button
								type="button"
								disabled={loggingOut || list.loading}
								onClick={() => void list.reset()}>
								Refresh
							</button>
						</div>
						<div
							className="max-h-160 min-h-0 flex-1 overflow-auto lg:max-h-none"
							aria-busy={list.loading}
							tabIndex={0}
							aria-label="Scrollable order results">
							{list.error && (
								<div
									className="my-3 rounded-md bg-error-surface px-4 py-3 wrap-anywhere text-error"
									role="alert">
									<p>{list.error}</p>
									<button
										type="button"
										onClick={() => void list.retry()}
										className="mt-2"
										disabled={loggingOut}>
										Retry list
									</button>
								</div>
							)}
							<OrdersTable
								items={list.data?.items ?? []}
								admin={user.role === "admin"}
								disabled={loggingOut || list.loading}
								deletingId={deletingId}
								loading={list.loading}
								onDelete={(order) => {
									if (actionBusy.current) return;
									setDeleteError("");
									setOrderToDelete(order);
								}}
							/>
							{!list.loading &&
								!list.error &&
								list.data?.items.length === 0 && (
									<div className="px-5 py-12 text-center text-muted">
										<h2 className="mb-2 text-foreground">No orders found</h2>
										<p>
											Adjust your search or filters, or refresh this live list.
										</p>
									</div>
								)}
						</div>
						<nav
							className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-border p-4 sm:px-5 sm:py-4"
							aria-label="Order pages">
							<label
								htmlFor="page-size"
								className="mb-0 flex items-center gap-2 whitespace-nowrap">
								Rows per page{" "}
								<select
									id="page-size"
									className="w-auto"
									value={pageSize}
									onChange={(event) => setPageSize(Number(event.target.value))}
									disabled={loggingOut}>
									<option value="10">10</option>
									<option value="25">25</option>
									<option value="50">50</option>
									<option value="100">100</option>
								</select>
							</label>
							<div className="flex flex-wrap items-center gap-2.5">
								<span className="whitespace-nowrap text-muted">
									Page {list.page}
								</span>
								<button
									type="button"
									onClick={list.previous}
									disabled={loggingOut || list.loading || list.page < 2}>
									Previous
								</button>
								<button
									type="button"
									onClick={() => void list.next()}
									disabled={
										loggingOut || list.loading || !list.data?.nextCursor
									}>
									Next
								</button>
							</div>
						</nav>
					</section>
					<OrderForm
						staffId={user.id}
						disabled={loggingOut}
						onCreated={list.reset}
						onUnauthorized={onUnauthorized}
					/>
				</div>
			</main>
			{orderToDelete && (
				<DeleteOrderDialog
					order={orderToDelete}
					busy={deletingId !== null}
					error={deleteError}
					onCancel={() => {
						if (!actionBusy.current) setOrderToDelete(null);
					}}
					onConfirm={() => void remove()}
				/>
			)}
		</>
	);
}
