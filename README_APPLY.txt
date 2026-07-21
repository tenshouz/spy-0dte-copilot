SPY 0DTE COPILOT V1.5.0 — APPLY INSTRUCTIONS

1. Preserve the hidden .git directory and apps/server/.env.
2. Copy the V1.5.0 files over the existing project.
3. Stop the backend before Prisma generation.
4. From the repository root, load DATABASE_URL and run:

$databaseLine = Get-Content apps\server\.env |
  Where-Object { $_ -match '^\s*DATABASE_URL\s*=' -and $_ -notmatch '^\s*#' } |
  Select-Object -First 1

if (!$databaseLine) {
  throw "DATABASE_URL is missing from apps/server/.env."
}

$databaseValue = ($databaseLine -split '=', 2)[1].Trim()

if (
  ($databaseValue.StartsWith('"') -and $databaseValue.EndsWith('"')) -or
  ($databaseValue.StartsWith("'") -and $databaseValue.EndsWith("'"))
) {
  $databaseValue = $databaseValue.Substring(1, $databaseValue.Length - 2)
}

$env:DATABASE_URL = $databaseValue
Remove-Variable databaseLine, databaseValue

npx prisma migrate deploy --schema apps/server/prisma/schema.prisma
npx prisma generate --schema apps/server/prisma/schema.prisma

5. Restart in separate PowerShell terminals:

npm run dev:server
npm run dev:web

6. Open System Readiness, then Settings. Enable Persistent Backend Automation to collect continuous point-in-time research snapshots.
7. Open Point-in-Time Backtest after enough snapshots have accumulated.
8. Verify locally with:

npm run verify:v1

No npm package or environment-variable name changed in V1.5.0.
Exact point-in-time history starts only after the V1.5.0 migration is active.
