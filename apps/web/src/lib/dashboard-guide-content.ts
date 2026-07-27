export type GuideTone = "bull" | "wait" | "bear" | "accent" | "default";

export interface GuidePageDefinition {
  href: string;
  title: string;
  shortTitle: string;
  purpose: string;
  useWhen: string;
  features: readonly string[];
  remember: string;
  searchTerms: readonly string[];
}

export interface GuideStatusDefinition {
  label: string;
  tone: GuideTone;
  simpleMeaning: string;
  action: string;
}

export interface GuideGlossaryDefinition {
  term: string;
  meaning: string;
  searchTerms: readonly string[];
}

export interface GuidePolicyFact {
  title: string;
  detail: string;
}

export const GUIDE_SECTION_LINKS = [
  { id: "start-here", label: "Start here" },
  { id: "daily-workflow", label: "Daily workflow" },
  { id: "trading-policy", label: "Trading policy" },
  { id: "pages", label: "Every page" },
  { id: "trade-plan", label: "Trade Plan flow" },
  { id: "statuses", label: "Statuses and colors" },
  { id: "alerts", label: "Discord alerts" },
  { id: "journal-replay", label: "Journal and replay" },
  { id: "sharing", label: "Sharing safely" },
  { id: "glossary", label: "Simple glossary" },
] as const;

export const GUIDE_DAILY_WORKFLOW = [
  {
    title: "Start the required services",
    detail:
      "Start PostgreSQL, the backend, and the frontend. The backend must remain online for live data, READY reconciliation, position monitoring, and Discord delivery.",
  },
  {
    title: "Check System Readiness",
    detail:
      "Open System Readiness first. Confirm release V1.9.1, the 13 configuration/runtime checks, and the Trading Workspace monitor. Run the complete probe when you need live end-to-end confirmation.",
  },
  {
    title: "Confirm connections and automation",
    detail:
      "In Settings, confirm Schwab and Discord status. Enable persistent backend automation only when you want actionable notifications and the readiness checks are acceptable.",
  },
  {
    title: "Use Dashboard for market context",
    detail:
      "Watch price, VWAP, session structure, important levels, expected move, exposure context, bias, and the current deterministic Trade Plan state.",
  },
  {
    title: "Use Trade Plan for the source thesis",
    detail:
      "Review the structural direction, trigger, invalidation, objective, bounded ATM-plus-adjacent contract result, execution quality, and confidence inputs.",
  },
  {
    title: "Use Trading Workspace for policy and lifecycle",
    detail:
      "Confirm the $1,000 paper-equivalent policy, daily risk ledger, event/time restrictions, setup episode, 60-second READY alert, and manual entry/exit actions. No broker order is created.",
  },
  {
    title: "Record and review results",
    detail:
      "Use the Journal, Workspace position history, Replay, and Backtest pages to separate engine evidence, modeled execution, and the prices or outcomes you manually recorded.",
  },
] as const;

export const GUIDE_TRADING_POLICY_FACTS: readonly GuidePolicyFact[] = [
  {
    title: "Account and hard risk limits",
    detail:
      "$1,000 paper-equivalent account; maximum $150 contract premium; maximum $50 planned structural loss per trade; maximum $150 daily loss including realized losses plus open planned risk.",
  },
  {
    title: "Trade frequency and attempts",
    detail:
      "Maximum 3 trades per market date, stop after 2 consecutive losses, one concurrent one-contract position, and at most 2 attempts per setup/direction/level episode.",
  },
  {
    title: "Entry and exit clock",
    detail:
      "No new entry at or after 3:00 p.m. ET; normal mandatory manual exit at 3:55 p.m.; absolute deadline before 4:00 p.m. ET.",
  },
  {
    title: "Targets and time review",
    detail:
      "Target 2 is the primary one-contract exit. Target 1 is management information, Target 3 is research-only, and 15 minutes/3 completed candles creates a review rather than an automatic exit.",
  },
  {
    title: "Contract and reward-to-risk",
    detail:
      "CONTRACT_V3 evaluates only the effective ATM strike and the immediately adjacent returned strike on each side. It ranks passing candidates by execution cost, delta alignment, liquidity, option R:R, and premium; it never searches farther. The debit must be at most $150 and modeled structural loss at most $50. Minimum underlying and option-premium R:R is 1.5:1; 2.0:1 or better is preferred.",
  },
  {
    title: "Execution and confirmation",
    detail:
      "Modeled entries use the ask and modeled exits use the bid. The primary stop is SPY structural invalidation, with a hard $50 bid-side loss backstop based on the actual entry price; whichever occurs first prompts a manual exit. Every entry and exit requires manual confirmation, and the dashboard never submits a broker order.",
  },
  {
    title: "Events, conflicts, and shadow setups",
    detail:
      "CPI, Employment Situation/NFP, and FOMC are full-day blocks; other major events use configured windows. Duplicate signals consolidate, unresolved Calls/Puts conflicts fail closed, and new setup families remain shadow-only until explicitly promoted.",
  },
] as const;

