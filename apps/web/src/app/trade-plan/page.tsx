"use client";

import { AlertTriangle, CheckCircle2, Clock3, Info, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { SchwabAssistedSizingPanel } from "@/components/trade-plan/schwab-assisted-sizing-panel";
import { useSpyZeroDteTradePlanAssembly } from "@/hooks/use-spy-trade-plan-assembly";
import {
  formatNullableNumber,
  formatNullablePercent,
  formatNullablePrice,
  formatNullableTimestamp,
  getDirectionLabel,
  getTradePlanStateView,
  type TradePlanViewTone,
} from "@/lib/trade-plan-assembly-view";

function badgeVariant(tone: TradePlanViewTone): "default" | "bull" | "bear" | "wait" {
  return tone;
}

function directionTone(direction: "CALLS" | "PUTS" | "NONE" | "UNAVAILABLE") {
  if (direction === "CALLS") return "bull" as const;
  if (direction === "PUTS") return "bear" as const;
  if (direction === "UNAVAILABLE") return "bear" as const;
  return "default" as const;
}

export default function TradePlanPage() {
  const query = useSpyZeroDteTradePlanAssembly();
  const plan = query.isError ? null : query.data ?? null;
  const view = plan ? getTradePlanStateView(plan.planState) : null;

  return (
    <div className="mx-auto max-w-[1600px] min-w-0">
      <PageHeader
        title="Trade Plan"
        description="Deterministic SPY 0DTE structure, contract selection, and read-only sizing references. No order or guaranteed fill."
        action={
          plan && view ? (
            <Badge variant={badgeVariant(view.tone)}>{plan.planState.replaceAll("_", " ")}</Badge>
          ) : null
        }
      />

      {query.isError ? (
        <Panel title="Trade Plan unavailable" isError>
          <span />
        </Panel>
      ) : query.isLoading || !plan || !view ? (
        <Panel title="Loading deterministic Trade Plan" isLoading>
          <span />
        </Panel>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
          <Panel
            title="Plan Status"
            className="min-w-0 lg:col-span-3"
            action={<Badge variant={directionTone(plan.direction)}>{getDirectionLabel(plan.direction)}</Badge>}
          >
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <StateIcon state={plan.planState} />
                <div className="min-w-0 space-y-1">
                  <h2 className="font-mono text-base font-semibold break-words">{view.title}</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">{view.description}</p>
                  {plan.warningCode ? (
                    <p className="flex items-start gap-2 pt-1 text-xs text-bear">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      A source-quality limitation is active. Details are available below.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3">
                <CompactStat label="SPY" value={formatNullablePrice(plan.currentPrice)} />
                <CompactStat label="Session" value={plan.sessionPhase ?? "—"} />
                <CompactStat label="Calculated" value={formatNullableTimestamp(plan.calculatedAt)} className="col-span-2 sm:col-span-1" />
              </div>
            </div>
          </Panel>

          <Panel title="Bias and Confidence" className="min-w-0 lg:col-span-1">
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="Bias" value={plan.bias.biasState} tone={directionTone(plan.direction)} />
              <MetricCard
                label="Structural Evidence Confidence"
                value={formatNullablePercent(plan.bias.confidenceScore)}
                sublabel="Structural evidence only"
              />
              <MetricCard label="Bullish Evidence" value={plan.bias.bullishEvidenceCount} tone="bull" />
              <MetricCard label="Bearish Evidence" value={plan.bias.bearishEvidenceCount} tone="bear" />
              <MetricCard label="Neutral Evidence" value={plan.bias.neutralEvidenceCount} />
              <MetricCard
                label="Usable Evidence"
                value={`${plan.bias.usableDirectionalEvidenceCount} / ${plan.bias.minimumUsableDirectionalEvidenceCount}`}
              />
            </div>
          </Panel>

          <Panel title="Entry Condition" className="min-w-0 lg:col-span-2">
            {plan.entryCondition.state === "NOT_APPLICABLE" ? (
              <EmptyState message="No active entry condition applies to the current Plan State." />
            ) : plan.entryCondition.state === "UNAVAILABLE" ? (
              <EmptyState message="The entry condition is currently unavailable." tone="error" />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard label="Condition" value={plan.entryCondition.state} tone={plan.entryCondition.state === "WAITING" ? "wait" : "bull"} />
                <MetricCard
                  label={plan.entryCondition.state === "WAITING" ? "Trigger Level" : "Current Planning Reference"}
                  value={formatNullablePrice(plan.entryCondition.planningReferencePrice)}
                  sublabel="Planning reference only"
                />
                <MetricCard label="Current SPY Price" value={formatNullablePrice(plan.entryCondition.currentPrice)} />
                <MetricCard label="Comparison" value={plan.entryCondition.comparison?.replaceAll("_", " ") ?? "—"} />
                <MetricCard
                  label="Signed Distance"
                  value={formatNullableNumber(plan.entryCondition.signedDistancePoints, 4)}
                  sublabel="SPY points"
                />
                <MetricCard
                  label="Trigger Satisfied"
                  value={
                    plan.entryCondition.triggerSatisfied === null
                      ? "—"
                      : plan.entryCondition.triggerSatisfied
                        ? "Yes"
                        : "No"
                  }
                />
                <MetricCard label="Source VWAP" value={formatNullablePrice(plan.entryCondition.sourceValues.vwap)} />
                <MetricCard
                  label="Opening Range Boundary"
                  value={formatNullablePrice(plan.entryCondition.sourceValues.openingRangeBoundary)}
                />
                <MetricCard
                  label="Reference Type"
                  value={plan.entryCondition.planningReferenceType.replaceAll("_", " ")}
                />
              </div>
            )}
          </Panel>

          {plan.planState === "READY" ? (
            <Panel title="Selected Contract" className="min-w-0 lg:col-span-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Contract Symbol"
                  value={<span className="break-all text-sm">{plan.selectedContract.contractSymbol ?? "—"}</span>}
                  className="sm:col-span-2"
                />
                <MetricCard label="Direction" value={plan.selectedContract.contractDirection ?? "—"} tone={directionTone(plan.direction)} />
                <MetricCard label="Moneyness" value={plan.selectedContract.moneyness ?? "—"} />
                <MetricCard label="Strike" value={formatNullablePrice(plan.selectedContract.strikePrice)} />
                <MetricCard label="Expiration" value={plan.selectedContract.expirationDate ?? "—"} />
                <MetricCard label="Bid" value={formatNullablePrice(plan.selectedContract.bid)} />
                <MetricCard label="Ask" value={formatNullablePrice(plan.selectedContract.ask)} />
                <MetricCard
                  label="Midpoint Reference"
                  value={formatNullablePrice(plan.premiumReference.value)}
                  sublabel="Reference only — no fill is guaranteed"
                />
                <MetricCard label="Spread" value={formatNullablePercent(plan.selectedContract.spreadPercent)} />
                <MetricCard label="Quote Freshness" value={plan.selectedContract.quoteFreshnessState ?? "—"} />
                <MetricCard label="Quote Time" value={formatNullableTimestamp(plan.selectedContract.quoteAt)} />
                <MetricCard label="Open Interest" value={formatNullableNumber(plan.selectedContract.openInterest, 0)} />
                <MetricCard label="Volume" value={formatNullableNumber(plan.selectedContract.volume, 0)} />
                <MetricCard label="Delta" value={formatNullableNumber(plan.selectedContract.delta, 4)} />
                <MetricCard label="Selection Rank" value={formatNullableNumber(plan.selectedContract.selectionRank, 0)} />
              </div>
            </Panel>
          ) : null}

          {plan.structuralInvalidation.candidateId || plan.primaryObjective.candidateId ? (
            <Panel title="Structural Plan" className="min-w-0 lg:col-span-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  label="Structural Invalidation Reference"
                  value={formatNullablePrice(plan.structuralInvalidation.level)}
                  sublabel={plan.structuralInvalidation.levelType?.replaceAll("_", " ") ?? "Reference only"}
                  tone="bear"
                />
                <MetricCard
                  label="Primary Underlying Objective"
                  value={formatNullablePrice(plan.primaryObjective.level)}
                  sublabel={plan.primaryObjective.levelSemantic?.replaceAll("_", " ") ?? "Reference only"}
                  tone="bull"
                />
                <MetricCard
                  label="Underlying Reward-to-Risk"
                  value={formatNullableNumber(plan.underlyingRiskReward.rewardRiskRatio, 4)}
                  sublabel="SPY underlying-price points only"
                />
                <MetricCard
                  label="SPY Risk Distance"
                  value={formatNullableNumber(plan.underlyingRiskReward.riskDistancePoints, 4)}
                  sublabel="SPY points"
                />
                <MetricCard
                  label="SPY Reward Distance"
                  value={formatNullableNumber(plan.underlyingRiskReward.rewardDistancePoints, 4)}
                  sublabel="SPY points"
                />
                <MetricCard
                  label="Minimum Required Ratio"
                  value={formatNullableNumber(plan.underlyingRiskReward.minimumRequiredRewardRiskRatio, 2)}
                />
              </div>
            </Panel>
          ) : null}

          <SchwabAssistedSizingPanel planState={plan.planState} />

          <Panel title="Plan Explanation" className="min-w-0 lg:col-span-2">
            <div className="space-y-3 text-sm leading-relaxed">
              <p>{view.description}</p>
              {plan.planState === "NO_QUALIFIED_CONTRACT" ? (
                <p className="text-muted-foreground">
                  The underlying setup remains structurally qualified, but no fallback contract or manual override is supplied.
                </p>
              ) : null}
              {plan.planState === "WAITING_FOR_TRIGGER" ? (
                <p className="text-muted-foreground">
                  Contract selection stays deferred until the underlying trigger is satisfied.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                This page displays deterministic state and references. Position sizing requires explicit caller inputs and remains reference-only; no order, premium target, or premium stop is generated.
              </p>
            </div>
          </Panel>

          <Panel title="Disclosures" className="min-w-0 lg:col-span-1">
            <ul className="space-y-2 text-xs text-muted-foreground">
              <Disclosure text="Planning reference only" />
              <Disclosure text="Structural invalidation reference only" />
              <Disclosure text="Underlying objective reference only" />
              <Disclosure text="Midpoint reference only" />
              <Disclosure text="No order is generated" />
              <Disclosure text="Sizing quantity is reference only" />
              <Disclosure text="Schwab access is read-only and explicit" />
              <Disclosure text="No fill is guaranteed" />
              <Disclosure text="SPY reward-to-risk is not option-premium reward-to-risk" />
            </ul>
          </Panel>

          <Panel title="Source Details" className="min-w-0 lg:col-span-3">
            <details className="group min-w-0">
              <summary className="cursor-pointer select-none text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent">
                View methodology versions, source states, reason codes, and timestamps
              </summary>
              <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SourceBlock
                  title="Market State"
                  version={plan.sourceSummary.marketState.version}
                  state={plan.sourceSummary.marketState.engineState}
                  calculatedAt={plan.sourceSummary.marketState.calculatedAt}
                  warning={plan.sourceSummary.marketState.warningCode}
                />
                <SourceBlock
                  title="Bias"
                  version={plan.sourceSummary.bias.version}
                  state={`${plan.sourceSummary.bias.engineState} / ${plan.sourceSummary.bias.biasState}`}
                  calculatedAt={plan.sourceSummary.bias.calculatedAt}
                  warning={plan.sourceSummary.bias.warningCode}
                />
                <SourceBlock
                  title="Eligibility"
                  version={plan.sourceSummary.tradePlan.version}
                  state={`${plan.sourceSummary.tradePlan.engineState} / ${plan.sourceSummary.tradePlan.setupState}`}
                  calculatedAt={plan.sourceSummary.tradePlan.calculatedAt}
                  reason={plan.sourceSummary.tradePlan.primaryReasonCode}
                  warning={plan.sourceSummary.tradePlan.warningCode}
                />
                <SourceBlock
                  title="Risk"
                  version={plan.sourceSummary.risk.version}
                  state={`${plan.sourceSummary.risk.engineState} / ${plan.sourceSummary.risk.frameworkState}`}
                  calculatedAt={plan.sourceSummary.risk.calculatedAt}
                  reason={plan.sourceSummary.risk.primaryReasonCode}
                  warning={plan.sourceSummary.risk.warningCode}
                />
                <SourceBlock
                  title="Contract"
                  version={plan.sourceSummary.contract.version}
                  state={`${plan.sourceSummary.contract.engineState} / ${plan.sourceSummary.contract.selectionState}`}
                  calculatedAt={plan.sourceSummary.contract.calculatedAt}
                  reason={plan.sourceSummary.contract.primaryReasonCode}
                  warning={plan.sourceSummary.contract.warningCode}
                />
                <div className="min-w-0 rounded-md border border-panel-border bg-background/40 p-3 text-xs">
                  <p className="font-semibold">Composition</p>
                  <dl className="mt-2 space-y-1 text-muted-foreground">
                    <Detail label="Same snapshot" value={plan.sourceSummary.upstreamSameSnapshotGuaranteed ? "Yes" : "No"} />
                    <Detail label="Contract compatibility" value={plan.sourceSummary.contract.sourceCompatibilityState} />
                    <Detail label="Chain fetched" value={formatNullableTimestamp(plan.sourceSummary.contract.sourceOptionsChainFetchedAt)} />
                    <Detail label="Contract quote" value={formatNullableTimestamp(plan.sourceSummary.selectedContractQuoteAt)} />
                    <Detail label="Assembly reason" value={plan.primaryReasonCode} />
                    <Detail label="Assembly warning" value={plan.warningCode ?? "None"} />
                  </dl>
                </div>
              </div>
            </details>
          </Panel>
        </div>
      )}
    </div>
  );
}

function StateIcon({ state }: { state: string }) {
  if (state === "READY") return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-bull" aria-hidden />;
  if (state === "WAITING_FOR_TRIGGER" || state === "NO_QUALIFIED_CONTRACT" || state === "NOT_QUALIFIED") {
    return <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-wait" aria-hidden />;
  }
  if (state === "UNAVAILABLE") return <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-bear" aria-hidden />;
  return <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />;
}

function CompactStat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 rounded-md border border-panel-border bg-background/40 p-2 ${className}`}>
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words font-mono text-xs tabular-nums">{value}</p>
    </div>
  );
}

function EmptyState({ message, tone = "default" }: { message: string; tone?: "default" | "error" }) {
  return (
    <div className={`rounded-md border border-dashed p-4 text-sm ${tone === "error" ? "border-bear/30 text-bear" : "border-panel-border text-muted-foreground"}`}>
      {message}
    </div>
  );
}

function Disclosure({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </li>
  );
}

function SourceBlock({
  title,
  version,
  state,
  calculatedAt,
  reason,
  warning,
}: {
  title: string;
  version: string;
  state: string;
  calculatedAt: string;
  reason?: string;
  warning: string | null;
}) {
  return (
    <div className="min-w-0 rounded-md border border-panel-border bg-background/40 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{title}</p>
        <span className="font-mono text-muted-foreground">{version}</span>
      </div>
      <dl className="mt-2 space-y-1 text-muted-foreground">
        <Detail label="State" value={state} />
        <Detail label="Calculated" value={formatNullableTimestamp(calculatedAt)} />
        {reason ? <Detail label="Reason" value={reason} /> : null}
        <Detail label="Warning" value={warning ?? "None"} />
      </dl>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_1fr] gap-2">
      <dt>{label}</dt>
      <dd className="min-w-0 break-words text-right font-mono">{value}</dd>
    </div>
  );
}
