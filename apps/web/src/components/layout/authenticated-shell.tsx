"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { UserResponse } from "@repo/contracts/users";
import { Header } from "@/components/layout/header";
import { useSession } from "@/features/auth/hooks/use-session";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { ApiError, errorMessage } from "@/lib/api";

const AuthenticatedShellContext = createContext<{
	user: UserResponse;
	onUnauthorized: () => void;
	loggingOut: boolean;
	onBusyChange: (busy: boolean) => void;
} | null>(null);

export function useAuthenticatedShell() {
	const shell = useContext(AuthenticatedShellContext);
	if (!shell) throw new Error("Authenticated content requires AuthenticatedShell.");
	return shell;
}

export function AuthenticatedShell({ children }: { children: React.ReactNode }) {
	const session = useSession();
	const user = session.data;
	const error = session.error ? errorMessage(session.error) : "";
	const unauthorized = session.unauthorized;

	const logout = useLogout(unauthorized);
	const loggingOut = logout.isPending;
	const [signOutError, setSignOutError] = useState("");
	const [isBusy, setIsBusy] = useState(false);

	const actionBusy = useRef(false);
	const mounted = useRef(false);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const signOut = useCallback(async () => {
		if (actionBusy.current || isBusy) return;
		actionBusy.current = true;
		setSignOutError("");
		try {
			await logout.mutateAsync();
		} catch (err) {
			if (mounted.current) {
				if (err instanceof ApiError && err.status === 401) unauthorized();
				else setSignOutError("Sign out was not confirmed. Retry sign out.");
			}
		} finally {
			actionBusy.current = false;
		}
	}, [logout, isBusy, unauthorized]);

	if (!user) {
		return (
			<main className="grid min-h-dvh place-content-center gap-4 p-6 text-center">
				<div className="text-lg font-bold tracking-tight">Orders Console</div>
				<p role={error ? "alert" : "status"}>
					{error || "Checking your session…"}
				</p>
				{error && (
					<button type="button" onClick={() => void session.refetch()}>
						Retry session
					</button>
				)}
			</main>
		);
	}

	return (
		<div className="min-w-0 lg:flex lg:h-dvh lg:min-h-160 lg:flex-col">
			<Header
				user={user}
				loggingOut={loggingOut}
				disabled={loggingOut || isBusy}
				onSignOut={signOut}
			/>
			{signOutError && (
				<div className="mx-auto w-full max-w-full px-3 pt-3 sm:px-8">
					<p
						role="alert"
						className="rounded-md bg-error-surface px-4 py-3 wrap-anywhere text-error">
						{signOutError}
					</p>
				</div>
			)}
			<AuthenticatedShellContext.Provider
				key={user.id}
				value={{ user, onUnauthorized: unauthorized, loggingOut, onBusyChange: setIsBusy }}>
				{children}
			</AuthenticatedShellContext.Provider>
		</div>
	);
}