export const GUIDE_PAGES: readonly GuidePageDefinition[] = [
  {
    href: "/dashboard",
    title: "Dashboard",
    shortTitle: "Dashboard",
    purpose: "The main screen for understanding the current SPY 0DTE situation at a glance.",
    useWhen: "Use it throughout the session for the fastest overall view.",
    features: [
      "Live SPY quote and responsive five-minute chart",
      "VWAP, previous-day levels, 7:00–9:30 AM premarket levels, opening ranges, and pivots",
      "Expected move and returned-window GEX/DEX context",
      "Current market bias, confidence, regime, and Trade Plan summary",
      "Session timeline showing how the deterministic state changed",
    ],
    remember:
      "The Dashboard summarizes many engines. Open the dedicated page when you need the full explanation behind a number.",
    searchTerms: ["home", "chart", "quote", "bias", "levels", "timeline", "overview"],
  },
  {
    href: "/market-data",
    title: "Market Data",
    shortTitle: "Market Data",
    purpose: "Shows the source data and whether every required component is healthy, stale, partial, or unavailable.",
    useWhen: "Use it when a warning appears or a Trade Plan is being blocked by data quality.",
    features: [
      "Unified Context Coverage for quote, candles, session data, VWAP, levels, options, GEX, and DEX",
      "Detailed session levels and current-date chart overlays",
      "Data-source states and calculation timestamps",
      "Live quote and candle age labels",
    ],
    remember:
      "A bearish red number is not always an error. Look at the written status: AVAILABLE, PARTIAL, STALE, or UNAVAILABLE.",
    searchTerms: ["coverage", "partial", "stale", "source", "data quality", "warning"],
  },
  {
    href: "/options",
    title: "Options Chain",
    shortTitle: "Options Chain",
    purpose: "Displays the normalized current-date SPY option contracts returned by Schwab.",
    useWhen: "Use it to inspect strikes, quotes, Greeks, volume, open interest, and contract quality.",
    features: [
      "Same-day SPY calls and puts",
      "Bid, ask, midpoint, spread, volume, open interest, and Greeks",
      "Normalized contract details used by expected move, exposure, and contract selection",
      "Read-only data with no order controls",
    ],
    remember:
      "Seeing a contract in the chain does not mean it qualifies for the Trade Plan. The contract selector applies additional quote and spread rules.",
    searchTerms: ["contracts", "strikes", "calls", "puts", "bid", "ask", "greeks", "delta"],
  },
  {
    href: "/gamma",
    title: "GEX / DEX",
    shortTitle: "GEX / DEX",
    purpose: "Explains the option-chain exposure structure around SPY.",
    useWhen: "Use it to see whether exposure context supports or conflicts with the price-structure thesis.",
    features: [
      "Call GEX, Put GEX, Net GEX, Call DEX, Put DEX, and Net DEX proxies",
      "Ranked Call Wall and Put Wall proxies",
      "Gamma-balance proxy, Gamma cliffs, and DEX anchor",
      "Research-only exposure context with zero direct confidence points under EXPOSURE_CONFIRMATION_V2",
    ],
    remember:
      "These are returned-chain-window analytical proxies, not direct knowledge of dealer inventory. They contribute zero direct confidence points and cannot create, strengthen, or block a live direction by themselves.",
    searchTerms: ["gamma", "delta", "walls", "cliffs", "dealer", "exposure", "confirmation"],
  },
  {
    href: "/workspace",
    title: "Trading Workspace",
    shortTitle: "Workspace",
    purpose:
      "Applies TRADING_POLICY_V1 to the current opportunity and manages the manually confirmed paper-equivalent lifecycle.",
    useWhen:
      "Use it after reviewing the source Trade Plan and before recording any paper-equivalent entry or exit.",
    features: [
      "$1,000 policy limits and current daily risk ledger",
      "Four live setup bridges plus ten shadow-only setup families",
      "Duplicate consolidation and fail-closed directional conflicts",
      "Full-day and windowed event restrictions plus 3:00/3:55/4:00 ET controls",
      "Sixty-second READY alert, manual entry/exit confirmation, and audited overrides",
      "Ask-entry/bid-exit modeling, structural stop plus $50 bid-side loss backstop, Target 1/2/3 marks, time review, and pure-engine versus user-executed research",
    ],
    remember:
      "The Workspace records decisions and paper-equivalent positions only. It cannot create, modify, or close a Schwab order.",
    searchTerms: [
      "policy",
      "risk ledger",
      "position",
      "ready alert",
      "attempt",
      "event block",
      "shadow mode",
      "manual entry",
      "target 2",
    ],
  },
  {
    href: "/trade-plan",
    title: "Trade Plan",
    shortTitle: "Trade Plan",
    purpose:
      "Builds the deterministic structural Calls or Puts thesis and contract result that feeds the V1.9.1 Trading Workspace.",
    useWhen: "Use it to inspect the source structure before any manual paper-equivalent decision.",
    features: [
      "Plan state, direction, entry trigger, and source reason codes",
      "Structural invalidation, objectives, and minimum 1.5:1 underlying R:R with 2.0:1 preferred",
      "Bounded same-day contract selection: effective ATM plus one adjacent strike on each side, with no farther-strike search",
      "Execution-quality confirmation, $150 debit cap, modeled structural loss no greater than $50, and separate full-premium exposure",
      "Structural confidence with GEX/DEX displayed as zero-weight research context",
      "Read-only sizing reference; V1.9.1 hard policy eligibility is shown in Trading Workspace",
    ],
    remember:
      "A source Trade Plan can be structurally READY while the Workspace still blocks entry for daily risk, attempts, event restrictions, time limits, conflicts, or an expired READY alert.",
    searchTerms: [
      "ready",
      "entry",
      "trigger",
      "stop",
      "target",
      "risk reward",
      "contract",
      "bounded contract",
      "sizing",
    ],
  },
  {
    href: "/alerts",
    title: "Alerts",
    shortTitle: "Alerts",
    purpose:
      "Shows the legacy source Trade Plan alert candidate/transition monitor and general Discord delivery history.",
    useWhen:
      "Use it to troubleshoot source-plan transitions or general delivery. Use Trading Workspace for V1.9 READY and position-management lifecycle state.",
    features: [
      "Current source Trade Plan alert candidate and transition state",
      "Persistent deduplication so the same source plan is not repeatedly sent",
      "General Discord delivery and retry history",
      "Foreground monitor status when persistent backend automation is not being used",
    ],
    remember:
      "V1.9 Workspace READY and position-management events are separate from this legacy source-plan monitor. Persistent backend settings control both delivery paths; neither path creates an order.",
    searchTerms: ["discord", "webhook", "notification", "dedupe", "delivery", "candidate", "transition"],
  },
  {
    href: "/journal",
    title: "Trade Journal",
    shortTitle: "Journal",
    purpose: "Stores deterministic Trade Plan snapshots and your manually entered outcomes.",
    useWhen: "Use it to build a truthful record of what the dashboard showed and what you actually did.",
    features: [
      "Manual snapshot capture",
      "Opt-in automatic capture of meaningful plan candidates",
      "Outcome labels: unreviewed, no trade, win, loss, or breakeven",
      "Realized P&L and notes entered by you",
      "Review coverage, win rate, expectancy, profit factor, and breakdown analytics",
    ],
    remember:
      "The dashboard never guesses whether you entered a trade or what your P&L was. Outcome data is only what you explicitly enter.",
    searchTerms: ["results", "pnl", "win rate", "expectancy", "notes", "snapshot", "analytics"],
  },
  {
    href: "/replay",
    title: "Historical Replay",
    shortTitle: "Replay",
    purpose: "Replays the deterministic snapshots that were actually saved in the Journal.",
    useWhen: "Use it to audit past state changes and check for look-ahead problems.",
    features: [
      "Chronological replay of captured Assembly snapshots",
      "No-look-ahead timestamp and integrity checks",
      "Session summaries and state transitions",
      "Post-hoc outcome scorecard kept separate from the historical source state",
      "Saved replay runs with optional date filters",
    ],
    remember:
      "This is captured-snapshot replay, not a fabricated raw-market backtest. It cannot reconstruct data that was never saved.",
    searchTerms: ["backtest", "history", "audit", "look ahead", "timeline", "past"],
  },
  {
    href: "/backtest",
    title: "Point-in-Time Backtesting",
    shortTitle: "Backtest",
    purpose: "Recomputes the current deterministic engine at exact forward-captured historical boundaries and grades what happened afterward.",
    useWhen: "Use it to test whether the dashboard rules produce reliable outcomes without allowing future information into the plan.",
    features: [
      "Exact stored Market State and deduplicated Options Chain snapshots",
      "Current-rule recomputation at each historical source timestamp",
      "First READY plan per unique setup episode",
      "Target-before-stop, stop-before-target, ambiguous-candle, MFE, MAE, and R-multiple outcomes",
      "Observed or model-based option P&L estimates clearly labeled by source",
      "Breakdowns by setup, direction, and Gamma regime",
    ],
    remember:
      "V1.5 starts exact forward capture after installation. It cannot reconstruct option-chain data from dates before those snapshots were stored, and its results are research rather than a promise of future performance.",
    searchTerms: ["backtest", "point in time", "outcomes", "mfe", "mae", "calibration", "historical plan"],
  },
  {
    href: "/system",
    title: "System Readiness",
    shortTitle: "System",
    purpose: "Reports whether the current V1.9.1 local system is operational and safe to use.",
    useWhen: "Use it before the session and whenever data, the Workspace, or alerts behave unexpectedly.",
    features: [
      "Release V1.9.1 and 13 configuration, security, persistence, policy, registry, and runtime checks",
      "Trading-framework migration/table verification",
      "Trading Workspace monitor heartbeat state",
      "READY, DEGRADED, or BLOCKED overall state with remediation",
      "Explicit five-component live probe covering quote, candles, options, Assembly, and Trading Workspace",
    ],
    remember:
      "Static readiness and the explicit live probe answer different questions. Run the probe to confirm current provider and Workspace output without reconciling a READY alert or mutating a position.",
    searchTerms: [
      "health",
      "ready",
      "blocked",
      "probe",
      "database",
      "migration",
      "policy",
      "registry",
      "workspace heartbeat",
    ],
  },
  {
    href: "/settings",
    title: "Settings",
    shortTitle: "Settings",
    purpose: "Manages Schwab connectivity, Discord connectivity, and persistent backend automation.",
    useWhen: "Use it during setup, reconnection, testing, or alert troubleshooting.",
    features: [
      "Connect or reconnect Schwab OAuth",
      "Check Discord webhook status and send a fixed test message",
      "Enable persistent Trade Plan alerts and scheduled reports",
      "Choose a 15-, 30-, or 60-second backend evaluation cadence",
      "Inspect scheduler heartbeat, lease status, and sanitized delivery audit history",
    ],
    remember:
      "Secrets stay in apps/server/.env and are never displayed by the page. The backend must remain running for automatic alerts.",
    searchTerms: ["schwab", "oauth", "webhook", "automation", "cadence", "heartbeat", "scheduler"],
  },
  {
    href: "/guide",
    title: "Dashboard Guide",
    shortTitle: "Guide",
    purpose: "Explains the complete dashboard in simple language for first-time users.",
    useWhen: "Use it whenever a label, page, warning, or workflow is unfamiliar.",
    features: [
      "First-session checklist",
      "Plain-English description of every page",
      "Trade Plan and alert flow",
      "Status and color dictionary",
      "Sharing and security checklist",
      "Searchable glossary",
    ],
    remember:
      "The guide explains the product, but it does not replace checking the current source states and live values before acting.",
    searchTerms: ["help", "documentation", "onboarding", "instructions", "tutorial"],
  },
] as const;

