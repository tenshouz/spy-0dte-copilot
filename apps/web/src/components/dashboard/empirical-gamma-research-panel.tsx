"use client";

import type {
  EmpiricalGammaResearchBaseline,
  EmpiricalGammaResearchFinding,
} from "@spy-copilot/shared";
import { Database, FlaskConical, LockKeyhole } from "lucide-react";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { useEmpiricalGammaResearch } from "@/hooks/use-gamma-research";
import {
  formatGammaResearchDelta,
  formatGammaResearchMoney,
  formatGammaResearchPercent,
  gammaResearchEvidenceLabel,
  gammaResearchEvidenceTone,
  gammaResearchFeatureLabel,
  gammaResearchReasonCopy,
  gammaResearchSetupLabel,
  visibleGammaResearchFindings,
} from "@/lib/empirical-gamma-research-view";

function BaselineTable({ rows }: { rows: readonly EmpiricalGammaResearchBaseline[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-panel-border bg-background/30">
      <div className="border-b border-panel-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Setup-and-direction baselines
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          No eligible READY outcomes yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-panel-border">
                <th className="px-3 py-2 font-medium">Setup</th>
                <th className="px-3 py-2 font-medium">Direction</th>
                <th className="px-3 py-2 text-right font-medium">N</th>
                <th className="px-3 py-2 text-right font-medium">W / L / BE</th>
                <th className="px-3 py-2 text-right font-medium">Win rate</th>
                <th className="px-3 py-2 text-right font-medium">Expectancy</th>
                <th className="px-3 py-2 text-right font-medium">Total P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.setupType}-${row.direction}`}
                  className="border-b border-panel-border/70 last:border-0"
                >
                  <td className="px-3 py-2 font-medium">
                    {gammaResearchSetupLabel(row.setupType)}
                  </td>
                  <td className="px-3 py-2 font-mono">{row.direction}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {row.metrics.tradeCount}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {row.metrics.wins} / {row.metrics.losses} / {row.metrics.breakevens}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatGammaResearchPercent(row.metrics.winRatePercent)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatGammaResearchMoney(row.metrics.expectancyDollars)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatGammaResearchMoney(row.metrics.totalPnlDollars)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FindingsTable({ rows }: { rows: readonly EmpiricalGammaResearchFinding[] }) {
  const visible = visibleGammaResearchFindings(rows);
  return (
    <div className="overflow-hidden rounded-md border border-panel-border bg-background/30">
      <div className="border-b border-panel-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Matched Gamma findings · bucket versus all other buckets in the same setup, direction, and feature
      </div>
      {visible.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          Gamma context findings will appear after reviewed READY outcomes are available.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-panel-border">
                <th className="px-3 py-2 font-medium">Setup</th>
                <th className="px-3 py-2 font-medium">Direction</th>
                <th className="px-3 py-2 font-medium">Feature</th>
                <th className="px-3 py-2 font-medium">Observed bucket</th>
                <th className="px-3 py-2 text-right font-medium">N</th>
                <th className="px-3 py-2 text-right font-medium">Win rate</th>
                <th className="px-3 py-2 text-right font-medium">vs comparator</th>
                <th className="px-3 py-2 text-right font-medium">Expectancy Δ</th>
                <th className="px-3 py-2 font-medium">Research state</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={`${row.setupType}-${row.direction}-${row.featureType}-${row.bucketKey}`}
                  className="border-b border-panel-border/70 last:border-0"
                >
                  <td className="px-3 py-2 font-medium">
                    {gammaResearchSetupLabel(row.setupType)}
                  </td>
                  <td className="px-3 py-2 font-mono">{row.direction}</td>
                  <td className="px-3 py-2">
                    {gammaResearchFeatureLabel(row.featureType)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.bucketLabel}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {row.bucketMetrics.tradeCount}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatGammaResearchPercent(row.bucketMetrics.winRatePercent)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatGammaResearchDelta(row.winRateDeltaPercentagePoints)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatGammaResearchMoney(row.expectancyDeltaDollars)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={gammaResearchEvidenceTone(row.evidenceState)}>
                      {gammaResearchEvidenceLabel(row.evidenceState)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > visible.length && (
        <div className="border-t border-panel-border px-3 py-2 text-[11px] text-muted-foreground">
          Showing the {visible.length} highest-priority findings out of {rows.length}.
        </div>
      )}
    </div>
  );
}

export function EmpiricalGammaResearchPanel({ className }: { className?: string }) {
  const query = useEmpiricalGammaResearch();
  const response = query.data ?? null;
  const research = response?.research ?? null;
  const candidateCount =
    research?.findings.filter((row) =>
      ["POSITIVE_CANDIDATE", "NEGATIVE_CANDIDATE"].includes(row.evidenceState),
    ).length ?? 0;

  return (
    <Panel
      title="Empirical Gamma Research"
      className={className}
      action={
        <Badge variant={response?.engineState === "AVAILABLE" ? "accent" : "default"}>
          {response?.engineState ?? (query.isLoading ? "Loading" : "Unavailable")}
        </Badge>
      }
      isLoading={query.isLoading}
      isError={query.isError}
    >
      {response && research ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-2">
              <FlaskConical className="mt-0.5 h-4 w-4 text-accent" />
              <div>
                <p className="text-sm font-semibold">Research-only, setup-matched evidence</p>
                <p className="mt-1 max-w-4xl text-xs leading-relaxed text-muted-foreground">
                  Each Gamma bucket is compared with all other buckets inside the same named setup,
                  direction, and feature. Only LIVE, complete Gamma inputs are eligible for feature
                  findings. Outcomes are user-reviewed READY snapshots. This is observational
                  evidence—not a causal result or a live directional weight.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              {research.dataStartMarketDate && research.dataEndMarketDate
                ? `${research.dataStartMarketDate} → ${research.dataEndMarketDate}`
                : "No eligible history"}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard
              label="Eligible READY outcomes"
              value={research.counts.eligibleResearchObservations}
              sublabel={`${research.counts.reviewedTradeOutcomeSnapshots} reviewed trade outcomes total`}
            />
            <MetricCard
              label="Full Gamma context"
              value={research.counts.fullContextObservations}
              sublabel={`${research.counts.legacyPartialContextObservations} legacy partial`}
            />
            <MetricCard
              label="Setup baselines"
              value={research.baselines.length}
              sublabel="Matched by setup and direction"
            />
            <MetricCard
              label="Feature buckets"
              value={research.findings.length}
              sublabel="Regimes, walls, cliffs, transitions"
            />
            <MetricCard
              label="Observed candidates"
              value={candidateCount}
              sublabel="Still blocked from live weighting"
            />
          </div>

          <div className="flex items-start gap-2 rounded-md border border-wait/30 bg-wait-muted px-3 py-2 text-xs text-wait">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Automatic Gamma weighting is disabled. A bucket needs at least {research.thresholds.minimumBucketTradeCount}
              {" "}observations, at least {research.thresholds.minimumComparatorTradeCount} comparator observations,
              non-overlapping 95% Wilson intervals, positive/negative expectancy agreement, and a separate locked
              out-of-sample validation before any weighting review.
            </p>
          </div>

          <div className="rounded-md border border-panel-border bg-background/30 px-3 py-2 text-xs text-muted-foreground">
            {gammaResearchReasonCopy(response.primaryReasonCode)}
          </div>

          <BaselineTable rows={research.baselines} />
          <FindingsTable rows={research.findings} />

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Win rate uses wins divided by all observations, including breakevens. Findings are
            exploratory, use snapshot-level observations, and do not apply a multiple-comparison
            correction; candidate labels therefore require independent holdout confirmation.
          </p>
        </div>
      ) : response ? (
        <div className="rounded-md border border-wait/30 bg-wait-muted px-3 py-3 text-xs text-wait">
          {gammaResearchReasonCopy(response.primaryReasonCode)}
        </div>
      ) : null}
    </Panel>
  );
}
