SPY 0DTE COPILOT — CUMULATIVE UX UPDATE FOR BASELINE 8ab30c8

This changed-files package contains both:
1. The previously delivered chart-level visibility controls.
2. The new pivot ordering/color and compact Dashboard structure-card improvements.

It is safe to apply whether or not the earlier chart-toggle package was already copied into the project.

WHAT CHANGED
- Dashboard and Market Data charts: shared per-level visibility menu with Core, All, and None presets.
- Daily and Weekly pivot tables: R2 → R1 → Pivot → S1 → S2.
- Pivot colors: resistance values are red; support values are green; Pivot remains neutral.
- Structural Bias: bullish/bearish/neutral counts, primary driver, and counterweight.
- Structural Confidence: bull score, bear score, contradiction, data quality, and confidence-limiter explanation.
- Market Structure: deterministic directional read and nearest validated key level with distance.
- Compact Dashboard 0DTE Exposure Structure: responsive 2×2 desktop metric layout and collapsed Methodology disclosure.
- Full Market Data Exposure Structure remains detailed.

HOW TO APPLY
1. Close the frontend development terminal, or stop it with Ctrl+C.
2. Extract this ZIP into a temporary folder.
3. Copy the included apps folder into the root of the real project:
   C:\Users\navam\Downloads\spy-0dte-copilot (1)\spy-0dte-copilot
4. Allow Windows to merge folders and replace files.
5. From the real project root, restart the frontend:
   npm run dev:web

NOT REQUIRED
- npm install
- Prisma generate or migrate
- Docker/database changes
- Backend restart
- Environment-variable changes

VERIFICATION COMPLETED
- ESLint passed.
- Frontend TypeScript no-emit validation passed.
- All 21 frontend spec files passed.
- Production build reached the existing next/font step, then was blocked only because the isolated environment could not reach fonts.googleapis.com for Inter and JetBrains Mono.