export const GUIDE_TRADE_PLAN_STEPS = [
  {
    title: "1. The session and scheduled-event policy must allow evaluation",
    detail:
      "The system uses the current New York market date, the provider-aligned 7:00–9:30 AM ET premarket window, and the current session context. CPI, Employment Situation/NFP, and FOMC are fully blocked; configured other-major-event windows also block entry.",
  },
  {
    title: "2. Required source data must be trustworthy",
    detail:
      "Quote, VWAP, session candles, opening range, options, and other required inputs must be current and sufficiently complete. GEX/DEX remain research-only and cannot override policy, create a trade by themselves, or rescue stale, mock, partial, or unavailable required inputs; those inputs fail closed where the methodology requires it.",
  },
  {
    title: "3. A live setup family and structural direction must exist",
    detail:
      "The four validated live bridges can create opportunities. The ten newer setup families are visible for research in shadow mode and cannot create READY alerts or positions.",
  },
  {
    title: "4. Duplicates consolidate and unresolved direction conflicts fail closed",
    detail:
      "Signals describing the same setup episode are consolidated. If valid Calls and Puts candidates remain unresolved, the result is NO TRADE rather than choosing a side.",
  },
  {
    title: "5. Price must satisfy the deterministic entry trigger",
    detail:
      "Before the required confirmation, the source plan can remain WAITING FOR TRIGGER. Routine recalculations do not create a new setup episode or reset its attempt count.",
  },
  {
    title: "6. Structural and option economics must pass",
    detail:
      "Both underlying and option-premium reward-to-risk must be at least 1.5:1. A 2.0:1 or better relationship is preferred, but it is not the minimum gate.",
  },
  {
    title: "7. One bounded CONTRACT_V3 candidate must qualify",
    detail:
      "The selector evaluates at most three returned strikes on the required side: effective ATM, one immediately lower, and one immediately higher. Every candidate must pass freshness, spread, displayed size, activity, delta, $150 premium, option-scenario R:R, and $50 modeled structural-loss gates. Passing candidates are ranked transparently, and no fourth or farther strike is searched.",
  },
  {
    title: "8. The V1.9 risk ledger, time, event, and attempt gates must pass",
    detail:
      "The Workspace enforces $50 planned risk, $150 daily loss including open risk, 3 trades, 2 consecutive losses, one open position, two attempts per episode, and the 3:00 p.m. ET entry cutoff.",
  },
  {
    title: "9. A new READY alert remains actionable for 60 seconds",
    detail:
      "READY alerts expire after 60 seconds and can be revoked when the source opportunity changes. Expired or revoked alerts cannot be manually confirmed.",
  },
  {
    title: "10. Manual confirmation records the paper-equivalent lifecycle",
    detail:
      "You enter the actual paper price to record one contract. Exit when SPY reaches structural invalidation or the executable option bid reaches the $50 loss backstop, whichever occurs first. Target 2 is the primary exit, Target 1 is management, Target 3 is research-only, and the dashboard never sends a broker order.",
  },
] as const;

