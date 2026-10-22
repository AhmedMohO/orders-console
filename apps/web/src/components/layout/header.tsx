import type { UserResponse } from "@repo/contracts/users";

export function Header({
	user,
	loggingOut,
	disabled,
	onSignOut,
}: {
	user: UserResponse;
	loggingOut: boolean;
	disabled: boolean;
	onSignOut: () => void;
}) {
	return (
		<header className="flex min-h-20 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border bg-white px-4 py-3.5 sm:px-8 sm:py-4">
			<div className="text-lg font-bold tracking-tight">Orders Console</div>
			<div className="flex min-w-0 flex-wrap items-center gap-2.5 wrap-anywhere">
				<span>{user.name}</span>
				<span className="rounded bg-role-surface px-2 py-1 text-xs text-role">{user.role}</span>
				<button type="button" onClick={onSignOut} disabled={disabled}>
					{loggingOut ? "Signing out…" : "Sign out"}
				</button>
			</div>
		</header>
	);
}
