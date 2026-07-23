# SPY 0DTE Copilot V1.5.2 Verification Report

**Release:** V1.5.2 Discord Alert Hardening  
**Baseline:** User-provided sanitized V1.5.1 project  
**Verification date:** 2026-07-22

## Source integrity

- The uploaded ZIP SHA-256 matched the supplied checksum before extraction.
- The patch was applied to that exact sanitized source tree.
- No `.env`, `.git`, `node_modules`, build output, database file, or credential file is included in the release package.

## Static checks completed

- All 329 implementation TypeScript/TSX files passed TypeScript syntax transpilation with TypeScript 5.8.3. (`next-env.d.ts` is a declaration-only file and was excluded from output generation.)
- Package and lockfile JSON parse checks passed.
- Runtime semantic-key smoke tests passed for one-cent trigger/confidence/exposure updates and READY contract refreshes.
- Runtime transition smoke tests passed for waiting suppression, READY activation, READY withdrawal, new-attempt requalification, three-poll clearing, cooldown reappearance, and Discord deliverability.
- Runtime shared-process fingerprint claim/release smoke tests passed.
- Alert candidate, transition, delivery, backend automation, and UI-copy test sources were updated for the new policy.
- Source diff and forbidden-file scans were completed before packaging.

## Behavioral coverage added

The focused specifications now cover:

- Waiting candidate keys ignoring trigger, confidence, target, and price refreshes.
- READY candidate keys ignoring contract and exposure refreshes.
- Lifecycle changes producing different semantic keys.
- One missing candidate poll not clearing an episode.
- Three consecutive missing polls clearing silently.
- Same episode restoration without re-alerting.
- Previously emitted transition fingerprint suppression during oscillation.
- Routine WAITING transitions never calling Discord.
- Persistent backend delivery suppressing a competing foreground sender.
- Shared process fingerprint protection against a second sender.
- Persistent backend capture committing non-actionable state without delivery.
- New backend status reason copy.

## Full execution limitation

A clean dependency installation could not be completed in the isolated packaging environment because the configured npm package endpoint returned HTTP 503 responses. Therefore, this report does not claim a fresh full `npm run verify:v1` execution in that environment.

Run the included local verification commands after applying the patch. The source changes introduce no dependency or Prisma changes, so the user's existing working `node_modules` installation is sufficient.

## Safety conclusion

The release does not change trade eligibility, does not create orders, and keeps historical capture active. Its outbound Discord surface is narrower and fail-closed: routine recalculations are suppressed, uncertain provider outcomes are not blindly retried, and persistent automation remains the single preferred delivery owner.
