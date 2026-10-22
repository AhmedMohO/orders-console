"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { errorMessage } from "@/lib/api";
import { useLogin } from "../hooks/use-login";
import { loginSchema } from "../schemas/login.schema";

export function LoginForm() {
	const login = useLogin();
	const error = login.error ? errorMessage(login.error) : "";
	const {
		control,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm({
		resolver: zodResolver(loginSchema),
		defaultValues: { email: "", password: "" },
		mode: "onTouched",
	});
	const busy = isSubmitting || login.isPending;

	const submit = handleSubmit(async (values) => {
		try {
			await login.mutateAsync(values);
		} catch {
			// mutation request error
		}
	});

	return (
		<main className="grid min-h-dvh place-items-center p-6">
			<section
				className="w-full max-w-md rounded-lg border border-border bg-white p-6 sm:p-8"
				aria-labelledby="login-title">
				<div className="mb-8 text-lg font-bold tracking-tight text-accent">
					Orders Console
				</div>
				<h1 id="login-title" className="text-3xl">
					Staff sign in
				</h1>
				<p className="mt-1.5 text-muted">
					Find orders and register phone purchases in one place.
				</p>
				<form onSubmit={submit} noValidate className="mt-6 mb-5">
					<fieldset disabled={busy}>
						<label htmlFor="email">Email</label>
						<Controller
							control={control}
							name="email"
							render={({ field }) => (
								<input
									id="email"
									{...field}
									type="email"
									autoComplete="username"
									maxLength={254}
									required
									aria-invalid={Boolean(errors.email)}
									aria-describedby={errors.email ? "email-error" : undefined}
								/>
							)}
						/>
						{errors.email && (
							<p id="email-error" role="alert" className="mt-1 text-error">
								{errors.email.message}
							</p>
						)}
						<label htmlFor="password" className="mt-4">
							Password
						</label>
						<Controller
							control={control}
							name="password"
							render={({ field }) => (
								<input
									id="password"
									{...field}
									type="password"
									autoComplete="current-password"
									maxLength={1024}
									required
									aria-invalid={Boolean(errors.password)}
									aria-describedby={
										errors.password ? "password-error" : undefined
									}
								/>
							)}
						/>
						{errors.password && (
							<p id="password-error" role="alert" className="mt-1 text-error">
								{errors.password.message}
							</p>
						)}
						{error && (
							<p
								role="alert"
								className="my-3 rounded-md bg-error-surface px-4 py-3 wrap-anywhere text-error">
								{error}
							</p>
						)}
						<button
							className="mt-6 w-full border-accent bg-accent text-white enabled:hover:border-accent enabled:hover:bg-accent-hover"
							type="submit">
							{busy ? "Signing in…" : "Sign in"}
						</button>
					</fieldset>
				</form>
			</section>
		</main>
	);
}
