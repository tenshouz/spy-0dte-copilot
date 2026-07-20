"use client";

import type {
  HistoricalReplayAuditIssue,
  HistoricalReplayEvent,
  HistoricalReplayRunPayload,
  HistoricalReplayRunSummary,
  HistoricalReplaySessionSummary,
} from "@spy-copilot/shared";
import {
  AlertTriangle,
  CalendarRange,
  Clock3,
  Database,
  History,
  Play,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/panels/data-table";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCreateHistoricalReplayRun,
  useHistoricalReplayRun,
  useHistoricalReplayRuns,
} from "@/hooks/use-historical-replay";
import {
  REPLAY_AUDIT_LABEL,
  REPLAY_EVENT_LABEL,
  REPLAY_LOOKAHEAD_LABEL,
  buildHistoricalReplayRequest,
  formatReplayEasternTime,
  formatReplayMoney,
  historicalReplayReasonCopy,
  replayDateRangeLabel,
  replayHistorySummaryCopy,
} from "@/lib/historical-replay-view";

function auditVariant(state: "PASS" | "FAIL" | "EMPTY") {
  if (state === "PASS") return "bull" as const;
  if (state === "FAIL") return "bear" as const;
  return "default" as const;
}

function stateVariant(state: string) {
  if (["READY", "CALLS", "PASS"].includes(state)) return "bull" as const;
  if (["PUTS", "FAIL", "UNAVAILABLE"].includes(state)) return "bear" as const;
  if (["WAITING_FOR_TRIGGER", "NOT_QUALIFIED"].includes(state)) {
    return "wait" as const;
  }
  return "default" as const;
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-md border border-panel-border bg-background/30 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
      {detail ? (
        <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
      ) : null}
    </div>
  );
}

