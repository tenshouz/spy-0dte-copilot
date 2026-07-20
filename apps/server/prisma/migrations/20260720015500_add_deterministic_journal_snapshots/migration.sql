-- CreateTable
CREATE TABLE "DeterministicJournalSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentMarketDate" TEXT NOT NULL,
    "sourceCalculatedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engineState" TEXT NOT NULL,
    "planState" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "primaryReasonCode" TEXT NOT NULL,
    "warningCode" TEXT,
    "entryConditionState" TEXT NOT NULL,
    "selectedContractSymbol" TEXT,
    "sourceAssembly" JSONB NOT NULL,

    CONSTRAINT "DeterministicJournalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeterministicJournalSnapshot_userId_capturedAt_idx" ON "DeterministicJournalSnapshot"("userId", "capturedAt");

-- CreateIndex
CREATE INDEX "DeterministicJournalSnapshot_userId_currentMarketDate_idx" ON "DeterministicJournalSnapshot"("userId", "currentMarketDate");

-- AddForeignKey
ALTER TABLE "DeterministicJournalSnapshot" ADD CONSTRAINT "DeterministicJournalSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
