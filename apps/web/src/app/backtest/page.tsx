"use client";

import type {
  PointInTimeBacktestBreakdown,
  PointInTimeBacktestEpisode,
  PointInTimeBacktestRunPayload,
  PointInTimeBacktestRunSummary,
} from "@spy-copilot/shared";
import { Eye, FlaskConical, History, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/panels/data-table";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCreatePointInTimeBacktestRun,
  usePointInTimeBacktestRun,
  usePointInTimeBacktestRuns,
} from "@/hooks/use-point-in-time-backtest";
import {
  BACKTEST_OUTCOME_LABEL,
  buildPointInTimeBacktestRequest,
  formatBacktestEasternTime,
  formatBacktestMoney,
  formatBacktestNumber,
  formatBacktestPercent,
} from "@/lib/point-in-time-backtest-view";

function outcomeVariant(state: PointInTimeBacktestEpisode["outcomeState"]) {
  if (state === "TARGET_FIRST") return "bull" as const;
  if (state === "STOP_FIRST") return "bear" as const;
  if (state === "AMBIGUOUS_SAME_CANDLE") return "wait" as const;
  return "default" as const;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-md border border-panel-border bg-background/30 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
      {detail ? <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-panel-border bg-background/30 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-mono text-xs">{value}</div>
    </div>
  );
}