export const GUIDE_PLAN_STATES: readonly GuideStatusDefinition[] = [
  {
    label: "NOT APPLICABLE",
    tone: "default",
    simpleMeaning: "The normal Trade Plan rules do not apply right now, such as outside the supported session context.",
    action: "Wait for the eligible session or read the reason code.",
  },
  {
    label: "NO SETUP",
    tone: "default",
    simpleMeaning: "The current structure does not produce a qualifying directional setup.",
    action: "Do not force a trade. The engine will keep recalculating.",
  },
  {
    label: "WAITING FOR TRIGGER",
    tone: "wait",
    simpleMeaning: "The structure qualifies, but SPY has not crossed the required entry level yet.",
    action: "Wait. A touch is not necessarily the same as a satisfied trigger.",
  },
  {
    label: "NOT QUALIFIED",
    tone: "wait",
    simpleMeaning: "A direction and trigger may exist, but the structural risk/reward or another downstream rule failed.",
    action: "Read the risk reason. Do not treat it as a READY plan.",
  },
  {
    label: "NO QUALIFIED CONTRACT",
    tone: "wait",
    simpleMeaning: "The underlying setup qualifies, but none of the three bounded same-day candidates passed every execution, premium, planned-risk, and option-economics rule.",
    action: "Read the per-candidate rejection reasons. Wait for conditions to improve; do not reach to a farther strike or override blindly.",
  },
  {
    label: "READY",
    tone: "bull",
    simpleMeaning: "All required structural, trigger, risk/reward, and contract gates passed.",
    action: "Open the full Trade Plan, revalidate live values, and make your own decision.",
  },
] as const;

