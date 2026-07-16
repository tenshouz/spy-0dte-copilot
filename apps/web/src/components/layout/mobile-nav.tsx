"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  LayoutDashboard,
  LineChart,
  Rows3,
  Settings as SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dash", icon: LayoutDashboard },
  { href: "/market-data", label: "Market", icon: LineChart },
  { href: "/options", label: "Options", icon: Rows3 },
  { href: "/gamma", label: "GEX/DEX", icon: BarChart3 },
  { href: "/trade-plan", label: "Plan", icon: Activity },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex shrink-0 items-stretch overflow-x-auto border-t border-panel-border bg-panel md:hidden"
      aria-label="Primary"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-w-[64px] flex-1 flex-col items-center gap-1 px-2 py-2 text-[10px]",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
