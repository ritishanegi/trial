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
        "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-150 shrink-0",
        collapsed ? "w-[52px]" : "w-56"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "h-14 flex items-center border-b border-sidebar-border shrink-0",
        collapsed ? "justify-center px-0" : "justify-between px-4"
      )}>
        {!collapsed && (
          <Link href="/dashboard" className="text-[15px] font-semibold tracking-tight text-sidebar-primary">
            nautos
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="size-7 flex items-center justify-center rounded text-sidebar-foreground/50 hover:text-sidebar-primary hover:bg-sidebar-accent transition-colors"
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 space-y-0.5">
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
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                collapsed && "justify-center px-0"
              )}
            >
              <item.icon className="size-[16px] shrink-0" />
              {!collapsed && item.label}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8} className="text-xs">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }
          return <div key={item.href}>{link}</div>;
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-2 border-t border-sidebar-border">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center rounded-md py-[7px] text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                <LogOut className="size-[16px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="text-xs">Sign out</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="size-[16px]" />
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}