function ReplayResult({ run }: { run: HistoricalReplayRunPayload }) {
  const eventColumns: DataTableColumn<HistoricalReplayEvent>[] = [
    {
      key: "time",
      header: "Source Time",
      render: (row) => (
        <div>
          <div className="font-mono text-xs">
            {formatReplayEasternTime(row.sourceCalculatedAt)}
          </div>
          <div className="text-[11px] text-muted-foreground">{row.marketDate}</div>
        </div>
      ),
    },
    {
      key: "event",
      header: "Replay Event",
      render: (row) => (
        <Badge variant={row.eventType === "STATE_CHANGED" ? "accent" : "default"}>
          {REPLAY_EVENT_LABEL[row.eventType]}
        </Badge>
      ),
    },
    {
      key: "audit",
      header: "No-Look-Ahead",
      render: (row) => (
        <Badge variant={stateVariant(row.noLookaheadState)}>
          {REPLAY_LOOKAHEAD_LABEL[row.noLookaheadState]}
        </Badge>
      ),
    },
    {
      key: "state",
      header: "Plan State",
      render: (row) => (
        <div className="space-y-1">
          <Badge variant={stateVariant(row.planState)}>{row.planState}</Badge>
          <div className="font-mono text-[11px] text-muted-foreground">
            {row.direction}
          </div>
        </div>
      ),
    },
    {
      key: "confidence",
      header: "Confidence",
      align: "right",
      render: (row) =>
        row.structuralConfidenceScore === null
          ? "—"
          : row.structuralConfidenceScore.toFixed(0),
    },
    {
      key: "contract",
      header: "Contract",
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.selectedContractSymbol ?? "—"}
        </span>
      ),
    },
    {
      key: "outcome",
      header: "Post-Hoc Outcome",
      render: (row) => (
        <div>
          <div className="text-xs">{row.outcomeState}</div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {formatReplayMoney(row.realizedPnlDollars)}
          </div>
        </div>
      ),
    },
  ];

  const sessionColumns: DataTableColumn<HistoricalReplaySessionSummary>[] = [
    {
      key: "date",
      header: "Market Date",
      render: (row) => <span className="font-mono text-xs">{row.marketDate}</span>,
    },
    {
      key: "snapshots",
      header: "Snapshots",
      align: "right",
      render: (row) => row.snapshotCount,
    },
    {
      key: "audit",
      header: "Audit",
      render: (row) => (
        <div className="text-xs">
          <span className="text-bull">{row.auditPassCount} pass</span>
          <span className="text-muted-foreground"> · </span>
          <span className={row.auditFailCount > 0 ? "text-bear" : "text-muted-foreground"}>
            {row.auditFailCount} fail
          </span>
        </div>
      ),
    },
    {
      key: "changes",
      header: "State Changes",
      align: "right",
      render: (row) => row.stateChangeCount,
    },
    {
      key: "terminal",
      header: "Terminal State",
      render: (row) => (
        <div className="space-y-1">
          <Badge variant={stateVariant(row.terminalPlanState)}>
            {row.terminalPlanState}
          </Badge>
          <div className="font-mono text-[11px] text-muted-foreground">
            {row.terminalDirection}
          </div>
        </div>
      ),
    },
    {
      key: "pnl",
      header: "Reviewed P&L",
      align: "right",
      render: (row) => formatReplayMoney(row.outcomeSummary.totalPnlDollars),
    },
  ];

  const issueColumns: DataTableColumn<HistoricalReplayAuditIssue>[] = [
    {
      key: "snapshot",
      header: "Snapshot",
      render: (row) => (
        <div>
          <div className="font-mono text-xs">{row.snapshotId.slice(0, 12)}</div>
          <div className="text-[11px] text-muted-foreground">{row.marketDate}</div>
        </div>
      ),
    },
    {
      key: "check",
      header: "Failed Check",
      render: (row) => <Badge variant="bear">{row.checkCode}</Badge>,
    },
    {
      key: "field",
      header: "Field",
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.fieldPath}
        </span>
      ),
    },
    {
      key: "message",
      header: "Explanation",
      render: (row) => <span className="text-xs">{row.message}</span>,
    },
  ];

  const displayedEvents = run.timeline.events.slice(-200);

  return (
    <>
      <Panel
        title="Replay Scorecard"
        className="mb-3"
        action={
          <Badge variant={auditVariant(run.audit.auditState)}>
            {REPLAY_AUDIT_LABEL[run.audit.auditState]}
          </Badge>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Captured Snapshots"
            value={run.source.snapshotCount}
            detail={`${run.source.marketDateCount} market dates`}
          />
          <SummaryCard
            label="Source-Time Audit"
            value={`${run.audit.snapshotPassCount} / ${run.source.snapshotCount}`}
            detail={`${run.audit.checksPerformed} checks performed`}
          />
          <SummaryCard
            label="State Changes"
            value={run.timeline.stateChangeCount}
            detail={`${run.timeline.unchangedStateCount} unchanged captures`}
          />
          <SummaryCard
            label="Reviewed P&L"
            value={formatReplayMoney(run.outcomeSummary.totalPnlDollars)}
            detail={`${run.outcomeSummary.tradeOutcomeCount} trade outcomes`}
          />
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <SummaryCard
            label="Candidate Captures"
            value={run.timeline.candidateSnapshotCount}
          />
          <SummaryCard
            label="Audit Failures"
            value={run.audit.snapshotFailCount}
            detail={`${run.audit.issueCount} total issues`}
          />
          <SummaryCard
            label="Replay Range"
            value={replayDateRangeLabel(
              run.source.dataStartMarketDate,
              run.source.dataEndMarketDate,
            )}
            detail={
              run.source.snapshotLimitReached
                ? "1,000-snapshot limit reached"
                : "Complete within the selected range"
            }
          />
        </div>

        <div className="mt-3 rounded-md border border-accent/20 bg-accent/5 p-3 text-xs leading-relaxed text-muted-foreground">
          This replay uses only persisted Assembly snapshots that existed at each
          capture time. It audits timestamp boundaries and reconstructs captured
          state transitions. It does not invent uncaptured market states or claim
          a raw tick-by-tick backtest. Outcome annotations are shown only as
          post-hoc results and never influence the replayed source state.
        </div>
      </Panel>

      <Panel title="Market-Date Replay Summary" className="mb-3" noPadding>
        <DataTable
          columns={sessionColumns}
          rows={run.timeline.sessions}
          rowKey={(row) => row.marketDate}
          emptyMessage="No captured market dates matched this replay."
        />
      </Panel>

      <Panel
        title="Chronological Captured-State Timeline"
        className="mb-3"
        action={
          <span className="text-[11px] text-muted-foreground">
            Showing {displayedEvents.length} of {run.timeline.eventCount}
          </span>
        }
        noPadding
      >
        <DataTable
          columns={eventColumns}
          rows={displayedEvents}
          rowKey={(row) => `${row.sequence}-${row.snapshotId}`}
          emptyMessage="No captured snapshots matched this replay."
        />
      </Panel>

      <Panel
        title="No-Look-Ahead Audit Issues"
        className="mb-3"
        action={
          <Badge variant={run.audit.issueCount > 0 ? "bear" : "bull"}>
            {run.audit.issueCount} issues
          </Badge>
        }
        noPadding
      >
        <DataTable
          columns={issueColumns}
          rows={run.audit.issues}
          rowKey={(row) =>
            `${row.snapshotId}-${row.checkCode}-${row.fieldPath}`
          }
          emptyMessage="Every captured snapshot passed the source-time and integrity audit."
        />
      </Panel>
    </>
  );
}

