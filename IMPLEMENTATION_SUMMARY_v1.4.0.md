# V1.4.0 Implementation Summary

## What changed in the trade decision

A directional bias is no longer enough, and a live-price cross is no longer enough. A trade plan reaches `READY` only after:

1. Raw-source timestamps are coherent.
2. The session and opening-range requirements are valid.
3. Directional structure passes material counterevidence rules.
4. A completed five-minute candle closes through a buffered trigger.
5. Current price maintains the break.
6. Recross, participation, and chase controls pass.
7. A setup-specific invalidation and structural objective provide at least 2.0 SPY-point reward/risk.
8. A fresh, liquid, delta-qualified 0DTE contract is available.
9. The conservative option scenario provides at least 1.25 estimated premium reward/risk.

## What does not control the trade

- The alignment score is not a win probability and is not a standalone entry signal.
- GEX and DEX do not create direction or adjust confidence in V1.4.0.
- Expected move is not a guaranteed target.
- A preflight contract shown while waiting is not a selected contract.
- The dashboard does not execute orders.

## Installation

1. Back up the working project and preserve `.git` and `apps/server/.env`.
2. Stop backend and frontend terminals.
3. Copy the V1.4.0 project files over the existing repository.
4. Deploy the new Prisma migration and generate the client.
5. Restart backend and frontend.
6. Open Trade Plan and verify confirmation, option scenario, and source-integrity diagnostics.
7. Review GitHub Desktop for unexpected files or secrets before committing.

See `README_APPLY.txt` for exact commands.
