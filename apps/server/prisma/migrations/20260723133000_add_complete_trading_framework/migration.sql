-- V1.6-V1.9 consolidated trading framework persistence.
CREATE TABLE "TradingDayLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketDate" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "realizedPnlDollars" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realizedLossDollars" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openPlannedRiskDollars" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveLosses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradingDayLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradingPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketDate" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "setupEpisodeId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "readyAlertId" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "contractSymbol" TEXT NOT NULL,
    "strikePrice" DOUBLE PRECISION NOT NULL,
    "expirationDate" TEXT NOT NULL,
    "plannedEntryAsk" DOUBLE PRECISION NOT NULL,
    "modeledEntryPrice" DOUBLE PRECISION NOT NULL,
    "actualEntryPrice" DOUBLE PRECISION NOT NULL,
    "entryUnderlyingPrice" DOUBLE PRECISION NOT NULL,
    "structuralStopLevel" DOUBLE PRECISION NOT NULL,
    "target1Level" DOUBLE PRECISION NOT NULL,
    "target2Level" DOUBLE PRECISION NOT NULL,
    "target3Level" DOUBLE PRECISION,
    "plannedRiskDollars" DOUBLE PRECISION NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "timeStopReviewAt" TIMESTAMP(3) NOT NULL,
    "target1TouchedAt" TIMESTAMP(3),
    "target2TouchedAt" TIMESTAMP(3),
    "target3TouchedAt" TIMESTAMP(3),
    "stopTouchedAt" TIMESTAMP(3),
    "timeStopAlertedAt" TIMESTAMP(3),
    "mandatoryExitAlertedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "actualExitPrice" DOUBLE PRECISION,
    "exitReason" TEXT,
    "realizedPnlDollars" DOUBLE PRECISION,
    "overrideReason" TEXT,
    "entryNote" TEXT,
    "exitNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradingPosition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TradingPosition_quantity_check" CHECK ("quantity" = 1),
    CONSTRAINT "TradingPosition_planned_risk_check" CHECK ("plannedRiskDollars" > 0 AND "plannedRiskDollars" <= 50),
    CONSTRAINT "TradingPosition_status_check" CHECK ("status" IN ('OPEN','CLOSED','CANCELLED'))
);

CREATE TABLE "TradingAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketDate" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "setupEpisodeId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "levelType" TEXT NOT NULL,
    "levelBucket" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "positionId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "TradingAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TradingAttempt_number_check" CHECK ("attemptNumber" BETWEEN 1 AND 2)
);

CREATE TABLE "TradingReadyAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketDate" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "setupEpisodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "closedReasonCode" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradingReadyAlert_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TradingReadyAlert_status_check" CHECK ("status" IN ('ACTIVE','CONFIRMED','EXPIRED','REVOKED')),
    CONSTRAINT "TradingReadyAlert_expiry_check" CHECK ("expiresAt" > "issuedAt")
);

CREATE TABLE "TradingRestrictedEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketDate" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blockMode" TEXT NOT NULL,
    "windowStartAt" TIMESTAMP(3),
    "windowEndAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradingRestrictedEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TradingRestrictedEvent_mode_check" CHECK (
      ("blockMode" = 'FULL_DAY' AND "windowStartAt" IS NULL AND "windowEndAt" IS NULL)
      OR
      ("blockMode" = 'WINDOW' AND "windowStartAt" IS NOT NULL AND "windowEndAt" IS NOT NULL AND "windowEndAt" > "windowStartAt")
    ),
    CONSTRAINT "TradingRestrictedEvent_full_day_macro_check" CHECK (
      "eventType" NOT IN ('CPI','EMPLOYMENT_SITUATION_NFP','FOMC') OR "blockMode" = 'FULL_DAY'
    )
);

CREATE TABLE "TradingWorkspaceRuntime" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastEvaluationAt" TIMESTAMP(3),
    "lastOutcome" TEXT,
    "lastErrorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradingWorkspaceRuntime_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradingWorkspaceEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketDate" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "relatedReadyAlertId" TEXT,
    "relatedPositionId" TEXT,
    "payload" JSONB NOT NULL,
    "discordDeliveryState" TEXT NOT NULL DEFAULT 'PENDING',
    "discordDeliveredAt" TIMESTAMP(3),
    "providerStatusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradingWorkspaceEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradingPositionMark" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "markType" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "underlyingPrice" DOUBLE PRECISION,
    "contractBid" DOUBLE PRECISION,
    "contractAsk" DOUBLE PRECISION,
    "modeledExitPrice" DOUBLE PRECISION,
    "modeledNetPnlDollars" DOUBLE PRECISION,
    "sourceState" TEXT NOT NULL,
    "sourceSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradingPositionMark_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradingManualOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketDate" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "relatedOpportunityId" TEXT,
    "relatedPositionId" TEXT,
    "sourceEngineState" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradingManualOverride_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TradingManualOverride_reason_check" CHECK (length(trim("reason")) >= 5)
);

