"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, Check } from "lucide-react";

interface User {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

interface Overview {
  totalDocuments: number;
  totalVessels: number;
  totalUsers: number;
  totalQueries: number;
  queriesToday: number;
  avgResponseTimeMs: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => setUser(data.user))
      .catch(() => router.push("/auth/login"));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/analytics")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.overview) setOverview(data.overview);
      })
      .catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const kpis = [
    { label: "Documents", value: overview?.totalDocuments ?? 0 },
    { label: "Queries today", value: overview?.queriesToday ?? 0 },
    { label: "Vessels", value: overview?.totalVessels ?? 0 },
  ];

  const actions = [
    {
      href: "/dashboard/vessels",
      title: "Add vessels",
      desc: "Register your fleet vessels and link equipment and documents to each ship.",
      done: (overview?.totalVessels ?? 0) > 0,
    },
    {
      href: "/dashboard/documents",
      title: "Upload documents",
      desc: "Upload maintenance manuals, spare parts catalogs, and technical documents for processing.",
      done: (overview?.totalDocuments ?? 0) > 0,
    },
    {
      href: "/dashboard/query",
      title: "Ask a question",
      desc: "Query your documents using natural language and get answers with page citations.",
      done: (overview?.totalQueries ?? 0) > 0,
    },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overview of your workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Badge
            variant="secondary"
            className="text-[11px] capitalize font-medium"
          >
            {user.role}
          </Badge>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {kpis.map((stat) => (
          <div key={stat.label} className="border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground font-medium">
              {stat.label}
            </p>
            <p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <h2 className="text-sm font-semibold text-foreground mb-3">
        Get started
      </h2>
      <div className="space-y-2">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex items-center justify-between border border-border rounded-lg px-4 py-3.5 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {action.done && (
                <div className="size-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Check className="size-3 text-emerald-600" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {action.title}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {action.desc}
                </p>
              </div>
            </div>
            <ArrowRight className="size-4 text-muted-foreground shrink-0 ml-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        ))}
      </div>
    </div>
  );
}
