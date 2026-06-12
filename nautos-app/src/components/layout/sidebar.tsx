"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  MessageSquareText,
  FileText,
  Ship,
  BarChart3,
  LogOut,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/query", label: "Ask AI", icon: MessageSquareText },
  { href: "/dashboard/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/vessels", label: "Fleet", icon: Ship },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth/login");
  }

  return (
    <aside
      className={cn(
        "relative flex flex-col shrink-0 transition-all duration-150 overflow-hidden",
        "bg-[#0a1628] border-r border-white/[0.07]",
        collapsed ? "w-[52px]" : "w-56"
      )}
    >
      {/* subtle grid texture */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      {/* amber glow at bottom */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% 110%, rgba(245,166,35,0.07) 0%, transparent 60%)",
        }}
      />

      {/* Logo */}
      <div
        className={cn(
          "relative z-10 h-14 flex items-center border-b border-white/[0.07] shrink-0",
          collapsed ? "justify-center px-0" : "justify-between px-4"
        )}
      >
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full border-2 border-[#f5a623] flex items-center justify-center shrink-0">
              <div className="w-1.5 h-1.5 rounded-full border border-[#f5a623]" />
            </div>
            <span className="text-white text-[14px] font-semibold tracking-wide">
              nautos
            </span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="size-7 flex items-center justify-center rounded text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition-colors"
        >
          {collapsed ? (
            <PanelLeft className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex-1 py-2 px-2 space-y-0.5">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          const link = (
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                active
                  ? "bg-white/[0.08] text-white"
                  : "text-white/40 hover:text-white/80 hover:bg-white/[0.05]",
                collapsed && "justify-center px-0"
              )}
            >
              <item.icon
                className={cn(
                  "size-[16px] shrink-0",
                  active ? "text-[#f5a623]" : ""
                )}
              />
              {!collapsed && item.label}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={8}
                  className="text-xs bg-[#0d1a2e] border-white/10 text-white/80"
                >
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }
          return <div key={item.href}>{link}</div>;
        })}
      </nav>

      {/* Footer */}
      <div className="relative z-10 px-2 py-3 border-t border-white/[0.07]">
        {/* coords label */}
        {!collapsed && (
          <p className="text-[10px] tracking-widest text-white/20 px-2.5 mb-2">
            25°47′N 80°13′W
          </p>
        )}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center rounded-md py-[7px] text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition-colors"
              >
                <LogOut className="size-[16px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={8}
              className="text-xs bg-[#0d1a2e] border-white/10 text-white/80"
            >
              Sign out
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] text-white/40 hover:text-white/80 hover:bg-white/[0.05] transition-colors"
          >
            <LogOut className="size-[16px]" />
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}