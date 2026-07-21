ALTER TABLE "DeterministicDecisionCycle"
  ADD COLUMN "sourceMarketState" JSONB,
  ADD COLUMN "optionsChainSnapshotId" TEXT;

CREATE TABLE "PointInTimeOptionsChainSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "currentMarketDate" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metricState" TEXT NOT NULL,
  "sourceState" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "PointInTimeOptionsChainSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PointInTimeBacktestRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startMarketDate" TEXT,
  "endMarketDate" TEXT,
  "maximumHoldMinutes" INTEGER NOT NULL,
  "decisionCycleCount" INTEGER NOT NULL,
  "episodeCount" INTEGER NOT NULL,
  "targetFirstCount" INTEGER NOT NULL,
  "stopFirstCount" INTEGER NOT NULL,
  "winRatePercent" DOUBLE PRECISION,
  "averageRMultiple" DOUBLE PRECISION,
  "result" JSONB NOT NULL,
  CONSTRAINT "PointInTimeBacktestRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PointInTimeOptionsChainSnapshot_userId_sourceKey_key"
  ON "PointInTimeOptionsChainSnapshot"("userId", "sourceKey");
CREATE INDEX "PointInTimeOptionsChainSnapshot_userId_fetchedAt_idx"
  ON "PointInTimeOptionsChainSnapshot"("userId", "fetchedAt");
CREATE INDEX "PointInTimeOptionsChainSnapshot_userId_currentMarketDate_fetchedAt_idx"
  ON "PointInTimeOptionsChainSnapshot"("userId", "currentMarketDate", "fetchedAt");
CREATE INDEX "PointInTimeBacktestRun_userId_createdAt_idx"
  ON "PointInTimeBacktestRun"("userId", "createdAt");
CREATE INDEX "DeterministicDecisionCycle_optionsChainSnapshotId_idx"
  ON "DeterministicDecisionCycle"("optionsChainSnapshotId");

ALTER TABLE "PointInTimeOptionsChainSnapshot"
  ADD CONSTRAINT "PointInTimeOptionsChainSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PointInTimeBacktestRun"
  ADD CONSTRAINT "PointInTimeBacktestRun_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeterministicDecisionCycle"
  ADD CONSTRAINT "DeterministicDecisionCycle_optionsChainSnapshotId_fkey"
  FOREIGN KEY ("optionsChainSnapshotId") REFERENCES "PointInTimeOptionsChainSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