export const GUIDE_SOURCE_STATES: readonly GuideStatusDefinition[] = [
  {
    label: "LIVE / AVAILABLE / COMPLETE",
    tone: "bull",
    simpleMeaning: "The data or calculation is current enough and usable for its intended purpose.",
    action: "No source-quality action is required.",
  },
  {
    label: "PARTIAL",
    tone: "wait",
    simpleMeaning: "Some usable data exists, but expected coverage or an input is incomplete.",
    action: "Read the component details. Required partial inputs can block a Trade Plan.",
  },
  {
    label: "STALE",
    tone: "wait",
    simpleMeaning: "The last good value is being retained, but it is older than the live freshness limit.",
    action: "Wait for refresh or check Schwab/network status before relying on it.",
  },
  {
    label: "UNAVAILABLE",
    tone: "bear",
    simpleMeaning: "The dashboard cannot produce the value from the current inputs.",
    action: "Check System Readiness, Settings, and the displayed reason code.",
  },
  {
    label: "MOCK",
    tone: "bear",
    simpleMeaning: "The value is sample data, not a live Schwab-derived value.",
    action: "Do not treat it as live market information.",
  },
  {
    label: "DEGRADED",
    tone: "wait",
    simpleMeaning: "The overall product is operating, but at least one source or check is not fully healthy.",
    action: "Find the degraded component and decide whether it affects the task you are using.",
  },
] as const;

