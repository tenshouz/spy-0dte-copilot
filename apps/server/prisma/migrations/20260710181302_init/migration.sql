-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchwabToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchwabToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discordWebhookUrl" TEXT,
    "alertPreferences" JSONB NOT NULL,
    "scoringRulesVersion" TEXT NOT NULL DEFAULT 'v1',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spotPrice" DOUBLE PRECISION NOT NULL,
    "vwap" DOUBLE PRECISION NOT NULL,
    "openingRangeHigh" DOUBLE PRECISION,
    "openingRangeLow" DOUBLE PRECISION,
    "premarketHigh" DOUBLE PRECISION,
    "premarketLow" DOUBLE PRECISION,
    "overnightHigh" DOUBLE PRECISION,
    "overnightLow" DOUBLE PRECISION,
    "trend5m" TEXT NOT NULL,
    "trend1m" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "relativeVolume" DOUBLE PRECISION NOT NULL,
    "emaTrend" TEXT NOT NULL,
    "netGex" DOUBLE PRECISION NOT NULL,
    "netDex" DOUBLE PRECISION NOT NULL,
    "gammaFlip" DOUBLE PRECISION,
    "callWall" DOUBLE PRECISION,
    "putWall" DOUBLE PRECISION,
    "dealerPositioning" TEXT NOT NULL,
    "expectedMove" DOUBLE PRECISION NOT NULL,
    "ivRank" DOUBLE PRECISION,
    "expirationUsed" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "bias" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "bullishScenario" TEXT NOT NULL,
    "bearishScenario" TEXT NOT NULL,
    "tradePlan" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "reasoning" TEXT NOT NULL,
    "factorScores" JSONB NOT NULL,
    "screenshotUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "traded" BOOLEAN NOT NULL DEFAULT false,
    "direction" TEXT,
    "entryPrice" DOUBLE PRECISION,
    "exitPrice" DOUBLE PRECISION,
    "pnl" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordLog" (
    "id" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SchwabToken_userId_key" ON "SchwabToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_userId_key" ON "Settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reportId_key" ON "JournalEntry"("reportId");

-- AddForeignKey
ALTER TABLE "SchwabToken" ADD CONSTRAINT "SchwabToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MarketSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
