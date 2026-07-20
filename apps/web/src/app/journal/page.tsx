"use client";

import type {
  DeterministicJournalOutcomeState,
  DeterministicJournalSnapshotEntry,
} from "@spy-copilot/shared";
import {
  Camera,
  CirclePause,
  CirclePlay,
  Database,
  PencilLine,
  RefreshCw,
  Save,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { JournalAnalyticsPanel } from "@/components/journal/journal-analytics-panel";
import { DataTable, type DataTableColumn } from "@/components/panels/data-table";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AUTOMATIC_JOURNAL_CAPTURE_CADENCE_OPTIONS,
  useAutomaticDeterministicJournalCapture,
  useCaptureDeterministicJournalSnapshot,
  useDeterministicJournalSnapshots,
  useUpdateDeterministicJournalOutcome,
  type AutomaticJournalCaptureCadence,
} from "@/hooks/use-journal";
import { formatEasternTime } from "@/lib/format";
import {
  automaticCaptureResultCopy,
  captureResultCopy,
  JOURNAL_CAPTURE_MODE_LABEL,
  JOURNAL_OUTCOME_LABEL,
  JOURNAL_OUTCOME_OPTIONS,
  JOURNAL_PLAN_STATE_LABEL,
  journalOutcomeDraftFromEntry,
  journalReasonCopy,
  outcomeUpdateResultCopy,
  validateJournalOutcomeDraft,
  type JournalOutcomeDraft,
} from "@/lib/deterministic-journal-view";
import { cn } from "@/lib/utils";

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

function outcomeVariant(
  outcome: DeterministicJournalOutcomeState,
): "bull" | "bear" | "wait" | "default" {
  if (outcome === "WIN") return "bull";
  if (outcome === "LOSS") return "bear";
  if (outcome === "NO_TRADE") return "wait";
  return "default";
}

function automaticTone(
  state: "CAPTURED" | "DUPLICATE_SUPPRESSED" | "NO_CAPTURE" | "UNAVAILABLE",
): string {
  if (state === "CAPTURED") return "border-bull/30 bg-bull-muted text-bull";
  if (state === "UNAVAILABLE") return "border-bear/30 bg-bear-muted text-bear";
  return "border-wait/30 bg-wait-muted text-wait";
}

function formatCadence(milliseconds: number): string {
  return `${milliseconds / 1000} sec`;
}

const EMPTY_DRAFT: JournalOutcomeDraft = {
  outcomeState: "UNREVIEWED",
  realizedPnlDollars: "",
  notes: "",
};
const EMPTY_ENTRIES: DeterministicJournalSnapshotEntry[] = [];

