"use client";

import type { DeterministicJournalSnapshotEntry } from "@spy-copilot/shared";
import { Camera, Database } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/panels/data-table";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCaptureDeterministicJournalSnapshot,
  useDeterministicJournalSnapshots,
} from "@/hooks/use-journal";
import { formatEasternTime } from "@/lib/format";
import {
  captureResultCopy,
  JOURNAL_PLAN_STATE_LABEL,
  journalReasonCopy,
} from "@/lib/deterministic-journal-view";

function stateVariant(
  state: DeterministicJournalSnapshotEntry["planState"],
): "bull" | "bear" | "wait" | "default" {
  if (state === "READY") return "bull";
  if (state === "UNAVAILABLE") return "bear";
  if (["NOT_QUALIFIED", "NO_QUALIFIED_CONTRACT"].includes(state)) return "wait";
  return "default";
}

function directionVariant(
  direction: DeterministicJournalSnapshotEntry["direction"],
): "bull" | "bear" | "default" {
  if (direction === "CALLS") return "bull";
  if (direction === "PUTS") return "bear";
  return "default";
}

export default function JournalPage() {
  const journalQuery = useDeterministicJournalSnapshots();
  const captureMutation = useCaptureDeterministicJournalSnapshot();
  const journal = journalQuery.data ?? null;
  const entries = journal?.entries ?? [];

  const columns: DataTableColumn<DeterministicJournalSnapshotEntry>[] = [
    {
      key: "captured",
      header: "Captured",
      render: (row) => (
        <div>
          <div className="font-mono text-xs">{formatEasternTime(row.capturedAt)}</div>
          <div className="text-[11px] text-muted-foreground">{row.currentMarketDate}</div>
        </div>
      ),
    },
    {
      key: "planState",
      header: "Plan State",
      render: (row) => (
        <Badge variant={stateVariant(row.planState)}>
          {JOURNAL_PLAN_STATE_LABEL[row.planState]}
        </Badge>
      ),
    },
    {
      key: "direction",
      header: "Direction",
      render: (row) => (
        <Badge variant={directionVariant(row.direction)}>{row.direction}</Badge>
      ),
    },
    {
      key: "confidence",
      header: "Confidence",
      align: "right",
      render: (row) =>
        row.structuralConfidenceScore === null
          ? "—"
          : `${row.structuralConfidenceScore.toFixed(0)} / 100`,
    },
    {
      key: "entry",
      header: "Entry State",
      render: (row) => row.entryConditionState.replaceAll("_", " "),
    },
    {
      key: "contract",
      header: "Selected Contract",
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.selectedContractSymbol ?? "—"}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.primaryReasonCode.replaceAll("_", " ")}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Trade Journal"
        description="Explicitly persist the current deterministic Trade Plan Assembly for later outcome tracking and analysis. No trade is created or executed."
      />

      <Panel title="Deterministic Journal Snapshot" className="mb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-primary" />
              PostgreSQL-backed snapshot history
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Save captures the current ASSEMBLY_V1 state, direction, confidence,
              entry state, selected contract reference, and the complete structured
              source snapshot for auditability. Capture is manual in this milestone.
            </p>
          </div>
          <Button
            onClick={() => captureMutation.mutate()}
            disabled={captureMutation.isPending}
          >
            <Camera className="h-4 w-4" />
            {captureMutation.isPending ? "Saving snapshot…" : "Save current snapshot"}
          </Button>
        </div>

        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-md border border-panel-border bg-background/30 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Journal State</div>
            <div className="mt-1 font-mono font-semibold">
              {journalQuery.isLoading ? "LOADING" : journal?.engineState ?? "UNAVAILABLE"}
            </div>
          </div>
          <div className="rounded-md border border-panel-border bg-background/30 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Saved Snapshots</div>
            <div className="mt-1 font-mono text-lg font-semibold">{entries.length}</div>
          </div>
          <div className="rounded-md border border-panel-border bg-background/30 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Capture Mode</div>
            <div className="mt-1 font-mono font-semibold">EXPLICIT ONLY</div>
          </div>
        </div>

        {(journal || journalQuery.isError) && (
          <div className="mt-3 rounded-md border border-panel-border bg-background/30 px-3 py-2 text-xs text-muted-foreground">
            {journalQuery.isError
              ? "The journal API request failed."
              : journalReasonCopy(journal!.primaryReasonCode)}
          </div>
        )}

        {captureMutation.data && (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-xs ${
              captureMutation.data.engineState === "AVAILABLE"
                ? "border-bull/30 bg-bull-muted text-bull"
                : "border-wait/30 bg-wait-muted text-wait"
            }`}
          >
            {captureResultCopy(captureMutation.data)}
          </div>
        )}

        {captureMutation.isError && (
          <div className="mt-3 rounded-md border border-bear/30 bg-bear-muted px-3 py-2 text-xs text-bear">
            The snapshot request failed before a validated journal response was received.
          </div>
        )}
      </Panel>

      <Panel
        title={`Persisted Snapshots (${entries.length})`}
        isLoading={journalQuery.isLoading}
        isError={journalQuery.isError}
        noPadding
      >
        <DataTable
          columns={columns}
          rows={entries}
          rowKey={(row) => row.id}
          emptyMessage="No deterministic journal snapshots have been saved yet."
        />
      </Panel>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        This foundation stores deterministic decision-support snapshots only. Trade
        outcome editing, P&amp;L fields, automatic report capture, and performance
        analytics remain separate future milestones.
      </p>
    </div>
  );
}
