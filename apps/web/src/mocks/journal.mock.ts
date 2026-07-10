import { JournalEntrySchema, type JournalEntry } from "@spy-copilot/shared";

export function getMockJournalEntries(): JournalEntry[] {
  const entries: JournalEntry[] = [
    {
      id: "journal_mock_003",
      reportId: "report_mock_0935",
      traded: true,
      direction: "CALLS",
      entryPrice: 617.5,
      exitPrice: 619.1,
      pnl: 160,
      notes: "Took profit at target 1 ahead of the lunch-chop warning window.",
      createdAt: new Date(Date.now() - 1 * 24 * 3_600_000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 3_600_000).toISOString(),
    },
    {
      id: "journal_mock_002",
      reportId: "report_mock_premarket",
      traded: false,
      direction: null,
      entryPrice: null,
      exitPrice: null,
      pnl: null,
      notes: "Stayed out — premarket range was too tight relative to expected move.",
      createdAt: new Date(Date.now() - 2 * 24 * 3_600_000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 3_600_000).toISOString(),
    },
    {
      id: "journal_mock_001",
      reportId: "report_mock_1000",
      traded: true,
      direction: "PUTS",
      entryPrice: 614.2,
      exitPrice: 613.05,
      pnl: 115,
      notes: "Faded the rejection off the call wall — invalidation held clean.",
      createdAt: new Date(Date.now() - 3 * 24 * 3_600_000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 24 * 3_600_000).toISOString(),
    },
  ];

  return entries.map((e) => JournalEntrySchema.parse(e));
}
