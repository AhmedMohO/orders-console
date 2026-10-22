"use client";

import { useQueryClient } from "@tanstack/react-query";

export default function RouteError({ retry }: { error: unknown; retry: () => void }) {
  const client = useQueryClient();
  function recover() {
    client.clear();
    retry();
  }
  return (
    <main className="grid min-h-dvh place-content-center gap-4 p-6 text-center">
      <h1>Unable to display this page</h1>
      <p role="alert">Something went wrong. Please try again.</p>
      <button type="button" onClick={recover}>Try again</button>
    </main>
  );
}
