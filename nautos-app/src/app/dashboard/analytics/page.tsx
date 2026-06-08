"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { OCR_STATUS_COLOR } from "@/lib/constants";

interface Overview {
  totalDocuments: number;
  totalVessels: number;
  totalUsers: number;
  totalQueries: number;
  queriesToday: number;
  avgResponseTimeMs: number;
}

interface DailyQuery {
  date: string;
  count: number;
}

interface DocStatus {
  status: string;
  count: number;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [dailyQueries, setDailyQueries] = useState<DailyQuery[]>([]);
  const [docsByStatus, setDocsByStatus] = useState<DocStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => {
        if (!data || typeof data !== "object") {
          throw new Error("Unexpected response shape from /api/analytics");
        }
        setOverview(data.overview ?? null);
        setDailyQueries(data.dailyQueries ?? []);
        setDocsByStatus(data.docsByStatus ?? []);
      })
      .catch((err: Error) => {
        console.error("[AnalyticsPage]", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-64">
        <Loader2 className="size-5 animate-spin text-[#3d5a73]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-white">Analytics</h1>
          <p className="text-sm text-[#8ba8bf] mt-0.5">Usage and processing metrics</p>
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Failed to load analytics</p>
            <p className="mt-0.5 text-red-400/70 font-mono text-xs">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const maxDaily = Math.max(...dailyQueries.map((d) => d.count), 1);

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[#f5a623] text-[11px] font-semibold tracking-[0.2em] uppercase flex items-center gap-2 mb-3">
          <span className="inline-block w-5 h-px bg-[#f5a623]" />
          Maritime Intelligence Platform
        </p>
        <h1 className="text-2xl font-semibold text-white">Analytics</h1>
        <p className="text-sm text-[#8ba8bf] mt-1">Usage and processing metrics</p>
      </div>

      {/* KPIs */}
      {overview && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {[
            { label: "Documents", value: overview.totalDocuments },
            { label: "Vessels", value: overview.totalVessels },
            { label: "Team", value: overview.totalUsers },
            { label: "Total queries", value: overview.totalQueries },
            { label: "Today", value: overview.queriesToday },
            {
              label: "Avg response",
              value:
                overview.avgResponseTimeMs > 0
                  ? `${(overview.avgResponseTimeMs / 1000).toFixed(1)}s`
                  : "—",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="border border-white/10 rounded-lg p-3 bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
            >
              <p className="text-[11px] text-[#3d5a73] uppercase tracking-[0.12em] font-semibold">
                {stat.label}
              </p>
              <p className="text-xl font-semibold text-white mt-1 tabular-nums">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {!overview && (
        <div className="mb-8 rounded-lg border border-white/10 p-4 text-sm text-[#8ba8bf]">
          No overview data returned from the API.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Query volume */}
        <div className="border border-white/10 rounded-lg p-5 bg-white/[0.03]">
          <h2 className="text-[11px] text-[#3d5a73] uppercase tracking-[0.12em] font-semibold mb-1">
            Query volume
          </h2>
          <p className="text-sm text-white font-medium mb-5">Last 30 days</p>

          {dailyQueries.length === 0 ? (
            <p className="text-sm text-[#3d5a73] py-8 text-center">No data yet</p>
          ) : (
            <div className="flex items-end gap-[2px] h-32">
              {dailyQueries.map((day) => (
                <div key={day.date} className="flex-1 group relative">
                  <div
                    className="w-full bg-[#f5a623]/40 hover:bg-[#f5a623] rounded-t-sm min-h-[2px] transition-colors"
                    style={{ height: `${(day.count / maxDaily) * 120}px` }}
                  />
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[#f5a623] text-[#0d1b2a] rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap z-10">
                    {day.count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Document status */}
        <div className="border border-white/10 rounded-lg p-5 bg-white/[0.03]">
          <h2 className="text-[11px] text-[#3d5a73] uppercase tracking-[0.12em] font-semibold mb-1">
            Document status
          </h2>
          <p className="text-sm text-white font-medium mb-5">By processing state</p>

          {docsByStatus.length === 0 ? (
            <p className="text-sm text-[#3d5a73] py-8 text-center">No documents yet</p>
          ) : (
            <div className="space-y-4">
              {docsByStatus.map((ds) => {
                const total = docsByStatus.reduce((s, d) => s + d.count, 0);
                const pct = total > 0 ? (ds.count / total) * 100 : 0;
                return (
                  <div key={ds.status}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-[#8ba8bf] capitalize">{ds.status}</span>
                      <span className="text-xs text-[#3d5a73] tabular-nums font-mono">
                        {ds.count}
                      </span>
                    </div>
                    <div className="w-full bg-white/[0.06] rounded-full h-1">
                      <div
                        className={`h-1 rounded-full ${
                          OCR_STATUS_COLOR[ds.status] || "bg-[#f5a623]/50"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}