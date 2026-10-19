import { Suspense } from "react";
import type { User } from "@repo/db";

async function UserList() {
	const apiUrl = process.env.API_URL ?? "http://localhost:4000";
	let users: User[];

	try {
		const res = await fetch(`${apiUrl}/users`, { cache: "no-store" });
		if (!res.ok) throw new Error(`API returned ${res.status}`);
		users = await res.json();
	} catch {
		return (
			<p className="text-red-600">Could not load users. Is the API running?</p>
		);
	}

	if (users.length === 0) return <p>No users yet.</p>;
	return (
		<ul className="list-disc pl-6">
			{users.map((user) => (
				<li key={user.id}>
					{user.name} ({user.email})
				</li>
			))}
		</ul>
	);
}

export default function Home() {
	return (
		<main className="mx-auto max-w-xl p-8">
			<h1 className="mb-4 text-2xl font-bold">Users</h1>
			<Suspense fallback={<p>Loading...</p>}>
				<UserList />
			</Suspense>
		</main>
	);
}
