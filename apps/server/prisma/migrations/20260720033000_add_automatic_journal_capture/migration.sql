ALTER TABLE "DeterministicJournalSnapshot"
ADD COLUMN "captureMode" TEXT NOT NULL DEFAULT 'EXPLICIT',
ADD COLUMN "sourceReferenceType" TEXT,
ADD COLUMN "sourceReferenceKey" TEXT;

CREATE INDEX "DeterministicJournalSnapshot_userId_captureMode_idx"
ON "DeterministicJournalSnapshot"("userId", "captureMode");

CREATE UNIQUE INDEX "DeterministicJournalSnapshot_userId_sourceReferenceKey_key"
ON "DeterministicJournalSnapshot"("userId", "sourceReferenceKey");
