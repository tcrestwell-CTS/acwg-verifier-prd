"use client";

import { useQuery } from "@tanstack/react-query";
import { QueueTable } from "@/components/QueueTable";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
// Use any here — the list API returns a flattened shape handled inside QueueTable
// eslint-disable-next-line @typescript-eslint/no-explicit-any

export default function QueuePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders, isLoading, error } = useQuery<any[]>({
    queryKey: ["orders"],
    queryFn: async () => {
      const res = await fetch("/api/orders");
      if (!res.ok) throw new Error("Failed to load orders");
      return res.json();
    },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Review Queue</h1>
        <p className="text-slate-500 mt-1">
          All orders pending review or recently decided.
        </p>
      </div>

      {isLoading && <LoadingPage label="Loading orders…" />}

      {error && (
        <div className="card p-8 text-center text-red-600">
          Failed to load orders: {(error as Error).message}
        </div>
      )}

      {orders && <QueueTable orders={orders} />}
    </div>
  );
}
