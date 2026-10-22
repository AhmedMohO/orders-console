import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { loadServerSession } from "@/features/auth/services/session.server";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-content-center p-6"><p role="status">Checking your session…</p></main>}>
      <SessionLayout>{children}</SessionLayout>
    </Suspense>
  );
}

async function SessionLayout({ children }: { children: React.ReactNode }) {
  const user = await loadServerSession((await cookies()).toString());
  if (!user) redirect("/login");
  const client = new QueryClient();
  client.setQueryData(["session"], user);
  return (
    <HydrationBoundary state={dehydrate(client)}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </HydrationBoundary>
  );
}
