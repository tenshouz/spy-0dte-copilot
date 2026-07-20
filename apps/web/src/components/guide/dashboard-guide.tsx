"use client";

import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BookOpenCheck,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Database,
  ExternalLink,
  Eye,
  FileClock,
  Gauge,
  Info,
  LayoutDashboard,
  LineChart,
  ListChecks,
  LockKeyhole,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Waypoints,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  GUIDE_ALERT_CHECKLIST,
  GUIDE_DAILY_WORKFLOW,
  GUIDE_GLOSSARY,
  GUIDE_PAGES,
  GUIDE_PLAN_STATES,
  GUIDE_SECTION_LINKS,
  GUIDE_SHARING_CHECKLIST,
  GUIDE_SOURCE_STATES,
  GUIDE_TRADE_PLAN_STEPS,
  type GuidePageDefinition,
  type GuideStatusDefinition,
} from "@/lib/dashboard-guide-content";
import {
  filterGuideGlossary,
  filterGuidePages,
  guideToneClass,
} from "@/lib/dashboard-guide-view";
import { cn } from "@/lib/utils";

const PAGE_ICON: Record<string, typeof LayoutDashboard> = {
  "/dashboard": LayoutDashboard,
  "/market-data": LineChart,
  "/options": Database,
  "/gamma": Waypoints,
  "/trade-plan": Target,
  "/alerts": BellRing,
  "/journal": BookOpenCheck,
  "/replay": FileClock,
  "/system": ShieldCheck,
  "/settings": Settings,
  "/guide": CircleHelp,
};

