"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  RecordTradingOverrideRequest,
  TradingOpportunityState,
  TradingPositionExitReason,
  TradingRestrictionEventType,
} from "@spy-copilot/shared";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCloseTradingPosition,
  useConfirmTradingEntry,
  useCreateTradingRestrictedEvent,
  useDeleteTradingRestrictedEvent,
  useRecordTradingOverride,
  useTradingWorkspace,
} from "@/hooks/use-trading-workspace";

function stateTone(
  state: TradingOpportunityState,
): "default" | "bull" | "bear" | "wait" | "accent" {
  if (state === "READY") return "bull";
  if (["BLOCKED", "NO_TRADE", "UNAVAILABLE"].includes(state)) return "bear";
  if (state === "WAITING") return "wait";
  return "default";
}

function dollars(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function price(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `$${value.toFixed(2)}`;
}

function ratio(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(2)}:1`;
}

function localTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function inputClass(): string {
  return "h-9 w-full rounded-md border border-panel-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-accent";
}

function useAlertSeconds(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
}

export default function TradingWorkspacePage() {
  const query = useTradingWorkspace();
  const workspace = query.isError ? null : query.data ?? null;
  const confirmEntry = useConfirmTradingEntry();
  const closePosition = useCloseTradingPosition();
  const recordOverride = useRecordTradingOverride();
  const createEvent = useCreateTradingRestrictedEvent();
  const deleteEvent = useDeleteTradingRestrictedEvent();

  const selectedCandidate = useMemo(() => {
    if (!workspace?.opportunity.selectedCandidateId) return null;
    return (
      workspace.opportunity.candidates.find(
        (candidate) =>
          candidate.candidateId === workspace.opportunity.selectedCandidateId,
      ) ?? null
    );
  }, [workspace]);
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [exitReason, setExitReason] = useState<TradingPositionExitReason>("TARGET_2");
  const [overrideAction, setOverrideAction] =
    useState<RecordTradingOverrideRequest["action"]>("OTHER");
  const [overrideReason, setOverrideReason] = useState("");
  const [eventType, setEventType] =
    useState<TradingRestrictionEventType>("CPI");
  const [eventTitle, setEventTitle] = useState("CPI release");
  const [eventMarketDate, setEventMarketDate] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");

  const initializedAlertId = useRef<string | null>(null);
  const activeAlertId = workspace?.activeReadyAlert?.id ?? null;
  const activeAlertAsk = selectedCandidate?.selectedContractAsk ?? null;
  useEffect(() => {
    if (!activeAlertId) {
      initializedAlertId.current = null;
      setEntryPrice("");
      return;
    }
    if (initializedAlertId.current === activeAlertId) return;
    initializedAlertId.current = activeAlertId;
    setEntryPrice(activeAlertAsk === null ? "" : activeAlertAsk.toFixed(2));
  }, [activeAlertAsk, activeAlertId]);

  const initializedPositionId = useRef<string | null>(null);
  const openPositionId = workspace?.openPosition?.id ?? null;
  const currentExitBid = workspace?.executionModel.currentExitBid ?? null;
  useEffect(() => {
    if (!openPositionId) {
      initializedPositionId.current = null;
      setExitPrice("");
      return;
    }
    if (initializedPositionId.current === openPositionId) return;
    initializedPositionId.current = openPositionId;
    setExitPrice(currentExitBid === null ? "" : currentExitBid.toFixed(2));
  }, [currentExitBid, openPositionId]);


  useEffect(() => {
    if (!workspace?.currentMarketDate) return;
    setEventMarketDate((current) => current || workspace.currentMarketDate);
  }, [workspace?.currentMarketDate]);

  const secondsRemaining = useAlertSeconds(
    workspace?.activeReadyAlert?.expiresAt ?? null,
  );
  const latestAction =
    confirmEntry.data ?? closePosition.data ?? recordOverride.data ?? null;

  const submitEntry = (event: FormEvent) => {
    event.preventDefault();
    if (!workspace?.activeReadyAlert) return;
    const numericPrice = Number(entryPrice);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return;
    confirmEntry.mutate({
      readyAlertId: workspace.activeReadyAlert.id,
      actualEntryPrice: numericPrice,
      note: "Manual paper-equivalent entry confirmation from Trading Workspace",
    });
  };

  const submitExit = (event: FormEvent) => {
    event.preventDefault();
    if (!workspace?.openPosition) return;
    const numericPrice = Number(exitPrice);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) return;
    closePosition.mutate({
      positionId: workspace.openPosition.id,
      request: {
        actualExitPrice: numericPrice,
        exitReason,
        note: "Manual bid-side exit confirmation from Trading Workspace",
      },
    });
  };

  const submitOverride = (event: FormEvent) => {
    event.preventDefault();
    if (overrideReason.trim().length < 5) return;
    recordOverride.mutate({
      action: overrideAction,
      reason: overrideReason.trim(),
      relatedOpportunityId: workspace?.opportunity.opportunityId ?? null,
      relatedPositionId: workspace?.openPosition?.id ?? null,
    });
  };

  const submitRestriction = (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || !eventTitle.trim() || !eventMarketDate) return;
    const fullDay = eventType !== "OTHER_MAJOR";
    const startIso = eventStart ? new Date(eventStart).toISOString() : null;
    const endIso = eventEnd ? new Date(eventEnd).toISOString() : null;
    if (!fullDay && (!startIso || !endIso)) return;
    createEvent.mutate({
      marketDate: eventMarketDate,
      eventType,
      title: eventTitle.trim(),
      blockMode: fullDay ? "FULL_DAY" : "WINDOW",
      windowStartAt: fullDay ? null : startIso,
      windowEndAt: fullDay ? null : endIso,
      enabled: true,
    });
  };

  return (
    <div className="mx-auto max-w-[1700px] min-w-0">
      <PageHeader
        title="Trading Workspace"
        description="V1.6–V1.9 deterministic policy, opportunity, paper-equivalent risk, position lifecycle, and execution research. Manual confirmation only; no broker order is created."
        action={
          workspace ? (
            <Badge variant={stateTone(workspace.opportunity.state)}>
              {workspace.opportunity.state.replaceAll("_", " ")}
            </Badge>
          ) : null
        }
      />

      {query.isError ? (
        <Panel title="Trading Workspace unavailable" isError>
          <span />
        </Panel>
      ) : query.isLoading || !workspace ? (
        <Panel title="Loading Trading Workspace" isLoading>
          <span />
        </Panel>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-12">
          {workspace.warnings.length > 0 ? (
            <Panel title="Active safeguards" className="lg:col-span-12">
              <div className="flex flex-wrap gap-2">
                {workspace.warnings.map((warning) => (
                  <Badge key={warning} variant="bear">
                    {warning.replaceAll("_", " ")}
                  </Badge>
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel
            title="Trading-policy ledger"
            className="lg:col-span-12"
            action={
              <Badge variant={workspace.riskLedger.entryPermittedByLedger ? "bull" : "bear"}>
                {workspace.riskLedger.entryPermittedByLedger ? "Ledger passed" : "Ledger blocked"}
              </Badge>
            }
          >
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
              <MetricCard label="Paper account" value={dollars(workspace.policy.paperEquivalentAccountDollars)} />
              <MetricCard label="Daily budget left" value={dollars(workspace.riskLedger.remainingDailyLossBudgetDollars)} tone={workspace.riskLedger.remainingDailyLossBudgetDollars > 0 ? "bull" : "bear"} />
              <MetricCard label="Realized loss" value={dollars(workspace.riskLedger.realizedLossDollars)} tone="bear" />
              <MetricCard label="Open planned risk" value={dollars(workspace.riskLedger.openPlannedRiskDollars)} tone={workspace.riskLedger.openPlannedRiskDollars > 0 ? "wait" : "default"} />
              <MetricCard label="Trades" value={`${workspace.riskLedger.tradeCount} / ${workspace.policy.maximumTradesPerDay}`} />
              <MetricCard label="Consecutive losses" value={`${workspace.riskLedger.consecutiveLosses} / ${workspace.policy.stopAfterConsecutiveLosses}`} tone={workspace.riskLedger.consecutiveLosses > 0 ? "wait" : "default"} />
              <MetricCard label="Open positions" value={`${workspace.riskLedger.openPositionCount} / 1`} />
              <MetricCard label="Episode attempts" value={`${workspace.riskLedger.attemptsForCurrentEpisode} / 2`} />
            </div>
          </Panel>

          <Panel
            title="Consolidated opportunity"
            className="lg:col-span-8"
            action={
              <Badge variant={stateTone(workspace.opportunity.state)}>
                {workspace.opportunity.primaryReasonCode.replaceAll("_", " ")}
              </Badge>
            }
          >
            {!selectedCandidate ? (
              <div className="rounded-md border border-dashed border-panel-border p-5 text-center text-sm text-muted-foreground">
                No promoted live candidate is selected. Shadow observations remain research-only.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <MetricCard label="Setup" value={selectedCandidate.setupId.replaceAll("_", " ")} />
                  <MetricCard label="Direction" value={selectedCandidate.direction} tone={selectedCandidate.direction === "CALLS" ? "bull" : "bear"} />
                  <MetricCard label="Lifecycle" value={selectedCandidate.lifecycleState} />
                  <MetricCard label="Confidence" value={selectedCandidate.confidenceScore === null ? "—" : `${selectedCandidate.confidenceScore.toFixed(0)}%`} />
                  <MetricCard label="Trigger" value={price(selectedCandidate.triggerLevel)} />
                  <MetricCard label="Structural stop" value={price(selectedCandidate.invalidationLevel)} tone="bear" />
                  <MetricCard label="Target 1" value={price(selectedCandidate.target1Level)} sublabel="Management only" />
                  <MetricCard label="Target 2" value={price(selectedCandidate.target2Level)} sublabel="Primary one-contract exit" tone="bull" />
                  <MetricCard label="Target 3" value={price(selectedCandidate.target3Level)} sublabel="Research only" />
                  <MetricCard label="Underlying R:R" value={ratio(selectedCandidate.underlyingRewardRiskRatio)} />
                  <MetricCard label="Option R:R" value={ratio(selectedCandidate.optionRewardRiskRatio)} />
                  <MetricCard label="Contract" value={selectedCandidate.selectedContractSymbol ?? "—"} sublabel={selectedCandidate.selectedContractStrike ? `ATM ${selectedCandidate.selectedContractStrike.toFixed(0)}` : "Strict ATM only"} />
                  <MetricCard label="Ask entry" value={price(selectedCandidate.selectedContractAsk)} />
                  <MetricCard label="Bid exit reference" value={price(selectedCandidate.selectedContractBid)} />
                  <MetricCard label="Live candidates" value={workspace.opportunity.liveCandidateCount} />
                  <MetricCard label="Shadow observations" value={workspace.opportunity.shadowCandidateCount} />
                </div>
                {workspace.opportunity.directionalConflict ? (
                  <div className="flex items-start gap-2 rounded-md border border-bear/40 bg-bear/10 p-3 text-sm text-bear">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    Opposing promoted CALL and PUT opportunities are unresolved. The engine fails closed as NO TRADE.
                  </div>
                ) : null}
              </div>
            )}
          </Panel>

          <Panel
            title="Manual entry confirmation"
            className="lg:col-span-4"
            action={
              workspace.activeReadyAlert ? (
                <Badge variant={secondsRemaining && secondsRemaining > 0 ? "bull" : "bear"}>
                  {secondsRemaining ?? 0}s
                </Badge>
              ) : (
                <Badge>Not active</Badge>
              )
            }
          >
            {workspace.activeReadyAlert && workspace.opportunity.state === "READY" ? (
              <form className="space-y-3" onSubmit={submitEntry}>
                <div className="rounded-md border border-bull/30 bg-bull/10 p-3 text-sm">
                  <p className="font-semibold text-bull">READY is temporary</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Confirm only after you manually enter the paper trade. The server rechecks the alert, time, risk, attempts, and one-position rule transactionally.
                  </p>
                </div>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  Actual option entry price
                  <input
                    className={inputClass()}
                    inputMode="decimal"
                    value={entryPrice}
                    onChange={(event) => setEntryPrice(event.target.value)}
                    aria-label="Actual option entry price"
                  />
                </label>
                <Button
                  className="w-full"
                  disabled={
                    confirmEntry.isPending ||
                    secondsRemaining === null ||
                    secondsRemaining <= 0
                  }
                  type="submit"
                >
                  {confirmEntry.isPending ? "Rechecking policy…" : "Confirm manual paper entry"}
                </Button>
              </form>
            ) : (
              <div className="flex min-h-36 flex-col items-center justify-center rounded-md border border-dashed border-panel-border p-4 text-center">
                <Clock3 className="mb-2 h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">No active READY window</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A promoted setup must pass every policy, risk, event, contract, and conflict gate.
                </p>
              </div>
            )}
          </Panel>

          <Panel
            title="Open position management"
            className="lg:col-span-7"
            action={
              workspace.openPosition ? <Badge variant="accent">1 contract open</Badge> : <Badge>Flat</Badge>
            }
          >
            {workspace.openPosition ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <MetricCard label="Contract" value={workspace.openPosition.contractSymbol} />
                  <MetricCard label="Actual entry" value={price(workspace.openPosition.actualEntryPrice)} />
                  <MetricCard label="Current bid reference" value={price(workspace.executionModel.currentExitBid)} />
                  <MetricCard label="Modeled net P&L" value={dollars(workspace.executionModel.modeledNetPnlDollarsPerContract)} tone={(workspace.executionModel.modeledNetPnlDollarsPerContract ?? 0) >= 0 ? "bull" : "bear"} />
                  <MetricCard label="Structural stop" value={price(workspace.openPosition.structuralStopLevel)} tone="bear" />
                  <MetricCard
                    label="$50 bid backstop"
                    value={price(Math.max(0, workspace.openPosition.actualEntryPrice - 0.5))}
                    tone="bear"
                    sublabel="Actual entry minus $0.50"
                  />
                  <MetricCard label="Target 1" value={price(workspace.openPosition.target1Level)} />
                  <MetricCard label="Target 2" value={price(workspace.openPosition.target2Level)} tone="bull" />
                  <MetricCard label="Time review" value={localTime(workspace.openPosition.timeStopReviewAt)} />
                </div>
                <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={submitExit}>
                  <input
                    className={inputClass()}
                    inputMode="decimal"
                    value={exitPrice}
                    onChange={(event) => setExitPrice(event.target.value)}
                    aria-label="Actual option exit price"
                    placeholder="Actual bid-side exit"
                  />
                  <select
                    className={inputClass()}
                    value={exitReason}
                    onChange={(event) => setExitReason(event.target.value as TradingPositionExitReason)}
                    aria-label="Exit reason"
                  >
                    {[
                      "TARGET_2",
                      "STRUCTURAL_STOP",
                      "PREMIUM_LOSS_BACKSTOP",
                      "TIME_STOP",
                      "MANDATORY_1555",
                      "ABSOLUTE_1600",
                      "MANUAL_DISCRETION",
                      "DATA_SAFETY_EXIT",
                      "OTHER",
                    ].map((reason) => (
                      <option key={reason} value={reason}>{reason.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                  <Button type="submit" disabled={closePosition.isPending}>
                    {closePosition.isPending ? "Recording…" : "Record manual exit"}
                  </Button>
                </form>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-panel-border p-5 text-center text-sm text-muted-foreground">
                No manually confirmed paper-equivalent position is open.
              </div>
            )}
          </Panel>

          <Panel title="Execution model" className="lg:col-span-5">
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="Entry reference" value={workspace.executionModel.entryReference} />
              <MetricCard label="Exit reference" value={workspace.executionModel.exitReference} />
              <MetricCard label="Ask" value={price(workspace.executionModel.plannedEntryAsk)} />
              <MetricCard label="Bid" value={price(workspace.executionModel.currentExitBid)} />
              <MetricCard label="Spread cost" value={dollars(workspace.executionModel.spreadCostDollarsPerContract)} />
              <MetricCard label="Configured fees" value={dollars(workspace.executionModel.commissionAndFeesDollarsPerContract)} sublabel="Not configured" />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Conservative baseline uses ask-side entry and bid-side exit. It does not promise a fill or model unconfigured broker fees.
            </p>
          </Panel>

          <Panel title="Scheduled-event restrictions" className="lg:col-span-7">
            <form className="grid gap-2 md:grid-cols-2" onSubmit={submitRestriction}>
              <select
                className={inputClass()}
                value={eventType}
                onChange={(event) => {
                  const next = event.target.value as TradingRestrictionEventType;
                  setEventType(next);
                  setEventTitle(
                    next === "CPI"
                      ? "CPI release"
                      : next === "EMPLOYMENT_SITUATION_NFP"
                        ? "Employment Situation / NFP"
                        : next === "FOMC"
                          ? "FOMC decision"
                          : "Major event restriction",
                  );
                }}
              >
                <option value="CPI">CPI — full day</option>
                <option value="EMPLOYMENT_SITUATION_NFP">Employment Situation / NFP — full day</option>
                <option value="FOMC">FOMC — full day</option>
                <option value="OTHER_MAJOR">Other major event — window</option>
              </select>
              <input
                className={inputClass()}
                type="date"
                value={eventMarketDate}
                onChange={(event) => setEventMarketDate(event.target.value)}
                aria-label="Restricted market date"
              />
              <input className={inputClass()} value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Event title" />
              {eventType === "OTHER_MAJOR" ? (
                <>
                  <input className={inputClass()} type="datetime-local" value={eventStart} onChange={(event) => setEventStart(event.target.value)} />
                  <input className={inputClass()} type="datetime-local" value={eventEnd} onChange={(event) => setEventEnd(event.target.value)} />
                </>
              ) : null}
              <Button className="md:col-span-2" type="submit" disabled={createEvent.isPending}>
                Add restriction for {eventMarketDate || workspace.currentMarketDate}
              </Button>
            </form>
            <div className="mt-3 space-y-2">
              {workspace.restrictionEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No configured restrictions for this market date.</p>
              ) : (
                workspace.restrictionEvents.map((restriction) => (
                  <div key={restriction.id} className="flex items-center justify-between gap-3 rounded-md border border-panel-border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{restriction.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {restriction.eventType.replaceAll("_", " ")} • {restriction.blockMode.replaceAll("_", " ")}
                        {restriction.windowStartAt ? ` • ${localTime(restriction.windowStartAt)}–${localTime(restriction.windowEndAt)}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteEvent.mutate(restriction.id)} disabled={deleteEvent.isPending}>
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Manual override audit" className="lg:col-span-5">
            <form className="space-y-2" onSubmit={submitOverride}>
              <select className={inputClass()} value={overrideAction} onChange={(event) => setOverrideAction(event.target.value as RecordTradingOverrideRequest["action"])}>
                <option value="ALLOW_ENTRY_DESPITE_BLOCK">Entry taken despite block</option>
                <option value="CLOSE_POSITION_OUTSIDE_ENGINE">Exit outside engine</option>
                <option value="IGNORE_TIME_STOP_REVIEW">Ignored time-stop review</option>
                <option value="OTHER">Other manual decision</option>
              </select>
              <textarea
                className="min-h-24 w-full rounded-md border border-panel-border bg-background p-3 text-sm outline-none focus:border-accent"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder="Required reason (minimum five characters)"
              />
              <Button className="w-full" type="submit" disabled={recordOverride.isPending || overrideReason.trim().length < 5}>
                Record override without changing engine policy
              </Button>
            </form>
          </Panel>

          {latestAction ? (
            <Panel title="Latest manual action" className="lg:col-span-12">
              <div className="flex items-start gap-3">
                {latestAction.actionState === "COMPLETED" ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-bull" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-bear" />
                )}
                <div>
                  <p className="font-mono text-sm font-semibold">{latestAction.primaryReasonCode.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {latestAction.actionState === "COMPLETED"
                      ? "The local paper-equivalent record was updated. No broker action occurred."
                      : "The server rejected the action after rechecking current policy and persistent state."}
                  </p>
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel title="Setup registry" className="lg:col-span-12" noPadding>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-panel-border bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Setup</th>
                    <th className="px-4 py-3">Direction</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Trigger</th>
                    <th className="px-4 py-3">Invalidation</th>
                    <th className="px-4 py-3">Live eligible</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.setupRegistry.entries.map((entry) => (
                    <tr key={entry.setupId} className="border-b border-panel-border/60 align-top">
                      <td className="px-4 py-3 font-medium">{entry.displayName}</td>
                      <td className="px-4 py-3 font-mono">{entry.directionCapability}</td>
                      <td className="px-4 py-3"><Badge variant={entry.promotionStatus === "LIVE" ? "bull" : "wait"}>{entry.promotionStatus}</Badge></td>
                      <td className="max-w-sm px-4 py-3 text-muted-foreground">{entry.triggerMethod}</td>
                      <td className="max-w-sm px-4 py-3 text-muted-foreground">{entry.invalidationMethod}</td>
                      <td className="px-4 py-3">{entry.canCreateLiveOpportunity ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Exit-policy research" className="lg:col-span-7" noPadding>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="border-b border-panel-border bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Policy</th>
                    <th className="px-4 py-3">N</th>
                    <th className="px-4 py-3">Win rate</th>
                    <th className="px-4 py-3">Expectancy</th>
                    <th className="px-4 py-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.exitPolicyResearch.rows.map((row) => (
                    <tr key={row.policy} className="border-b border-panel-border/60">
                      <td className="px-4 py-3 font-medium">{row.policy.replaceAll("_", " ")}</td>
                      <td className="px-4 py-3 font-mono">{row.sampleSize}</td>
                      <td className="px-4 py-3 font-mono">{row.winRatePercent === null ? "—" : `${row.winRatePercent.toFixed(1)}%`}</td>
                      <td className="px-4 py-3 font-mono">{dollars(row.netExpectancyDollars)}</td>
                      <td className="px-4 py-3 font-mono">{dollars(row.totalNetPnlDollars)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Runtime and ownership" className="lg:col-span-5">
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-md border border-panel-border p-3">
                <Database className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-semibold">{workspace.automation.runtimeState}</p>
                  <p className="text-xs text-muted-foreground">Last heartbeat: {localTime(workspace.automation.lastHeartbeatAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-md border border-panel-border p-3">
                <ShieldCheck className="h-5 w-5 text-bull" />
                <div>
                  <p className="text-sm font-semibold">Persistent backend only</p>
                  <p className="text-xs text-muted-foreground">Browser rendering never owns Discord position-management delivery.</p>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Gamma and volatility relationships remain research-only. Manual overrides are stored separately and never rewrite pure-engine performance.
              </p>
            </div>
          </Panel>

          <Panel title="Recent paper-equivalent positions" className="lg:col-span-12" noPadding>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-panel-border bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Opened</th>
                    <th className="px-4 py-3">Setup</th>
                    <th className="px-4 py-3">Direction</th>
                    <th className="px-4 py-3">Contract</th>
                    <th className="px-4 py-3">Entry</th>
                    <th className="px-4 py-3">Exit</th>
                    <th className="px-4 py-3">P&amp;L</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.recentPositions.length === 0 ? (
                    <tr><td className="px-4 py-6 text-center text-muted-foreground" colSpan={8}>No recorded positions.</td></tr>
                  ) : (
                    workspace.recentPositions.map((positionRow) => (
                      <tr key={positionRow.id} className="border-b border-panel-border/60">
                        <td className="px-4 py-3">{localTime(positionRow.openedAt)}</td>
                        <td className="px-4 py-3">{positionRow.setupId.replaceAll("_", " ")}</td>
                        <td className="px-4 py-3 font-mono">{positionRow.direction}</td>
                        <td className="px-4 py-3 font-mono">{positionRow.contractSymbol}</td>
                        <td className="px-4 py-3 font-mono">{price(positionRow.actualEntryPrice)}</td>
                        <td className="px-4 py-3 font-mono">{price(positionRow.actualExitPrice)}</td>
                        <td className="px-4 py-3 font-mono">{dollars(positionRow.realizedPnlDollars)}</td>
                        <td className="px-4 py-3"><Badge variant={positionRow.status === "OPEN" ? "accent" : "default"}>{positionRow.status}</Badge></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