export const GUIDE_ALERT_CHECKLIST = [
  "The backend terminal and PostgreSQL are running.",
  "System Readiness shows the V1.9.1 trading tables and Workspace monitor are available.",
  "Schwab is connected and the required source products are usable.",
  "Discord is configured when you want notifications.",
  "Persistent backend automation and Trade Plan Alerts are enabled in Settings.",
  "A new live setup episode survives consolidation, conflict, policy, event, time, structural risk, and the bounded CONTRACT_V3 candidate checks.",
  "The READY alert is still active inside its 60-second window.",
  "Discord receives actionable-only READY and position-management events; expiration, revocation, and Target 3 research records remain in the audit trail without notification noise.",
] as const;

export const GUIDE_SHARING_CHECKLIST = [
  {
    title: "Share the dashboard explanation, not your secrets",
    detail:
      "Never send apps/server/.env, OAuth tokens, refresh tokens, client secrets, account hashes, database dumps, or the Discord webhook URL.",
  },
  {
    title: "Do not expose the current local app directly to the public internet",
    detail:
      "The release is a local, single-user tool. A true public deployment needs authentication, authorization, hosted secret management, database isolation, HTTPS, monitoring, and abuse protection.",
  },
  {
    title: "Explain the decision-support boundary",
    detail:
      "Make it clear that the dashboard does not provide guaranteed outcomes, investment advice, or automatic order execution.",
  },
  {
    title: "Explain the data limitations",
    detail:
      "GEX/DEX are analytical proxies, option open interest may be stale intraday, and Historical Replay only replays snapshots that were actually captured.",
  },
  {
    title: "Use a sanitized repository archive for technical sharing",
    detail:
      "A sanitized archive excludes .env files, Git metadata, dependencies, build output, logs, databases, and other local artifacts.",
  },
] as const;

