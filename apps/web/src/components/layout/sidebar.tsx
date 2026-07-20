"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  LayoutDashboard,
  LineChart,
  History,
  Rows3,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/market-data", label: "Market Data", icon: LineChart },
  { href: "/options", label: "Options Chain", icon: Rows3 },
  { href: "/gamma", label: "GEX / DEX", icon: BarChart3 },
  { href: "/trade-plan", label: "Trade Plan", icon: Activity },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle },
  { href: "/journal", label: "Trade Journal", icon: BookOpen },
  { href: "/replay", label: "Historical Replay", icon: History },
  { href: "/system", label: "System Readiness", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <nav
      className={cn(
        "hidden shrink-0 flex-col border-r border-panel-border bg-panel transition-[width] duration-150 md:flex",
        collapsed ? "w-16" : "w-56",
      )}
      aria-label="Primary"
    >
      <div className="flex h-14 items-center gap-2 border-b border-panel-border px-4">
        <span className="h-2 w-2 rounded-full bg-bull animate-pulse-dot" />
        {!collapsed && (
          <span className="truncate font-mono text-sm font-semibold tracking-tight">
            SPY 0DTE COPILOT
          </span>
        )}
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-panel-hover text-foreground"
                    : "text-muted-foreground hover:bg-panel-hover hover:text-foreground",
                )}
                title={collapsed ? label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
