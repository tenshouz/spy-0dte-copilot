# SPY 0DTE Copilot V1.9.1 Release Runbook

## Scope

V1.9.1 is a local, single-user, SPY-only decision-support and paper-equivalent lifecycle system. It includes the V1.5 deterministic source engines plus V1.6–V1.9 policy, risk, position, setup-registry, opportunity, READY-alert, event-restriction, execution-research, and Trading Workspace layers. It does not create, modify, route, or execute brokerage orders.

## Required services

- Node.js 20 or newer
- npm 10 or newer
- Docker Desktop with the repository PostgreSQL service
- Schwab developer credentials and the exact HTTPS OAuth callback
- Optional Discord incoming webhook

## Normal startup

1. Start Docker Desktop.
2. Run `docker compose up -d` from the repository root.
3. Run `npm run db:validate`.
4. Run `npm run db:generate`.
5. Run `npm run db:deploy`.
6. Start the backend with `npm run dev:server`.
7. Start the frontend with `npm run dev:web`.
8. Keep the HTTPS tunnel running when Schwab OAuth must redirect to the backend.
9. Open `/system`; confirm release `v1.9.1`, trading-framework persistence, policy, registry, and Workspace monitor status.
10. Run the explicit complete probe to validate quote, candles, options, Assembly, and Trading Workspace together.

## Release verification

With backend and frontend stopped, run:

```powershell
npm run db:validate
npm run db:generate
npm run db:deploy
npm run verify:v1
```

Verification must cover backend and frontend specifications, TypeScript builds, lint, frontend production build, route safety, release metadata, current Guide/System copy, source hygiene, and whitespace.

Keep Trade Plan Alerts disabled until verification passes and `/api/trading-workspace/spy` returns a validated response.

## Trading Workspace operating checks

- Confirm all V1.9 trading tables are present.
- Confirm the Workspace monitor heartbeat is active or understand why it is stopped/stale.
- Confirm the current event calendar before the session; CPI, Employment Situation/NFP, and FOMC require full-day blocks.
- Confirm daily ledger values before manually recording an entry.
- Confirm the READY alert is active and unexpired.
- Confirm the selected contract came from the bounded ATM-adjacent `CONTRACT_V3` window, premium is no more than $150, modeled planned structural loss is no more than $50, and both underlying/option R:R are at least 1.5:1.
- Confirm no new entry is recorded at or after 3:00 p.m. ET.
- Manually record exits. SPY structural invalidation is primary; also act on the executable-Bid $50 loss backstop. Target 2 is the primary objective, 3:55 p.m. is mandatory, and the position must be closed before 4:00 p.m. ET.

## Backup and restore

### Database backup

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

The dump contains application records and encrypted Schwab tokens. Never upload it or commit it.

### Database restore

1. Stop backend and frontend.
2. Back up the current database.
3. Restore only into a trusted local PostgreSQL instance.
4. Run `npm run db:deploy` and `npm run db:generate`.
5. Restart the backend and verify `/api/system/readiness` and `/api/trading-workspace/spy`.

### Source backup

Use a committed Git checkpoint or a sanitized source archive. Exclude `.env`, database dumps, `node_modules`, `.next`, `dist`, logs, copied installers, and backup folders.

## Schwab recovery

- `credentials_not_configured`: complete required variables and restart.
- `config_invalid`: correct the exact HTTPS callback and encryption-key requirements.
- `not_connected`: repeat OAuth from Settings.
- `token_expired`: reconnect; definitive refresh rejection invalidates the stored token.
- Rate limit, timeout, or network failure: allow the existing bounded timeout, backoff, cache, and in-flight deduplication to recover.

Never paste tokens, secrets, account hashes, raw provider bodies, or webhook URLs into support messages.

## Discord and automation recovery

- Keep automation disabled until webhook and readiness checks pass.
- `STANDBY`: another backend process owns the general automation lease.
- `STALE`: restart the backend and inspect sanitized delivery history.
- Workspace READY/position delivery is persistent-backend owned and actionable-only.
- Expiration, revocation, and Target 3 research records must not create Discord noise.

## Incident response

1. Stop the backend to stop schedulers and outbound notifications.
2. Do not delete the database before taking a backup.
3. Record sanitized reason codes and request IDs only.
4. Use `/system` and the explicit probe to isolate configuration, migration, provider, Assembly, or Workspace failures.
5. Re-run `npm run verify:v1` after source repair.
6. Re-enable automation only after readiness, probe, and Workspace checks pass.

## Shutdown

Press `Ctrl+C` in frontend and backend terminals. The backend stops its schedulers, stops accepting requests, waits for active requests, disconnects Prisma, and uses forced shutdown only after the graceful deadline.
