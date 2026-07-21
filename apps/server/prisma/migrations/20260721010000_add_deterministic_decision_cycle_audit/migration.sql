-- V1.4.0: persist every evaluated deterministic decision cycle for later calibration.
CREATE TABLE "DeterministicDecisionCycle" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceReferenceKey" TEXT NOT NULL,
  "currentMarketDate" TEXT NOT NULL,
  "sourceCalculatedAt" TIMESTAMP(3) NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "engineState" TEXT NOT NULL,
  "planState" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "setupType" TEXT,
  "triggerLifecycleState" TEXT,
  "confirmationPassed" BOOLEAN,
  "executionAlignmentScore" DOUBLE PRECISION,
  "snapshotIntegrityState" TEXT,
  "selectedContractSymbol" TEXT,
  "primaryReasonCode" TEXT NOT NULL,
  "warningCode" TEXT,
  "sourceAssembly" JSONB NOT NULL,
  CONSTRAINT "DeterministicDecisionCycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeterministicDecisionCycle_userId_sourceReferenceKey_key"
  ON "DeterministicDecisionCycle"("userId", "sourceReferenceKey");
CREATE INDEX "DeterministicDecisionCycle_userId_capturedAt_idx"
  ON "DeterministicDecisionCycle"("userId", "capturedAt");
CREATE INDEX "DeterministicDecisionCycle_userId_currentMarketDate_capturedAt_idx"
  ON "DeterministicDecisionCycle"("userId", "currentMarketDate", "capturedAt");
CREATE INDEX "DeterministicDecisionCycle_userId_planState_capturedAt_idx"
  ON "DeterministicDecisionCycle"("userId", "planState", "capturedAt");
CREATE INDEX "DeterministicDecisionCycle_userId_setupType_capturedAt_idx"
  ON "DeterministicDecisionCycle"("userId", "setupType", "capturedAt");

ALTER TABLE "DeterministicDecisionCycle"
  ADD CONSTRAINT "DeterministicDecisionCycle_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