export const GUIDE_GLOSSARY: readonly GuideGlossaryDefinition[] = [
  {
    term: "0DTE",
    meaning: "An option that expires at the end of the current trading day.",
    searchTerms: ["zero days", "expiration"],
  },
  {
    term: "SPY",
    meaning: "The ETF tracked by this dashboard. The current release is SPY-only.",
    searchTerms: ["symbol", "etf"],
  },
  {
    term: "VWAP",
    meaning: "Volume-weighted average price for the regular session. The dashboard uses it as an important structure and trigger reference.",
    searchTerms: ["average price", "volume"],
  },
  {
    term: "Premarket range",
    meaning: "The high and low calculated from the provider-aligned 7:00–9:30 AM ET window.",
    searchTerms: ["7am", "high low", "session"],
  },
  {
    term: "Opening range",
    meaning: "The high and low formed during the first 5, 15, or 30 minutes after the regular session opens.",
    searchTerms: ["or5", "or15", "or30"],
  },
  {
    term: "Pivot",
    meaning: "A price reference calculated from a completed prior session or week. The dashboard uses Traditional daily and weekly pivots.",
    searchTerms: ["support", "resistance", "daily", "weekly"],
  },
  {
    term: "Expected move",
    meaning: "An option-implied estimate of the day’s possible price range, based on the current-date ATM straddle reference.",
    searchTerms: ["implied move", "straddle", "range"],
  },
  {
    term: "GEX",
    meaning: "A returned-option-window Gamma Exposure proxy used as zero-weight context and research evidence, not as observed dealer inventory.",
    searchTerms: ["gamma exposure"],
  },
  {
    term: "DEX",
    meaning: "A returned-option-window Delta Exposure proxy used as zero-weight context and research evidence, not as observed dealer inventory.",
    searchTerms: ["delta exposure"],
  },
  {
    term: "Call Wall / Put Wall",
    meaning: "Ranked strike-level exposure proxies that may behave like important option-structure reference areas.",
    searchTerms: ["wall", "strike"],
  },
  {
    term: "Gamma balance",
    meaning: "The dashboard’s cumulative returned-window Net GEX zero-crossing proxy. It is not claimed to be a true observed dealer Gamma Flip.",
    searchTerms: ["gamma flip", "zero crossing"],
  },
  {
    term: "Structural confidence",
    meaning: "A score describing how strongly the price-structure evidence aligns. It is not a predicted probability of winning.",
    searchTerms: ["score", "probability"],
  },
  {
    term: "Adjusted confidence",
    meaning: "The current execution-quality alignment score. Under EXPOSURE_CONFIRMATION_V2, GEX/DEX add or subtract zero direct points; this score is not a win probability.",
    searchTerms: ["exposure confirmation", "supportive", "conflicting"],
  },
  {
    term: "Trigger",
    meaning: "The SPY price condition that must be satisfied before a structural setup becomes entry-ready.",
    searchTerms: ["entry"],
  },
  {
    term: "Structural invalidation",
    meaning: "A SPY price level that would invalidate the logic of the plan. It is not automatically an option-premium stop order.",
    searchTerms: ["stop", "risk"],
  },
  {
    term: "Primary objective",
    meaning: "The first structural SPY price target used to measure potential reward.",
    searchTerms: ["target", "reward"],
  },
  {
    term: "Reward-to-risk",
    meaning: "Potential reward divided by planned risk. V1.9.1 requires at least 1.5:1 for both the underlying structure and option-premium scenario; 2.0:1 or better is preferred.",
    searchTerms: ["rr", "1.5:1", "2:1", "preferred"],
  },
  {
    term: "Midpoint",
    meaning: "The price halfway between an option’s bid and ask. It is a reference, not a guaranteed fill price.",
    searchTerms: ["bid ask", "fill"],
  },
  {
    term: "Candidate key",
    meaning: "A stable identifier used to prevent the same alert or automatic Journal snapshot from being created repeatedly.",
    searchTerms: ["dedupe", "duplicate"],
  },
  {
    term: "Captured replay",
    meaning: "A replay made from Journal snapshots that were actually saved, rather than reconstructed raw historical market data.",
    searchTerms: ["historical", "backtest"],
  },
  {
    term: "TRADING_POLICY_V1",
    meaning:
      "The versioned authority for account size, premium and loss limits, trade/attempt limits, entry and exit times, contract preference, reward-to-risk, alert lifetime, and manual-confirmation rules.",
    searchTerms: ["policy", "risk limits", "1000", "150", "50"],
  },
  {
    term: "Risk ledger",
    meaning:
      "The market-date accounting of realized losses, open planned risk, trades, consecutive losses, open positions, and attempts used to decide whether a new entry remains allowed.",
    searchTerms: ["daily loss", "committed risk", "trade count"],
  },
  {
    term: "Setup episode",
    meaning:
      "A stable setup/direction/level occurrence. Routine recalculation or a restart does not create a new episode; a meaningful invalidation and reset is required before re-entry can receive a new identity.",
    searchTerms: ["attempt", "re-entry", "identity"],
  },
  {
    term: "Shadow mode",
    meaning:
      "Research-only setup detection. A shadow setup can be measured and displayed but cannot create a live opportunity, READY alert, position, or actionable Discord event.",
    searchTerms: ["setup registry", "research", "promotion"],
  },
  {
    term: "Effective ATM",
    meaning:
      "The returned strike nearest the current SPY price, with the lower strike used on an exact distance tie. It anchors the bounded CONTRACT_V3 candidate window.",
    searchTerms: ["atm", "strike", "contract window"],
  },
  {
    term: "Bounded contract window",
    meaning:
      "At most three same-day contracts on the required side: effective ATM plus the immediately adjacent returned strike below and above. The selector never searches a fourth or farther strike to force a trade.",
    searchTerms: ["contract v3", "adjacent strike", "three strikes"],
  },
  {
    term: "Planned structural loss",
    meaning:
      "The conservative estimated option loss if SPY reaches the selected structural invalidation. This—not the full debit—is used for risk capacity, and it must be no more than $50 per trade.",
    searchTerms: ["planned risk", "structural stop", "50"],
  },
  {
    term: "Full-premium exposure",
    meaning:
      "The option debit paid, up to $150. It is the catastrophic maximum-loss and capital-exposure reference, but it is kept separate from the normal planned structural loss used for sizing.",
    searchTerms: ["debit", "catastrophic loss", "150"],
  },
  {
    term: "Premium-loss backstop",
    meaning:
      "A manual exit prompt when the executable option bid implies a $50 loss from the actual entry price. It complements—rather than replaces—the primary SPY structural invalidation and never submits an order automatically.",
    searchTerms: ["bid stop", "50 loss", "hard backstop"],
  },
  {
    term: "READY alert",
    meaning:
      "A persistent 60-second manual-confirmation window created only after the current live opportunity and all policy gates pass. It can expire or be revoked and does not create an order.",
    searchTerms: ["ttl", "60 seconds", "confirm entry"],
  },
  {
    term: "Target 1 / Target 2 / Target 3",
    meaning:
      "Target 1 is a management level, Target 2 is the locked primary exit for the one-contract live policy, and Target 3 is a research extension objective only.",
    searchTerms: ["primary exit", "management", "research target"],
  },
  {
    term: "Time-stop review",
    meaning:
      "A review after 3 completed five-minute candles or 15 minutes. It does not automatically close the paper-equivalent position or submit an order.",
    searchTerms: ["15 minutes", "3 candles", "exit review"],
  },
] as const;
