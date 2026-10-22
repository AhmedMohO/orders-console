import { dateFormatter } from "../../../shared/utils/date-formater";
import { formatMoney } from "../../../shared/utils/format-money";
import type { OrderSummary } from "@repo/contracts/orders";

export function OrdersTable({
	items,
	admin,
	disabled,
	deletingId,
	onDelete,
	loading = false,
}: {
	items: OrderSummary[];
	admin: boolean;
	disabled: boolean;
	deletingId: number | null;
	onDelete: (order: OrderSummary) => void;
	loading?: boolean;
}) {
	return (
		<table className="w-full border-collapse text-left text-sm">
			<caption className="sr-only">
				Confirmed orders matching the current filters
			</caption>
			<thead>
				<tr>
					<th scope="col">Order</th>
					<th scope="col">Customer</th>
					<th scope="col">Email</th>
					<th scope="col">Status</th>
					<th scope="col" className="text-right whitespace-nowrap tabular-nums">
						Total
					</th>
					<th scope="col">Created</th>
					{admin && <th scope="col">Action</th>}
				</tr>
			</thead>
			<tbody>
				{loading ? (
					<OrdersTableSkeleton admin={admin} />
				) : (
					items.map((order) => (
						<tr key={order.id}>
							<td className="whitespace-nowrap text-muted tabular-nums">
								#{order.id}
							</td>
							<td>{order.customerName}</td>
							<td className="min-w-40 wrap-anywhere text-muted">
								{order.customerEmail}
							</td>
							<td>
								<span
									className={`inline-block rounded px-2 py-1 text-xs ${statusStyles[order.status]}`}>
									{order.status}
								</span>
							</td>
							<td className="text-right whitespace-nowrap tabular-nums">
								{formatMoney(order.totalCents)}
							</td>
							<td className="whitespace-nowrap">
								{dateFormatter.format(new Date(order.createdAt))}
							</td>
							{admin && (
								<td>
									<button
										type="button"
										className="border-transparent bg-transparent text-xs text-danger"
										disabled={disabled || deletingId !== null}
										aria-label={`Delete order ${order.id}`}
										onClick={() => onDelete(order)}>
										{deletingId === order.id ? "Deleting…" : "Delete"}
									</button>
								</td>
							)}
						</tr>
					))
				)}
			</tbody>
		</table>
	);
}

const statusStyles = {
	pending: "bg-status-pending-surface text-status-pending",
	processing: "bg-status-processing-surface text-status-processing",
	completed: "bg-status-completed-surface text-status-completed",
	cancelled: "bg-status-cancelled-surface text-status-cancelled",
};

export function OrdersTableSkeleton({
	admin,
	rowCount = 12,
}: {
	admin: boolean;
	rowCount?: number;
}) {
	return (
		<>
			{Array.from({ length: rowCount }).map((_, index) => (
				<tr key={index} className="animate-pulse" aria-hidden="true">
					<td>
						<div className="h-4 w-12 rounded bg-border" />
					</td>
					<td>
						<div className="h-4 w-28 rounded bg-border" />
					</td>
					<td>
						<div className="h-4 w-40 rounded bg-border" />
					</td>
					<td>
						<div className="h-5 w-16 rounded bg-border" />
					</td>
					<td className="text-right">
						<div className="ml-auto h-4 w-16 rounded bg-border" />
					</td>
					<td>
						<div className="h-4 w-28 rounded bg-border" />
					</td>
					{admin && (
						<td>
							<div className="h-4 w-12 rounded bg-border" />
						</td>
					)}
				</tr>
			))}
		</>
	);
}
