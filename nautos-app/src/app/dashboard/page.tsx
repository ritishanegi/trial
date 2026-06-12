"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
      .catch(() => { });
  }, [user]);

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-white/30" />
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
    <div className="relative min-h-full overflow-hidden">
      {/* Background grid texture */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      {/* Amber glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 80% 100%, rgba(245,166,35,0.05) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 p-6 lg:p-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            {/* Eyebrow */}
            <div className="flex items-center gap-2 mb-2">
              <span className="h-px w-5 bg-[#f5a623]" />
              <span className="text-[#f5a623] text-[10px] tracking-[0.12em] uppercase">
                Maritime Intelligence Platform
              </span>
            </div>
            <h1 className="text-[#f0f4ff] text-xl font-semibold">Dashboard</h1>
            <p className="text-sm text-white/40 mt-0.5">
              Overview of your workspace
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-white/40">{user.email}</span>
            <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[#0a1628] bg-[#f5a623] px-2 py-0.5 rounded">
              {user.role}
            </span>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {kpis.map((stat) => (
            <div
              key={stat.label}
              className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03] px-5 py-4"
            >
              {/* top amber accent line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-[#f5a623]/40 via-[#f5a623]/10 to-transparent" />
              <p className="text-[11px] uppercase tracking-[0.08em] text-white/40 font-medium">
                {stat.label}
              </p>
              <p className="text-3xl font-bold text-[#f0f4ff] mt-1.5 tabular-nums">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Get started */}
        <div className="flex items-center gap-2 mb-4">
          <span className="h-px w-5 bg-[#f5a623]" />
          <h2 className="text-[11px] uppercase tracking-[0.08em] text-white/50 font-medium">
            Get started
          </h2>
        </div>

        <div className="space-y-2">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-center justify-between border border-white/[0.08] rounded-lg px-5 py-4 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.14] transition-all"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                {action.done ? (
                  <div className="size-5 rounded-full bg-[#f5a623]/15 border border-[#f5a623]/40 flex items-center justify-center shrink-0">
                    <Check className="size-3 text-[#f5a623]" />
                  </div>
                ) : (
                  <div className="size-5 rounded-full border border-white/[0.15] shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium text-[#f0f4ff]">
                    {action.title}
                  </p>
                  <p className="text-[13px] text-white/40 mt-0.5">
                    {action.desc}
                  </p>
                </div>
              </div>
              <ArrowRight className="size-4 text-white/25 shrink-0 ml-4 group-hover:text-[#f5a623] group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>

        {/* Footer coords */}
        <p className="mt-10 text-[10px] tracking-widest text-white/15">
          25°47′N 80°13′W · Martech Systems
        </p>
      </div>
    </div>
  );
}