CREATE UNIQUE INDEX "TradingDayLedger_userId_marketDate_key" ON "TradingDayLedger"("userId", "marketDate");
CREATE INDEX "TradingDayLedger_userId_marketDate_idx" ON "TradingDayLedger"("userId", "marketDate");
CREATE INDEX "TradingPosition_userId_marketDate_status_idx" ON "TradingPosition"("userId", "marketDate", "status");
CREATE INDEX "TradingPosition_userId_openedAt_idx" ON "TradingPosition"("userId", "openedAt");
CREATE INDEX "TradingPosition_userId_setupEpisodeId_idx" ON "TradingPosition"("userId", "setupEpisodeId");
CREATE UNIQUE INDEX "TradingPosition_one_open_per_user_idx" ON "TradingPosition"("userId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "TradingPosition_readyAlertId_key" ON "TradingPosition"("readyAlertId");
CREATE UNIQUE INDEX "TradingAttempt_positionId_key" ON "TradingAttempt"("positionId");
CREATE UNIQUE INDEX "TradingAttempt_userId_setupEpisodeId_attemptNumber_key" ON "TradingAttempt"("userId", "setupEpisodeId", "attemptNumber");
CREATE INDEX "TradingAttempt_userId_marketDate_createdAt_idx" ON "TradingAttempt"("userId", "marketDate", "createdAt");
CREATE INDEX "TradingAttempt_userId_setupEpisodeId_idx" ON "TradingAttempt"("userId", "setupEpisodeId");
CREATE INDEX "TradingReadyAlert_userId_marketDate_status_idx" ON "TradingReadyAlert"("userId", "marketDate", "status");
CREATE INDEX "TradingReadyAlert_userId_opportunityId_issuedAt_idx" ON "TradingReadyAlert"("userId", "opportunityId", "issuedAt");
CREATE INDEX "TradingReadyAlert_userId_expiresAt_idx" ON "TradingReadyAlert"("userId", "expiresAt");
CREATE UNIQUE INDEX "TradingReadyAlert_one_active_per_user_idx" ON "TradingReadyAlert"("userId") WHERE "status" = 'ACTIVE';
CREATE INDEX "TradingRestrictedEvent_userId_marketDate_enabled_idx" ON "TradingRestrictedEvent"("userId", "marketDate", "enabled");
CREATE UNIQUE INDEX "TradingWorkspaceRuntime_userId_key" ON "TradingWorkspaceRuntime"("userId");
CREATE UNIQUE INDEX "TradingWorkspaceEvent_userId_dedupeKey_key" ON "TradingWorkspaceEvent"("userId", "dedupeKey");
CREATE INDEX "TradingWorkspaceEvent_userId_createdAt_idx" ON "TradingWorkspaceEvent"("userId", "createdAt");
CREATE INDEX "TradingWorkspaceEvent_userId_discordDeliveryState_createdAt_idx" ON "TradingWorkspaceEvent"("userId", "discordDeliveryState", "createdAt");
CREATE UNIQUE INDEX "TradingPositionMark_positionId_markType_key" ON "TradingPositionMark"("positionId", "markType");
CREATE INDEX "TradingPositionMark_positionId_observedAt_idx" ON "TradingPositionMark"("positionId", "observedAt");
CREATE INDEX "TradingManualOverride_userId_marketDate_createdAt_idx" ON "TradingManualOverride"("userId", "marketDate", "createdAt");

ALTER TABLE "TradingDayLedger" ADD CONSTRAINT "TradingDayLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradingPosition" ADD CONSTRAINT "TradingPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradingPosition" ADD CONSTRAINT "TradingPosition_readyAlertId_fkey" FOREIGN KEY ("readyAlertId") REFERENCES "TradingReadyAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TradingAttempt" ADD CONSTRAINT "TradingAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradingAttempt" ADD CONSTRAINT "TradingAttempt_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "TradingPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TradingReadyAlert" ADD CONSTRAINT "TradingReadyAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradingRestrictedEvent" ADD CONSTRAINT "TradingRestrictedEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradingWorkspaceRuntime" ADD CONSTRAINT "TradingWorkspaceRuntime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradingWorkspaceEvent" ADD CONSTRAINT "TradingWorkspaceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradingPositionMark" ADD CONSTRAINT "TradingPositionMark_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "TradingPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradingManualOverride" ADD CONSTRAINT "TradingManualOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