function RunResult({ run }: { run: PointInTimeBacktestRunPayload }) {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(
    run.episodes[0]?.episodeId ?? null,
  );
  useEffect(() => {
    setSelectedEpisodeId(run.episodes[0]?.episodeId ?? null);
  }, [run.id, run.episodes]);
  const selectedEpisode =
    run.episodes.find((episode) => episode.episodeId === selectedEpisodeId) ??
    run.episodes[0] ??
    null;

  const episodeColumns: DataTableColumn<PointInTimeBacktestEpisode>[] = [
    {
      key: "entry",
      header: "Historical Entry",
      render: (row) => (
        <div>
          <div className="font-mono text-xs">{formatBacktestEasternTime(row.entryAt)}</div>
          <div className="text-[11px] text-muted-foreground">{row.marketDate}</div>
        </div>
      ),
    },
    {
      key: "setup",
      header: "Plan",
      render: (row) => (
        <div className="space-y-1">
          <Badge variant={row.direction === "CALLS" ? "bull" : "bear"}>{row.direction}</Badge>
          <div className="max-w-[190px] text-[11px] text-muted-foreground">{row.setupType ?? "UNAVAILABLE"}</div>
          <div className="text-[10px] text-muted-foreground">{row.replaySourceMode.replaceAll("_", " ")}</div>
        </div>
      ),
    },
    {
      key: "levels",
      header: "Entry / Stop / Target",
      render: (row) => (
        <div className="font-mono text-xs">
          {row.entryPrice.toFixed(2)} / {row.invalidationLevel.toFixed(2)} / {row.objectiveLevel.toFixed(2)}
        </div>
      ),
    },
    {
      key: "outcome",
      header: "Outcome",
      render: (row) => <Badge variant={outcomeVariant(row.outcomeState)}>{BACKTEST_OUTCOME_LABEL[row.outcomeState]}</Badge>,
    },
    {
      key: "r",
      header: "Realized R",
      align: "right",
      render: (row) => formatBacktestNumber(row.realizedRMultiple),
    },
    {
      key: "option",
      header: "Option Estimate",
      align: "right",
      render: (row) => formatBacktestMoney(row.estimatedOptionPnlPerContract),
    },
    {
      key: "review",
      header: "Review",
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelectedEpisodeId(row.episodeId)}>
          <Eye className="mr-1 h-3.5 w-3.5" /> Review
        </Button>
      ),
    },
  ];

  const breakdownColumns: DataTableColumn<PointInTimeBacktestBreakdown>[] = [
    { key: "dimension", header: "Dimension", render: (row) => row.dimension },
    { key: "bucket", header: "Bucket", render: (row) => <span className="font-mono text-xs">{row.bucket}</span> },
    { key: "episodes", header: "Episodes", align: "right", render: (row) => row.episodeCount },
    { key: "wins", header: "Target / Stop", align: "right", render: (row) => `${row.targetFirstCount} / ${row.stopFirstCount}` },
    { key: "winrate", header: "Win Rate", align: "right", render: (row) => formatBacktestPercent(row.winRatePercent) },
    { key: "r", header: "Average R", align: "right", render: (row) => formatBacktestNumber(row.averageRMultiple) },
  ];

  return (
    <>
      <Panel title="Backtest Scorecard" className="mb-3" action={<Badge variant="accent">POINT-IN-TIME V1</Badge>}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Replay Boundaries" value={run.source.decisionCycleCount} detail={`${run.source.marketDateCount} market dates`} />
          <Metric label="Trade Episodes" value={run.summary.episodeCount} detail="First qualified plan per unique signature" />
          <Metric label="Resolved Win Rate" value={formatBacktestPercent(run.summary.winRatePercent)} detail={`${run.summary.resolvedDirectionalCount} target/stop outcomes`} />
          <Metric label="Average R" value={formatBacktestNumber(run.summary.averageRMultiple)} detail="Only episodes with a defined exit" />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Exact Market-State" value={run.source.exactMarketStateBoundaryCount} />
          <Metric label="Legacy Frozen Plans" value={run.source.legacyFrozenAssemblyBoundaryCount} />
          <Metric label="Historical Underlying" value={run.source.historicalUnderlyingBoundaryCount} />
          <Metric label="Option-Chain Snapshots" value={run.source.optionsChainSnapshotCount} />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Target First" value={run.summary.targetFirstCount} />
          <Metric label="Stop First" value={run.summary.stopFirstCount} />
          <Metric label="Ambiguous" value={run.summary.ambiguousCount} />
          <Metric label="Insufficient Coverage" value={run.summary.insufficientFutureDataCount} />
        </div>
        <div className="mt-3 rounded-md border border-accent/20 bg-accent/5 p-3 text-xs leading-relaxed text-muted-foreground">
          The engine uses the strongest available point-in-time source for each date. V1.5+ captures are recomputed from their stored Market State. Pre-V1.5 captures use the exact frozen plan and reconstruct outcome candles from captured prices. Dates with no captures are replayed from Schwab five-minute price history using current price-action rules. Historical options, GEX, DEX, contract selection, and premium P&L remain unavailable until a historical options dataset is connected. No future candle is visible to the plan.
        </div>
      </Panel>

      <Panel title="Historical Trade Episodes" className="mb-3" noPadding>
        <DataTable columns={episodeColumns} rows={run.episodes} rowKey={(row) => row.episodeId} emptyMessage="No qualified trade episodes were found in the selected replay period." />
      </Panel>

      {selectedEpisode ? (
        <Panel title="Recomputed Historical Trade Plan" className="mb-3" action={<Badge variant={selectedEpisode.direction === "CALLS" ? "bull" : "bear"}>{selectedEpisode.direction}</Badge>}>
          <div className="mb-3 text-xs text-muted-foreground">
            This plan was produced at {formatBacktestEasternTime(selectedEpisode.entryAt)} using {selectedEpisode.replaySourceMode.replaceAll("_", " ").toLowerCase()}. The outcome below was calculated afterward and did not influence the plan.
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem label="Replay Source" value={selectedEpisode.replaySourceMode.replaceAll("_", " ")} />
            <DetailItem label="Plan State" value={selectedEpisode.sourceAssembly.planState} />
            <DetailItem label="Setup" value={selectedEpisode.setupType ?? "UNAVAILABLE"} />
            <DetailItem label="Trigger" value={formatBacktestNumber(selectedEpisode.triggerLevel)} />
            <DetailItem label="Confirmation" value={String(selectedEpisode.planSnapshot.entryCondition.confirmationPassed ?? false)} />
            <DetailItem label="Entry Price" value={selectedEpisode.entryPrice.toFixed(2)} />
            <DetailItem label="Invalidation" value={selectedEpisode.invalidationLevel.toFixed(2)} />
            <DetailItem label="Primary Objective" value={selectedEpisode.objectiveLevel.toFixed(2)} />
            <DetailItem label="Planned R:R" value={selectedEpisode.plannedRewardRiskRatio.toFixed(2)} />
            <DetailItem label="Contract" value={selectedEpisode.selectedContractSymbol ?? "UNAVAILABLE"} />
            <DetailItem label="Entry Ask" value={formatBacktestNumber(selectedEpisode.entryPremiumAsk)} />
            <DetailItem label="Alignment Score" value={formatBacktestNumber(selectedEpisode.executionAlignmentScore, 0)} />
            <DetailItem label="Gamma Regime" value={selectedEpisode.gammaRegime ?? "UNAVAILABLE"} />
          </div>
          <div className="mt-3 border-t border-panel-border pt-3">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Observed After the Plan</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <DetailItem label="Outcome" value={BACKTEST_OUTCOME_LABEL[selectedEpisode.outcomeState]} />
              <DetailItem label="Resolved At" value={formatBacktestEasternTime(selectedEpisode.resolvedAt)} />
              <DetailItem label="MFE" value={`${selectedEpisode.maximumFavorableExcursionPoints.toFixed(2)} points`} />
              <DetailItem label="MAE" value={`${selectedEpisode.maximumAdverseExcursionPoints.toFixed(2)} points`} />
              <DetailItem label="Realized R" value={formatBacktestNumber(selectedEpisode.realizedRMultiple)} />
              <DetailItem label="Option P&L Estimate" value={formatBacktestMoney(selectedEpisode.estimatedOptionPnlPerContract)} />
              <DetailItem label="Option Outcome Source" value={selectedEpisode.optionOutcomeState} />
              <DetailItem label="Duration" value={selectedEpisode.durationMinutes === null ? "—" : `${selectedEpisode.durationMinutes.toFixed(0)} minutes`} />
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Performance Breakdowns" className="mb-3" noPadding>
        <DataTable columns={breakdownColumns} rows={run.breakdowns} rowKey={(row) => `${row.dimension}:${row.bucket}`} emptyMessage="No episode breakdowns are available." />
      </Panel>

      <Panel title="Replay Audit Issues">
        {run.issues.length === 0 ? (
          <div className="text-sm text-muted-foreground">No source validation or no-look-ahead issues were detected.</div>
        ) : (
          <div className="space-y-2">
            {run.issues.map((issue) => {
              const issueClass = issue.severity === "ERROR"
                ? "border-bear/20 bg-bear/5"
                : issue.severity === "WARNING"
                  ? "border-wait/20 bg-wait/5"
                  : "border-accent/20 bg-accent/5";
              const textClass = issue.severity === "ERROR"
                ? "text-bear"
                : issue.severity === "WARNING"
                  ? "text-wait"
                  : "text-accent";
              return (
                <div key={`${issue.decisionCycleId}:${issue.issueCode}`} className={`rounded-md border p-3 ${issueClass}`}>
                  <div className={`font-mono text-xs ${textClass}`}>{issue.severity} · {issue.issueCode}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{issue.marketDate} · {issue.message}</div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}

export default function PointInTimeBacktestPage() {
  const [startMarketDate, setStartMarketDate] = useState("");
  const [endMarketDate, setEndMarketDate] = useState("");
  const [maximumHoldMinutes, setMaximumHoldMinutes] = useState(60);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const history = usePointInTimeBacktestRuns();
  const selected = usePointInTimeBacktestRun(selectedRunId);
  const createRun = useCreatePointInTimeBacktestRun();

  const activeRun = createRun.data?.run ?? selected.data?.run ?? null;
  const historyColumns = useMemo<DataTableColumn<PointInTimeBacktestRunSummary>[]>(
    () => [
      { key: "created", header: "Created", render: (row) => <span className="font-mono text-xs">{formatBacktestEasternTime(row.createdAt)}</span> },
      { key: "range", header: "Market-Date Range", render: (row) => <span className="font-mono text-xs">{row.startMarketDate ?? "All"} → {row.endMarketDate ?? "All"}</span> },
      { key: "cycles", header: "Cycles", align: "right", render: (row) => row.decisionCycleCount },
      { key: "episodes", header: "Episodes", align: "right", render: (row) => row.episodeCount },
      { key: "winrate", header: "Win Rate", align: "right", render: (row) => formatBacktestPercent(row.winRatePercent) },
      { key: "open", header: "Open", render: (row) => <Button size="sm" variant="ghost" onClick={() => { createRun.reset(); setSelectedRunId(row.id); }}><History className="mr-1 h-3.5 w-3.5" /> Open</Button> },
    ],
    [createRun],
  );

  return (
    <div className="space-y-3">
      <PageHeader title="Point-in-Time Backtesting" description="Replay exact captures when available and use Schwab historical five-minute candles for uncaptured dates, without future-data leakage." />

      <Panel title="Run Backtest" action={<FlaskConical className="h-4 w-4 text-accent" />}>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs text-muted-foreground">Start market date
            <input type="date" value={startMarketDate} onChange={(event) => setStartMarketDate(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-panel-border bg-background px-3 font-mono text-xs text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">End market date
            <input type="date" value={endMarketDate} onChange={(event) => setEndMarketDate(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-panel-border bg-background px-3 font-mono text-xs text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">Maximum hold minutes
            <input type="number" min={5} max={390} step={5} value={maximumHoldMinutes} onChange={(event) => setMaximumHoldMinutes(Number(event.target.value))} className="mt-1 h-9 w-full rounded-md border border-panel-border bg-background px-3 font-mono text-xs text-foreground" />
          </label>
          <div className="flex items-end">
            <Button className="w-full" disabled={createRun.isPending} onClick={() => { setSelectedRunId(null); createRun.mutate(buildPointInTimeBacktestRequest({ startMarketDate, endMarketDate, maximumHoldMinutes })); }}>
              <Play className="mr-1.5 h-4 w-4" /> {createRun.isPending ? "Recomputing…" : "Run Backtest"}
            </Button>
          </div>
        </div>
        {createRun.isError ? <div className="mt-3 text-xs text-bear">The backtest request failed. Confirm the migration is applied and the backend is running.</div> : null}
      </Panel>

      {activeRun ? <RunResult run={activeRun} /> : null}

      <Panel title="Saved Backtest Runs" noPadding>
        <DataTable columns={historyColumns} rows={history.data?.runs ?? []} rowKey={(row) => row.id} emptyMessage={history.isLoading ? "Loading saved runs…" : "No saved point-in-time backtests yet."} />
      </Panel>
    </div>
  );
}
