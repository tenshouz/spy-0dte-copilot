-- AlterTable
ALTER TABLE "DeterministicJournalSnapshot"
ADD COLUMN "outcomeState" TEXT NOT NULL DEFAULT 'UNREVIEWED',
ADD COLUMN "realizedPnlDollars" DOUBLE PRECISION,
ADD COLUMN "outcomeNotes" TEXT,
ADD COLUMN "outcomeUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DeterministicJournalSnapshot_userId_outcomeState_idx"
ON "DeterministicJournalSnapshot"("userId", "outcomeState");
