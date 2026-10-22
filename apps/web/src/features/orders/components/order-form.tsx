import { formatMoney } from "../../../shared/utils/format-money";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { buildOrderInput, parseMoney } from "../utils/order-input";
import { useCreateOrder } from "../hooks/use-create-order";
import { orderDraftSchema } from "../schemas/order.schema";
import type { OrderDraft } from "@/features/orders/types/order";
import { errorMessage } from "@/lib/api";

const emptyDraft = (): OrderDraft => ({
	customerName: "",
	customerEmail: "",
	items: [{ description: "", quantity: "1", unitPrice: "" }],
});

export function OrderForm({
	staffId,
	disabled,
	onCreated,
	onUnauthorized,
}: {
	staffId: number;
	disabled: boolean;
	onCreated: () => void;
	onUnauthorized: () => void;
}) {
	const create = useCreateOrder(staffId, onCreated, onUnauthorized);
	const saved = create.attempt?.input;
	const {
		register,
		control,
		handleSubmit,
		reset,
		setError,
		formState: { errors, isSubmitting },
	} = useForm({
		resolver: zodResolver(orderDraftSchema, undefined, { raw: true }),
		defaultValues: saved
			? {
					customerName: saved.customerName,
					customerEmail: saved.customerEmail,
					items: saved.items.map((item) => ({
						description: item.description,
						quantity: String(item.quantity),
						unitPrice: (item.unitPriceCents / 100).toFixed(2),
					})),
				}
			: emptyDraft(),
	});

	const { fields, append, remove } = useFieldArray({ control, name: "items" });
	const items = useWatch({ control, name: "items" });

	const locked =
		Boolean(create.attempt) || create.blocked || disabled || isSubmitting;

	let total: number | null = null;
	try {
		total = items.reduce(
			(sum, item) => sum + parseMoney(item.unitPrice) * Number(item.quantity),
			0,
		);
	} catch {
		/* Incomplete prices are expected while typing. */
	}

	const submit = handleSubmit(async (draft) => {
		if (create.attempt || create.blocked || disabled) return;
		let input;
		try {
			input = buildOrderInput(draft);
		} catch (error) {
			setError("root", { message: errorMessage(error) });
			return;
		}
		if (await create.submit(input)) reset(emptyDraft());
	});

	async function retry() {
		if (await create.retry()) reset(emptyDraft());
	}

	return (
		<section
			className="min-h-0 max-h-fit min-w-0 w-full overflow-y-auto rounded-lg border border-border bg-white p-5 sm:p-6 lg:w-80 lg:shrink-0"
			aria-labelledby="new-order-title">
			<h2 id="new-order-title">New phone order</h2>
			<p className="mt-1.5 mb-6 text-muted">
				Add the customer and up to five items.
			</p>
			{create.attempt && (
				<section
					className="mb-4 grid gap-1.5 rounded-md border border-warning bg-warning-surface p-3.5 wrap-anywhere text-center"
					data-testid="pending-attempt"
					aria-label="Pending submission"
					aria-live="polite">
					<h3>
						{create.attempt.state === "sending"
							? "Saving order…"
							: "Confirmation unknown"}
					</h3>
					{create.attempt.state === "unknown" && (
						<div className="flex flex-wrap items-center justify-center gap-2.5">
							<button type="button" onClick={retry} disabled={disabled}>
								Retry submission
							</button>
							<button
								type="button"
								onClick={create.discard}
								disabled={disabled}>
								Discard recovery
							</button>
						</div>
					)}
				</section>
			)}
			{(errors.root?.message || create.error) && (
				<p
					className="my-3 rounded-md bg-error-surface px-4 py-3 wrap-anywhere text-error"
					role="alert">
					{errors.root?.message || create.error}
				</p>
			)}
			{create.blocked && (
				<button type="button" onClick={create.discard}>
					Discard local recovery
				</button>
			)}
			<form onSubmit={submit} noValidate>
				<fieldset disabled={locked}>
					<label htmlFor="customer-name">Customer name</label>
					<input
						id="customer-name"
						autoComplete="name"
						maxLength={100}
						required
						{...register("customerName")}
						aria-invalid={Boolean(errors.customerName)}
						aria-describedby={
							errors.customerName ? "customer-name-error" : undefined
						}
					/>
					{errors.customerName && (
						<p
							id="customer-name-error"
							role="alert"
							className="mt-1 text-error">
							{errors.customerName.message}
						</p>
					)}
					<label htmlFor="customer-email" className="mt-4">
						Customer email
					</label>
					<input
						id="customer-email"
						type="email"
						autoComplete="email"
						maxLength={254}
						required
						{...register("customerEmail")}
						aria-invalid={Boolean(errors.customerEmail)}
						aria-describedby={
							errors.customerEmail ? "customer-email-error" : undefined
						}
					/>
					{errors.customerEmail && (
						<p
							id="customer-email-error"
							role="alert"
							className="mt-1 text-error">
							{errors.customerEmail.message}
						</p>
					)}
					{fields.map((field, index) => (
						<div className="mt-5 border-t border-border pt-4" key={field.id}>
							<div className="mb-3 flex items-center justify-between">
								<h3>Item {index + 1}</h3>
								{fields.length > 1 && (
									<button
										type="button"
										className="min-h-8 border-0 bg-transparent p-0 text-xs text-accent"
										aria-label={`Remove item ${index + 1}`}
										onClick={() => remove(index)}>
										Remove
									</button>
								)}
							</div>
							<label htmlFor={`description-${index}`}>
								Description {index + 1}
							</label>
							<input
								id={`description-${index}`}
								maxLength={200}
								required
								{...register(`items.${index}.description`)}
								aria-invalid={Boolean(errors.items?.[index]?.description)}
								aria-describedby={
									errors.items?.[index]?.description
										? `description-${index}-error`
										: undefined
								}
							/>
							{errors.items?.[index]?.description && (
								<p
									id={`description-${index}-error`}
									role="alert"
									className="mt-1 text-error">
									{errors.items?.[index]?.description?.message}
								</p>
							)}
							<div className="mt-3 grid grid-cols-5 gap-3">
								<div className="col-span-2 min-w-0">
									<label htmlFor={`quantity-${index}`}>
										Quantity {index + 1}
									</label>
									<input
										id={`quantity-${index}`}
										type="number"
										min="1"
										max="999"
										step="1"
										required
										{...register(`items.${index}.quantity`)}
										aria-invalid={Boolean(errors.items?.[index]?.quantity)}
										aria-describedby={
											errors.items?.[index]?.quantity
												? `quantity-${index}-error`
												: undefined
										}
									/>
									{errors.items?.[index]?.quantity && (
										<p
											id={`quantity-${index}-error`}
											role="alert"
											className="mt-1 text-error">
											{errors?.items[index]?.quantity?.message}
										</p>
									)}
								</div>
								<div className="col-span-3 min-w-0">
									<label htmlFor={`price-${index}`}>
										Unit price {index + 1} (EGP)
									</label>
									<div className="relative">
										<span
											aria-hidden="true"
											className="absolute inset-y-0 left-3 flex items-center text-muted">
											EGP
										</span>
										<input
											id={`price-${index}`}
											className="pl-12"
											inputMode="decimal"
											placeholder="0.00"
											maxLength={9}
											required
											{...register(`items.${index}.unitPrice`)}
											aria-invalid={Boolean(errors.items?.[index]?.unitPrice)}
											aria-describedby={
												errors.items?.[index]?.unitPrice
													? `price-${index}-error`
													: undefined
											}
										/>
									</div>
									{errors.items?.[index]?.unitPrice && (
										<p
											id={`price-${index}-error`}
											role="alert"
											className="mt-1 text-error">
											{errors?.items[index]?.unitPrice?.message}
										</p>
									)}
								</div>
							</div>
						</div>
					))}
					<button
						type="button"
						className="mt-3.5 w-full"
						disabled={fields.length >= 5}
						onClick={() =>
							append({ description: "", quantity: "1", unitPrice: "" })
						}>
						Add item
					</button>
					<div
						data-testid="order-total"
						className="mt-6 mb-4 flex items-center justify-between gap-2">
						<span>Total (EGP)</span>
						<strong className="text-xl tabular-nums">
							{total !== null && Number.isFinite(total)
								? formatMoney(total)
								: "—"}
						</strong>
					</div>
					<button
						type="submit"
						className="w-full border-accent bg-accent text-white enabled:hover:border-accent enabled:hover:bg-accent-hover">
						Create order
					</button>
				</fieldset>
			</form>
		</section>
	);
}
