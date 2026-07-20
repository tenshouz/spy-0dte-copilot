# SPY 0DTE Copilot V1.1 Release Runbook

## Scope

V1.1 is a local, single-user, SPY-only, read-only decision-support system. It provides normalized Schwab market data, deterministic market structure, options exposure analytics, Trade Plan assembly with soft GEX/DEX confidence confirmation, read-only sizing support, Discord notifications, persistent journaling, analytics, and captured-snapshot replay. It does not create, modify, route, or execute orders.

## Required services

- Node.js 20 or newer
- npm 10 or newer
- Docker Desktop with the repository PostgreSQL service
- Schwab developer credentials and the exact HTTPS OAuth callback
- Optional Discord incoming webhook

## Normal startup

1. Start Docker Desktop.
2. Run `docker compose up -d` from the repository root.
3. Run `npx prisma migrate deploy --schema apps/server/prisma/schema.prisma` with `DATABASE_URL` loaded.
4. Run `npx prisma generate --schema apps/server/prisma/schema.prisma`.
5. Start the backend with `npm run dev:server`.
6. Start the frontend with `npm run dev:web`.
7. Keep the HTTPS tunnel running when Schwab OAuth must redirect back to the backend.
8. Open `/system` and confirm there are no required failures.

## Release verification

Run `npm run verify:v1` after Prisma generation. The command executes every backend and frontend specification, both TypeScript builds, lint, the frontend production build, tracked-secret checks, route safety checks, and whitespace validation.

The explicit data probe on `/system` is intentionally manual because it may call Schwab. A closed market or a day without a current-date expiration can produce a legitimate stale or not-applicable result.

## Backup and restore

### Database backup

Use a file inside the PostgreSQL container and then copy it out. This avoids corrupting the binary custom-format dump through Windows PowerShell output redirection.

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$containerDump = "/tmp/spy-copilot-$stamp.dump"
$localDump = "$env:USERPROFILE\Downloads\spy-copilot-$stamp.dump"

docker compose exec -T db pg_dump -U spy -d spy_copilot -Fc -f $containerDump
if ($LASTEXITCODE -ne 0) { throw "Database backup failed." }

docker compose cp "db:$containerDump" $localDump
if ($LASTEXITCODE -ne 0) { throw "Database backup copy failed." }

docker compose exec -T db rm -f $containerDump
Get-FileHash $localDump -Algorithm SHA256
```

The dump contains application records and encrypted Schwab tokens. Protect it like a credential-bearing backup. Never upload it to ChatGPT, source control, or public storage.

### Database restore

1. Stop the backend and frontend.
2. Create a fresh backup of the current database.
3. Restore only into a trusted local PostgreSQL instance:

```powershell
$localDump = "C:\path\to\spy-copilot-backup.dump"
$containerDump = "/tmp/spy-copilot-restore.dump"

if (!(Test-Path $localDump)) { throw "Backup file was not found." }

docker compose cp $localDump "db:$containerDump"
if ($LASTEXITCODE -ne 0) { throw "Database restore copy failed." }

docker compose exec -T db pg_restore -U spy -d spy_copilot --clean --if-exists $containerDump
if ($LASTEXITCODE -ne 0) { throw "Database restore failed." }

docker compose exec -T db rm -f $containerDump
```

4. Run Prisma migrations again.
5. Restart the backend and confirm `/api/system/readiness`.

### Source backup

Use `git archive` from a committed checkpoint. Never include `.env`, database dumps, `node_modules`, `.next`, logs, or local Prisma databases.

## Schwab recovery

- `credentials_not_configured`: complete all Schwab variables and restart the backend.
- `config_invalid`: correct the exact HTTPS callback path and encryption-key requirements.
- `not_connected`: run the OAuth connection flow from Settings.
- `token_expired`: reconnect. Normal near-expiry access tokens are refreshed automatically; a definitive refresh rejection invalidates the stored token so stale authenticated data is not mislabeled live.
- rate limit, timeout, or network failure: the market-data services apply bounded timeouts, in-flight deduplication, shared backoff, and honest LIVE/STALE/MOCK or UNAVAILABLE labeling.

Never paste access tokens, refresh tokens, client secrets, account hashes, raw provider bodies, or the Discord webhook URL into support messages.

## Discord and automation recovery

- Keep persistent backend automation disabled until the webhook test passes.
- If runtime state is `STANDBY`, another backend process owns the database lease; stop the duplicate process.
- If runtime state is `STALE`, restart the backend and inspect sanitized delivery history.
- `AMBIGUOUS` delivery outcomes are persistently suppressed to prevent duplicate messages.
- Provider bodies and webhook secrets are not stored in delivery audit history.

## Incident response

1. Stop the backend to stop scheduled evaluations and outbound notifications.
2. Do not delete the database before taking a backup.
3. Record only sanitized reason codes and request IDs.
4. Use `/system` to identify configuration, persistence, connection, or runtime failures.
5. Re-run `npm run verify:v1` after any source repair.
6. Re-enable persistent automation only after readiness and explicit delivery tests pass.

## Shutdown

Press `Ctrl+C` in frontend and backend terminals. The backend stops its scheduler, stops accepting new requests, waits for active requests, disconnects Prisma, and force-closes connections only if the graceful-shutdown deadline is exceeded.
