"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((data) => {
        setOverview(data.overview);
        setDailyQueries(data.dailyQueries);
        setDocsByStatus(data.docsByStatus);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const maxDaily = Math.max(...dailyQueries.map((d) => d.count), 1);

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Usage and processing metrics</p>
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
            { label: "Avg response", value: overview.avgResponseTimeMs > 0 ? `${(overview.avgResponseTimeMs / 1000).toFixed(1)}s` : "—" },
          ].map((stat) => (
            <div key={stat.label} className="border border-border rounded-lg p-3">
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-semibold text-foreground mt-0.5 tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Query volume */}
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Query volume (30 days)</h2>
          {dailyQueries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No data yet</p>
          ) : (
            <div className="flex items-end gap-[2px] h-32">
              {dailyQueries.map((day) => (
                <div key={day.date} className="flex-1 group relative">
                  <div
                    className="w-full bg-primary/70 hover:bg-primary rounded-t-sm min-h-[1px] transition-colors"
                    style={{ height: `${(day.count / maxDaily) * 120}px` }}
                  />
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-foreground text-background rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap z-10">
                    {day.count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Document status */}
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Document status</h2>
          {docsByStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No documents yet</p>
          ) : (
            <div className="space-y-3">
              {docsByStatus.map((ds) => {
                const total = docsByStatus.reduce((s, d) => s + d.count, 0);
                const pct = total > 0 ? (ds.count / total) * 100 : 0;
                return (
                  <div key={ds.status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-foreground capitalize">{ds.status}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{ds.count}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${OCR_STATUS_COLOR[ds.status] || "bg-muted-foreground"}`}
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