export default function JournalPage() {
  const journalQuery = useDeterministicJournalSnapshots();
  const captureMutation = useCaptureDeterministicJournalSnapshot();
  const outcomeMutation = useUpdateDeterministicJournalOutcome();
  const [automaticCaptureEnabled, setAutomaticCaptureEnabled] = useState(false);
  const [automaticCaptureCadence, setAutomaticCaptureCadence] =
    useState<AutomaticJournalCaptureCadence>(30_000);
  const automaticCaptureQuery = useAutomaticDeterministicJournalCapture(
    automaticCaptureEnabled,
    automaticCaptureCadence,
  );
  const journal = journalQuery.data ?? null;
  const refetchJournal = journalQuery.refetch;
  const entries = journal?.entries ?? EMPTY_ENTRIES;
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [outcomeDraft, setOutcomeDraft] = useState<JournalOutcomeDraft>(EMPTY_DRAFT);

  useEffect(() => {
    if (automaticCaptureQuery.data?.automaticCaptureState === "CAPTURED") {
      void refetchJournal();
    }
  }, [
    automaticCaptureQuery.data?.automaticCaptureState,
    automaticCaptureQuery.data?.entry?.id,
    refetchJournal,
  ]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedSnapshotId) ?? null,
    [entries, selectedSnapshotId],
  );
  const outcomeValidation = validateJournalOutcomeDraft(outcomeDraft);

  function beginOutcomeReview(entry: DeterministicJournalSnapshotEntry): void {
    setSelectedSnapshotId(entry.id);
    setOutcomeDraft(journalOutcomeDraftFromEntry(entry));
    outcomeMutation.reset();
  }

  function changeOutcomeState(outcomeState: DeterministicJournalOutcomeState): void {
    setOutcomeDraft((current) => ({
      ...current,
      outcomeState,
      realizedPnlDollars:
        outcomeState === "BREAKEVEN"
          ? "0"
          : ["UNREVIEWED", "NO_TRADE"].includes(outcomeState)
            ? ""
            : current.realizedPnlDollars,
      notes: outcomeState === "UNREVIEWED" ? "" : current.notes,
    }));
  }

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
      key: "captureMode",
      header: "Capture",
      render: (row) => (
        <Badge variant={row.captureMode === "AUTOMATIC_CANDIDATE" ? "accent" : "default"}>
          {JOURNAL_CAPTURE_MODE_LABEL[row.captureMode]}
        </Badge>
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
      key: "outcome",
      header: "Outcome",
      render: (row) => (
        <div className="space-y-1">
          <Badge variant={outcomeVariant(row.outcomeState)}>
            {JOURNAL_OUTCOME_LABEL[row.outcomeState]}
          </Badge>
          {row.realizedPnlDollars !== null ? (
            <div className="font-mono text-[11px] text-muted-foreground">
              {row.realizedPnlDollars.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </div>
          ) : null}
        </div>
      ),
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
      key: "review",
      header: "Review",
      render: (row) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => beginOutcomeReview(row)}
        >
          <PencilLine className="h-3.5 w-3.5" />
          Review
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Trade Journal"
        description="Persist deterministic Trade Plan snapshots, opt into candidate-based automatic capture, and explicitly annotate outcomes. Nothing is inferred and no trade is created or executed."
      />

      <Panel title="Deterministic Journal Snapshot" className="mb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-primary" />
              PostgreSQL-backed snapshot history
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Manual save captures the current Assembly state and complete
              structured source snapshot. Outcome review remains explicit and
              user-entered; the dashboard does not infer whether a trade was
              taken or calculate P&amp;L.
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
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Outcome Mode</div>
            <div className="mt-1 font-mono font-semibold">USER ENTERED</div>
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
      </Panel>

      <Panel
        title="Automatic Candidate Capture"
        className="mb-3"
        action={
          <Badge variant={automaticCaptureEnabled ? "bull" : "default"}>
            {automaticCaptureEnabled ? "Running" : "Stopped"}
          </Badge>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold">
                Persist each new meaningful Trade Plan candidate once while this page remains open.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                This is an explicit opt-in foreground browser session, not a background
                scheduler. READY, WAITING, NO-CONTRACT, and NOT-QUALIFIED candidates
                are deduplicated in PostgreSQL by user and stable candidate key. Closed
                sessions, no-setup states, and unavailable sources are not captured.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Cadence
                <select
                  aria-label="Automatic journal capture cadence"
                  value={automaticCaptureCadence}
                  disabled={automaticCaptureEnabled}
                  onChange={(event) =>
                    setAutomaticCaptureCadence(
                      Number(event.target.value) as AutomaticJournalCaptureCadence,
                    )
                  }
                  className="block h-9 rounded-md border border-panel-border bg-background px-3 font-mono text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {AUTOMATIC_JOURNAL_CAPTURE_CADENCE_OPTIONS.map((cadence) => (
                    <option key={cadence} value={cadence}>
                      {formatCadence(cadence)}
                    </option>
                  ))}
                </select>
              </label>

              {automaticCaptureEnabled ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAutomaticCaptureEnabled(false)}
                >
                  <CirclePause className="h-4 w-4" />
                  Stop automatic capture
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAutomaticCaptureEnabled(true)}
                >
                  <CirclePlay className="h-4 w-4" />
                  Start automatic capture
                </Button>
              )}

              <Button
                type="button"
                variant="subtle"
                size="sm"
                disabled={!automaticCaptureEnabled || automaticCaptureQuery.isFetching}
                onClick={() => void automaticCaptureQuery.refetch()}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    automaticCaptureQuery.isFetching && "animate-spin",
                  )}
                />
                Evaluate now
              </Button>
            </div>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-md border border-panel-border bg-background/30 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Automatic Capture</div>
              <div className="mt-1 font-mono font-semibold">
                {automaticCaptureEnabled ? "RUNNING" : "STOPPED"}
              </div>
            </div>
            <div className="rounded-md border border-panel-border bg-background/30 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cadence</div>
              <div className="mt-1 font-mono font-semibold">{formatCadence(automaticCaptureCadence)}</div>
            </div>
            <div className="rounded-md border border-panel-border bg-background/30 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Latest Outcome</div>
              <div className="mt-1 font-mono font-semibold">
                {automaticCaptureQuery.data?.automaticCaptureState ?? "—"}
              </div>
            </div>
            <div className="rounded-md border border-panel-border bg-background/30 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Duplicate Protection</div>
              <div className="mt-1 font-mono font-semibold">DATABASE UNIQUE</div>
            </div>
          </div>

          {automaticCaptureQuery.isError ? (
            <div className="rounded-md border border-bear/30 bg-bear-muted px-3 py-2 text-xs text-bear">
              The automatic journal endpoint failed before returning a validated result.
            </div>
          ) : automaticCaptureQuery.data ? (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${automaticTone(
                automaticCaptureQuery.data.automaticCaptureState,
              )}`}
            >
              {automaticCaptureResultCopy(automaticCaptureQuery.data)}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-panel-border px-3 py-2 text-xs text-muted-foreground">
              Automatic capture is off. Starting it does not persist across page refreshes.
            </div>
          )}
        </div>
      </Panel>

      <JournalAnalyticsPanel />

      <Panel
        title={`Persisted Snapshots (${entries.length})`}
        isLoading={journalQuery.isLoading}
        isError={journalQuery.isError}
        noPadding
        className="mb-3"
      >
        <DataTable
          columns={columns}
          rows={entries}
          rowKey={(row) => row.id}
          emptyMessage="No deterministic journal snapshots have been saved yet."
        />
      </Panel>

      <Panel title="Outcome Review" className="mb-3">
        {selectedEntry === null ? (
          <p className="text-xs text-muted-foreground">
            Select Review on a persisted snapshot to add or update a user-entered outcome.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {selectedEntry.currentMarketDate} · {JOURNAL_PLAN_STATE_LABEL[selectedEntry.planState]}
                </p>
                <p className="text-xs text-muted-foreground">
                  Captured {formatEasternTime(selectedEntry.capturedAt)} · {JOURNAL_CAPTURE_MODE_LABEL[selectedEntry.captureMode]} · Snapshot ID {selectedEntry.id}
                </p>
              </div>
              <Badge variant={outcomeVariant(selectedEntry.outcomeState)}>
                Current: {JOURNAL_OUTCOME_LABEL[selectedEntry.outcomeState]}
              </Badge>
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px_220px_1fr]">
              <label className="space-y-1.5 text-xs">
                <span className="block font-medium text-muted-foreground">Outcome</span>
                <select
                  aria-label="Journal outcome"
                  value={outcomeDraft.outcomeState}
                  onChange={(event) =>
                    changeOutcomeState(event.target.value as DeterministicJournalOutcomeState)
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm"
                >
                  {JOURNAL_OUTCOME_OPTIONS.map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {JOURNAL_OUTCOME_LABEL[outcome]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 text-xs">
                <span className="block font-medium text-muted-foreground">Realized P&amp;L ($)</span>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={outcomeDraft.realizedPnlDollars}
                  disabled={["UNREVIEWED", "NO_TRADE"].includes(outcomeDraft.outcomeState)}
                  onChange={(event) =>
                    setOutcomeDraft((current) => ({
                      ...current,
                      realizedPnlDollars: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>

              <label className="space-y-1.5 text-xs">
                <span className="block font-medium text-muted-foreground">Notes</span>
                <textarea
                  value={outcomeDraft.notes}
                  disabled={outcomeDraft.outcomeState === "UNREVIEWED"}
                  maxLength={2000}
                  rows={3}
                  onChange={(event) =>
                    setOutcomeDraft((current) => ({ ...current, notes: event.target.value }))
                  }
                  className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Optional user-entered context."
                />
              </label>
            </div>

            {outcomeValidation.error ? (
              <div className="rounded-md border border-bear/30 bg-bear-muted px-3 py-2 text-xs text-bear">
                {outcomeValidation.error}
              </div>
            ) : null}

            {outcomeMutation.data ? (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  outcomeMutation.data.primaryReasonCode === "JOURNAL_OUTCOME_UPDATED"
                    ? "border-bull/30 bg-bull-muted text-bull"
                    : "border-wait/30 bg-wait-muted text-wait"
                }`}
              >
                {outcomeUpdateResultCopy(outcomeMutation.data)}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={outcomeMutation.isPending || outcomeValidation.request === null}
                onClick={() => {
                  if (outcomeValidation.request === null) return;
                  outcomeMutation.mutate({
                    snapshotId: selectedEntry.id,
                    request: outcomeValidation.request,
                  });
                }}
              >
                <Save className="h-4 w-4" />
                {outcomeMutation.isPending ? "Saving outcome…" : "Save outcome"}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Automatic capture records deterministic candidate snapshots only while this
        Journal page remains open. Outcome state, realized P&amp;L, and notes remain
        explicit user inputs. Performance analytics are calculated only from
        persisted, user-reviewed outcomes and never infer whether a trade was taken.
      </p>
    </div>
  );
}