export default function HistoricalReplayPage() {
  const [startMarketDate, setStartMarketDate] = useState("");
  const [endMarketDate, setEndMarketDate] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const historyQuery = useHistoricalReplayRuns();
  const detailQuery = useHistoricalReplayRun(selectedRunId);
  const createMutation = useCreateHistoricalReplayRun();

  const dateError =
    startMarketDate !== "" &&
    endMarketDate !== "" &&
    startMarketDate > endMarketDate
      ? "Start date cannot be after end date."
      : null;

  const currentResponse =
    selectedRunId !== null ? detailQuery.data ?? null : createMutation.data ?? null;
  const currentRun = currentResponse?.run ?? null;

  const historyColumns = useMemo<
    DataTableColumn<HistoricalReplayRunSummary>[]
  >(
    () => [
      {
        key: "created",
        header: "Created",
        render: (row) => (
          <span className="font-mono text-xs">
            {formatReplayEasternTime(row.createdAt)}
          </span>
        ),
      },
      {
        key: "range",
        header: "Requested Range",
        render: (row) => (
          <span className="text-xs">
            {replayDateRangeLabel(row.startMarketDate, row.endMarketDate)}
          </span>
        ),
      },
      {
        key: "audit",
        header: "Audit",
        render: (row) => (
          <Badge variant={auditVariant(row.auditState)}>
            {REPLAY_AUDIT_LABEL[row.auditState]}
          </Badge>
        ),
      },
      {
        key: "summary",
        header: "Replay",
        render: (row) => (
          <span className="text-xs text-muted-foreground">
            {replayHistorySummaryCopy(row)}
          </span>
        ),
      },
      {
        key: "pnl",
        header: "Reviewed P&L",
        align: "right",
        render: (row) => formatReplayMoney(row.totalPnlDollars),
      },
      {
        key: "open",
        header: "Open",
        render: (row) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedRunId(row.id)}
          >
            <History className="h-3.5 w-3.5" />
            View
          </Button>
        ),
      },
    ],
    [],
  );

  function runReplay(): void {
    if (dateError !== null) return;
    const request = buildHistoricalReplayRequest(
      startMarketDate,
      endMarketDate,
    );
    createMutation.mutate(request, {
      onSuccess: (response) => {
        setSelectedRunId(response.run?.id ?? null);
      },
    });
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Historical Replay"
        description="Replay persisted deterministic Trade Plan snapshots in source-time order, audit every captured boundary for look-ahead, and keep post-hoc outcomes separate from the historical decision state."
      />

      <Panel
        title="Captured-Snapshot Replay"
        className="mb-3"
        action={
          <Badge variant="accent">
            CAPTURED_REPLAY_V1
          </Badge>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Deterministic no-look-ahead validation
            </div>
            <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">
              Each run loads persisted journal snapshots, validates the stored
              captured Assembly payload, verifies every source timestamp is at or before
              the Assembly boundary, reconstructs the captured state sequence,
              and persists the replay result for later review.
            </p>
          </div>

          <Button
            type="button"
            onClick={runReplay}
            disabled={createMutation.isPending || dateError !== null}
          >
            <Play className="h-4 w-4" />
            {createMutation.isPending ? "Running replay…" : "Run historical replay"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <label className="space-y-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Start market date · optional
            <input
              type="date"
              value={startMarketDate}
              onChange={(event) => setStartMarketDate(event.target.value)}
              className="block h-9 w-full rounded-md border border-panel-border bg-background px-3 font-mono text-xs text-foreground"
            />
          </label>
          <label className="space-y-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            End market date · optional
            <input
              type="date"
              value={endMarketDate}
              onChange={(event) => setEndMarketDate(event.target.value)}
              className="block h-9 w-full rounded-md border border-panel-border bg-background px-3 font-mono text-xs text-foreground"
            />
          </label>
        </div>

        {dateError ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-bear/30 bg-bear-muted px-3 py-2 text-xs text-bear">
            <AlertTriangle className="h-4 w-4" />
            {dateError}
          </div>
        ) : null}

        {currentResponse ? (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-xs ${
              currentResponse.engineState === "AVAILABLE"
                ? "border-panel-border bg-background/30 text-muted-foreground"
                : "border-bear/30 bg-bear-muted text-bear"
            }`}
          >
            {historicalReplayReasonCopy(currentResponse.primaryReasonCode)}
          </div>
        ) : null}
      </Panel>

      {currentRun ? <ReplayResult run={currentRun} /> : null}

      <Panel
        title="Persisted Replay Runs"
        action={
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            PostgreSQL · newest first
          </div>
        }
        noPadding
        isLoading={historyQuery.isLoading}
        isError={historyQuery.isError}
      >
        <DataTable
          columns={historyColumns}
          rows={historyQuery.data?.runs ?? []}
          rowKey={(row) => row.id}
          emptyMessage="No historical replay runs have been persisted yet."
        />
      </Panel>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5" />
          Maximum requested range: 366 calendar days
        </span>
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" />
          Maximum replay size: 1,000 captured snapshots
        </span>
      </div>
    </div>
  );
}
