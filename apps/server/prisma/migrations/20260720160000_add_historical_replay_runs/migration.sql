CREATE TABLE "HistoricalReplayRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startMarketDate" TEXT,
  "endMarketDate" TEXT,
  "snapshotCount" INTEGER NOT NULL,
  "marketDateCount" INTEGER NOT NULL,
  "auditState" TEXT NOT NULL,
  "auditFailureCount" INTEGER NOT NULL,
  "stateChangeCount" INTEGER NOT NULL,
  "tradeOutcomeCount" INTEGER NOT NULL,
  "totalPnlDollars" DOUBLE PRECISION,
  "result" JSONB NOT NULL,

  CONSTRAINT "HistoricalReplayRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HistoricalReplayRun_userId_createdAt_idx"
  ON "HistoricalReplayRun"("userId", "createdAt");

CREATE INDEX "HistoricalReplayRun_userId_auditState_createdAt_idx"
  ON "HistoricalReplayRun"("userId", "auditState", "createdAt");

ALTER TABLE "HistoricalReplayRun"
  ADD CONSTRAINT "HistoricalReplayRun_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
