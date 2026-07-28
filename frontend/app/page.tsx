"use client";

import { useCallback, useEffect, useState } from "react";

type HealthResponse = {
  status: string;
  database?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/health`);
      const data = (await response.json()) as HealthResponse;

      if (!response.ok) {
        throw new Error(data.database ?? "Backend is unavailable");
      }

      setHealth(data);
    } catch (caughtError) {
      setHealth(null);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to reach the backend");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const statusText = isLoading
    ? "Checking backend…"
    : error
      ? `Unavailable: ${error}`
      : `Backend: ${health?.status ?? "unknown"} · Database: ${health?.database ?? "unknown"}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Project skeleton</p>
        <h1 className="mt-3 text-4xl font-bold">RentMate</h1>
        <p className="mt-3 text-slate-300">
          The frontend is connected to the backend health check. Rental features have not been implemented yet.
        </p>
        <div className="mt-6 rounded-lg bg-slate-800 p-4" aria-live="polite">
          <p className="font-medium">{statusText}</p>
        </div>
        <button
          className="mt-5 rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => void checkHealth()}
          disabled={isLoading}
        >
          Check again
        </button>
      </section>
    </main>
  );
}
