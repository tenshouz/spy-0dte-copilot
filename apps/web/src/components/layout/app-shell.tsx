import type { ReactNode } from "react";
import { DisclaimerBar } from "@/components/layout/disclaimer-bar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto scrollbar-thin p-3 md:p-4">{children}</main>
        <DisclaimerBar />
        <MobileNav />
      </div>
    </div>
  );
}