export function DashboardGuide() {
  const [search, setSearch] = useState("");
  const pages = useMemo(() => filterGuidePages(GUIDE_PAGES, search), [search]);
  const glossary = useMemo(
    () => filterGuideGlossary(GUIDE_GLOSSARY, search),
    [search],
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="hidden xl:block">
        <div className="sticky top-0 rounded-lg border border-panel-border bg-panel p-3">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <ListChecks className="h-4 w-4" />
            Guide sections
          </div>
          <nav aria-label="Dashboard guide sections">
            <ul className="space-y-1">
              {GUIDE_SECTION_LINKS.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="block rounded-md px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-panel-hover hover:text-foreground"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        <section
          id="start-here"
          className="scroll-mt-4 overflow-hidden rounded-lg border border-accent/30 bg-accent/5"
        >
          <div className="grid gap-5 p-4 md:grid-cols-[1fr_auto] md:p-5">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <BadgeLike tone="accent">Start here</BadgeLike>
                <BadgeLike tone="default">Release 1.3.0</BadgeLike>
              </div>
              <h2 className="font-mono text-lg font-semibold">
                The dashboard reads the market, explains the structure, and waits for a complete plan.
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                It is a read-only decision-support tool for SPY options that expire today. It can show a
                Calls or Puts plan, send a Discord notification, and save snapshots—but it never places,
                changes, or closes a brokerage order.
              </p>
            </div>
            <div className="grid min-w-[220px] gap-2 text-xs">
              <SimpleFact icon={Eye} title="Reads" detail="SPY market data" />
              <SimpleFact icon={Gauge} title="Calculates" detail="Fixed deterministic rules" />
              <SimpleFact icon={LockKeyhole} title="Never does" detail="Execute an order" />
            </div>
          </div>

          <div className="grid border-t border-accent/20 sm:grid-cols-3">
            <QuickLink href="/system" label="1. Check the system" />
            <QuickLink href="/dashboard" label="2. Read the market" />
            <QuickLink href="/trade-plan" label="3. Review the plan" />
          </div>
        </section>

        <section className="rounded-lg border border-panel-border bg-panel p-4">
          <label htmlFor="guide-search" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Find a feature or term
          </label>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="guide-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Try: partial, GEX, Discord, trigger, replay…"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Search filters the page explanations and glossary below. The rest of the guide stays visible.
          </p>
        </section>

        <GuideSection
          id="daily-workflow"
          icon={Clock3}
          title="A simple daily workflow"
          description="The normal order of operations for a new user."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {GUIDE_DAILY_WORKFLOW.map((step, index) => (
              <NumberedCard
                key={step.title}
                number={index + 1}
                title={step.title}
                detail={step.detail}
              />
            ))}
          </div>
        </GuideSection>

        <GuideSection
          id="pages"
          icon={LayoutDashboard}
          title="What every page does"
          description="Each page has one main job. Search above to quickly narrow this list."
        >
          {pages.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {pages.map((page) => (
                <PageGuideCard key={page.href} page={page} />
              ))}
            </div>
          ) : (
            <EmptySearch message="No page explanation matches that search." />
          )}
        </GuideSection>

        <GuideSection
          id="trade-plan"
          icon={Target}
          title="How a Trade Plan becomes READY"
          description="The dashboard moves through these gates in order. GEX/DEX only changes confidence after the structural direction exists."
        >
          <div className="space-y-2">
            {GUIDE_TRADE_PLAN_STEPS.map((step, index) => (
              <div
                key={step.title}
                className="grid gap-2 rounded-md border border-panel-border bg-background/30 p-3 sm:grid-cols-[26px_1fr]"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-accent/30 bg-accent/10 font-mono text-[11px] font-semibold text-accent">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-md border border-wait/30 bg-wait-muted p-3 text-xs leading-relaxed text-wait">
            <strong>Important:</strong> READY is not a command to buy. It means the dashboard has a complete
            plan for you to review against the current live values.
          </div>
        </GuideSection>

        <GuideSection
          id="statuses"
          icon={Info}
          title="Statuses, warnings, and colors"
          description="Read the written label first. Color alone does not always mean good, bad, or broken."
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <StatusGroup title="Trade Plan states" items={GUIDE_PLAN_STATES} />
            <StatusGroup title="Data and system states" items={GUIDE_SOURCE_STATES} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ColorMeaning
              tone="bull"
              title="Green"
              detail="Usually live, available, complete, supportive, or READY."
            />
            <ColorMeaning
              tone="wait"
              title="Amber"
              detail="Usually waiting, partial, stale, degraded, or needs attention."
            />
            <ColorMeaning
              tone="bear"
              title="Red"
              detail="Can mean bearish market evidence or an actual error. Read the label to tell which one."
            />
          </div>
        </GuideSection>

        <GuideSection
          id="alerts"
          icon={BellRing}
          title="How automatic Discord alerts work"
          description="A new alert-eligible Trade Plan transition is evaluated by the persistent backend scheduler."
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-2">
              {GUIDE_ALERT_CHECKLIST.map((item) => (
                <CheckRow key={item}>{item}</CheckRow>
              ))}
            </div>
            <div className="rounded-md border border-panel-border bg-background/30 p-4">
              <h3 className="font-mono text-sm font-semibold">What the notification means</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                It tells you that a new plan is ready for review and includes a concise direction, contract,
                exposure state, and confidence summary. Open Trade Plan for the full trigger, invalidation,
                objective, quote quality, and source details.
              </p>
              <div className="mt-3 rounded-md border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
                With a 15-second cadence, delivery is normally attempted during the next scheduler evaluation—not
                necessarily the exact millisecond the plan appears.
              </div>
            </div>
          </div>
        </GuideSection>

        <GuideSection
          id="journal-replay"
          icon={FileClock}
          title="Journal, analytics, and replay"
          description="These features answer three different questions."
        >
          <div className="grid gap-3 md:grid-cols-3">
            <QuestionCard
              question="What did the dashboard show?"
              answer="The Journal snapshot stores the deterministic Assembly and its source data at that moment."
            />
            <QuestionCard
              question="What actually happened to my trade?"
              answer="You enter no trade, win, loss, breakeven, realized P&L, and notes. The system does not guess."
            />
            <QuestionCard
              question="Did the historical decision use future information?"
              answer="Replay checks captured timestamps and source integrity, then shows the chronological state transitions."
            />
          </div>
        </GuideSection>

        <GuideSection
          id="sharing"
          icon={ShieldCheck}
          title="How to share or publish it safely"
          description="The current release is a local single-user tool. Sharing access is different from publishing a public service."
        >
          <div className="space-y-3">
            {GUIDE_SHARING_CHECKLIST.map((item, index) => (
              <div
                key={item.title}
                className="grid gap-2 rounded-md border border-panel-border bg-background/30 p-3 sm:grid-cols-[32px_1fr]"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted font-mono text-xs text-muted-foreground">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-bear/30 bg-bear-muted p-3 text-xs leading-relaxed text-bear">
            <strong>Do not publish the existing local backend as-is.</strong> It is intentionally single-user and
            does not contain the authentication, tenancy, billing, and internet-facing abuse controls required for
            a public product.
          </div>
        </GuideSection>

        <GuideSection
          id="glossary"
          icon={BookOpenCheck}
          title="Simple glossary"
          description="Plain-English meanings for the terms shown throughout the dashboard."
        >
          {glossary.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {glossary.map((item) => (
                <div
                  key={item.term}
                  className="rounded-md border border-panel-border bg-background/30 p-3"
                >
                  <h3 className="font-mono text-xs font-semibold text-foreground">{item.term}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.meaning}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptySearch message="No glossary term matches that search." />
          )}
        </GuideSection>

        <section className="rounded-lg border border-panel-border bg-panel p-4 text-center">
          <Zap className="mx-auto h-5 w-5 text-accent" />
          <h2 className="mt-2 font-mono text-sm font-semibold">The safest rule for a first-time user</h2>
          <p className="mx-auto mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Check System Readiness, read the written source states, wait for a complete READY plan, and revalidate
            the live values. Never infer meaning from color alone and never assume the dashboard placed an order.
          </p>
        </section>
      </div>
    </div>
  );
}

function GuideSection({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: typeof LayoutDashboard;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-lg border border-panel-border bg-panel p-4 md:p-5">
      <div className="mb-4 flex items-start gap-3 border-b border-panel-border pb-4">
        <div className="mt-0.5 rounded-md border border-accent/30 bg-accent/10 p-2 text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-mono text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SimpleFact({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Eye;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-panel-border bg-background/40 px-3 py-2">
      <Icon className="h-4 w-4 text-accent" />
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between border-accent/20 px-4 py-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent/10 sm:border-r last:border-r-0"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5 text-accent" />
    </Link>
  );
}

function NumberedCard({
  number,
  title,
  detail,
}: {
  number: number;
  title: string;
  detail: string;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-panel-border bg-background/30 p-3 sm:grid-cols-[32px_1fr]">
      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-panel-border bg-muted font-mono text-xs font-semibold text-muted-foreground">
        {number}
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function PageGuideCard({ page }: { page: GuidePageDefinition }) {
  const Icon = PAGE_ICON[page.href] ?? CircleHelp;
  return (
    <article className="flex h-full flex-col rounded-md border border-panel-border bg-background/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-muted p-2 text-accent">
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="font-mono text-sm font-semibold">{page.title}</h3>
        </div>
        <Link
          href={page.href}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
        >
          Open <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-foreground">{page.purpose}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{page.useWhen}</p>
      <ul className="mt-3 space-y-1.5">
        {page.features.map((feature) => (
          <li key={feature} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bull" />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-3">
        <div className="rounded-md border border-wait/20 bg-wait-muted/60 p-2.5 text-[11px] leading-relaxed text-wait">
          <strong>Remember:</strong> {page.remember}
        </div>
      </div>
    </article>
  );
}

function StatusGroup({
  title,
  items,
}: {
  title: string;
  items: readonly GuideStatusDefinition[];
}) {
  return (
    <div>
      <h3 className="mb-2 font-mono text-sm font-semibold">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-md border border-panel-border bg-background/30 p-3">
            <BadgeLike tone={item.tone}>{item.label}</BadgeLike>
            <p className="mt-2 text-xs leading-relaxed text-foreground">{item.simpleMeaning}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              <strong>What to do:</strong> {item.action}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorMeaning({
  tone,
  title,
  detail,
}: {
  tone: "bull" | "wait" | "bear";
  title: string;
  detail: string;
}) {
  return (
    <div className={cn("rounded-md border p-3", guideToneClass(tone))}>
      <div className="font-mono text-xs font-semibold">{title}</div>
      <div className="mt-1 text-[11px] leading-relaxed">{detail}</div>
    </div>
  );
}

function CheckRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-panel-border bg-background/30 p-3 text-xs leading-relaxed text-muted-foreground">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-bull" />
      {children}
    </div>
  );
}

function QuestionCard({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-md border border-panel-border bg-background/30 p-4">
      <h3 className="text-sm font-semibold text-accent">{question}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{answer}</p>
    </div>
  );
}

function BadgeLike({
  tone,
  children,
}: {
  tone: "bull" | "wait" | "bear" | "accent" | "default";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        guideToneClass(tone),
      )}
    >
      {children}
    </span>
  );
}

function EmptySearch({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-panel-border p-6 text-center text-xs text-muted-foreground">
      <AlertTriangle className="mx-auto mb-2 h-4 w-4 text-wait" />
      {message}
    </div>
  );
}
