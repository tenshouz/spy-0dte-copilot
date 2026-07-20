ALTER TABLE "Settings"
  ADD COLUMN "backendAutomationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "backendTradePlanAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "backendScheduledReportsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "backendAutomationCadenceSeconds" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE "BackendAutomationRuntime" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "lastTickAt" TIMESTAMP(3),
  "lastTradePlanEvaluatedAt" TIMESTAMP(3),
  "lastTradePlanOutcome" TEXT,
  "lastTradePlanReasonCode" TEXT,
  "lastScheduledEvaluatedAt" TIMESTAMP(3),
  "lastScheduledOutcome" TEXT,
  "lastScheduledReasonCode" TEXT,
  "lastErrorCode" TEXT,
  "tradePlanTransitionState" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackendAutomationRuntime_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackendAutomationDeliveryKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "deliveryKey" TEXT NOT NULL,
  "commitment" TEXT NOT NULL,
  "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackendAutomationDeliveryKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackendAutomationDeliveryLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "triggerMode" TEXT NOT NULL,
  "deliveryKey" TEXT,
  "deliveryState" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "providerStatusCode" INTEGER,
  "providerRequestAttempted" BOOLEAN NOT NULL DEFAULT false,
  "transitionType" TEXT,
  "reportType" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "details" JSONB NOT NULL,
  CONSTRAINT "BackendAutomationDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackendAutomationRuntime_userId_key"
  ON "BackendAutomationRuntime"("userId");
CREATE UNIQUE INDEX "BackendAutomationDeliveryKey_userId_category_deliveryKey_key"
  ON "BackendAutomationDeliveryKey"("userId", "category", "deliveryKey");
CREATE INDEX "BackendAutomationDeliveryKey_userId_committedAt_idx"
  ON "BackendAutomationDeliveryKey"("userId", "committedAt");
CREATE INDEX "BackendAutomationDeliveryLog_userId_attemptedAt_idx"
  ON "BackendAutomationDeliveryLog"("userId", "attemptedAt");
CREATE INDEX "BackendAutomationDeliveryLog_userId_category_attemptedAt_idx"
  ON "BackendAutomationDeliveryLog"("userId", "category", "attemptedAt");

ALTER TABLE "BackendAutomationRuntime"
  ADD CONSTRAINT "BackendAutomationRuntime_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackendAutomationDeliveryKey"
  ADD CONSTRAINT "BackendAutomationDeliveryKey_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackendAutomationDeliveryLog"
  ADD CONSTRAINT "BackendAutomationDeliveryLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
