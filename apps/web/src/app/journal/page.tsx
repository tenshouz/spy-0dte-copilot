"use client";

import type { JournalEntry } from "@spy-copilot/shared";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/panels/data-table";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { useJournalEntries } from "@/hooks/use-journal";
import { formatPrice } from "@/lib/format";

export default function JournalPage() {
  const { data: entries, isLoading, isError } = useJournalEntries();

  const columns: DataTableColumn<JournalEntry>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => new Date(r.createdAt).toLocaleDateString("en-US"),
    },
    {
      key: "traded",
      header: "Traded",
      render: (r) =>
        r.traded ? (
          <Badge variant={r.direction === "PUTS" ? "bear" : "bull"}>{r.direction}</Badge>
        ) : (
          <Badge variant="wait">Stayed out</Badge>
        ),
    },
    {
      key: "entry",
      header: "Entry",
      align: "right",
      render: (r) => (r.entryPrice ? `$${formatPrice(r.entryPrice)}` : "—"),
    },
    {
      key: "exit",
      header: "Exit",
      align: "right",
      render: (r) => (r.exitPrice ? `$${formatPrice(r.exitPrice)}` : "—"),
    },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      render: (r) =>
        r.pnl == null ? (
          "—"
        ) : (
          <span className={r.pnl >= 0 ? "text-bull" : "text-bear"}>
            {r.pnl >= 0 ? "+" : ""}
            {r.pnl}
          </span>
        ),
    },
    {
      key: "notes",
      header: "Notes",
      render: (r) => <span className="text-muted-foreground">{r.notes ?? "—"}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Trade Journal"
        description="Every report is stored automatically; outcome fields are entered manually — the app never trades for you (PRD Section 11)."
      />

      <Panel title={`Entries (${entries?.length ?? 0})`} isLoading={isLoading} isError={isError} noPadding>
        <DataTable columns={columns} rows={entries ?? []} rowKey={(r) => r.id} emptyMessage="No journal entries yet." />
      </Panel>
    </div>
  );
}
