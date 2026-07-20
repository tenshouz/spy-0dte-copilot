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

export const GUIDE_SECTION_LINKS = [
  { id: "start-here", label: "Start here" },
  { id: "daily-workflow", label: "Daily workflow" },
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
      "Start PostgreSQL, the backend, and the frontend. The backend must remain online for live data and automatic Discord alerts.",
  },
  {
    title: "Check System Readiness",
    detail:
      "Open System Readiness first. READY is ideal. DEGRADED can still be usable, but read the failed or warning checks before trusting the output.",
  },
  {
    title: "Confirm the connections",
    detail:
      "In Settings, confirm Schwab is connected, Discord is connected, and persistent backend automation is active when you want automatic alerts.",
  },
  {
    title: "Use Dashboard for the big picture",
    detail:
      "Watch price, VWAP, important levels, opening ranges, exposure structure, bias, and the current Trade Plan state in one place.",
  },
  {
    title: "Open Trade Plan for the decision details",
    detail:
      "A READY plan contains the direction, trigger, invalidation, objective, reward-to-risk, selected contract, and adjusted confidence.",
  },
  {
    title: "Record what happened",
    detail:
      "Use the Trade Journal to save or automatically capture snapshots, then enter the outcome later so analytics remain based on your real results.",
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
      "Soft confirmation used to adjust Trade Plan confidence",
    ],
    remember:
      "These are returned-chain-window analytical proxies, not direct knowledge of dealer inventory. They cannot create a trade direction or block eligibility.",
    searchTerms: ["gamma", "delta", "walls", "cliffs", "dealer", "exposure", "confirmation"],
  },
  {
    href: "/trade-plan",
    title: "Trade Plan",
    shortTitle: "Trade Plan",
    purpose: "Turns the deterministic market structure into a conditional Calls or Puts plan when every required gate passes.",
    useWhen: "Use it before taking any independently entered trade.",
    features: [
      "Plan state, direction, and entry trigger",
      "Structural invalidation and primary objective",
      "Minimum 2:1 underlying reward-to-risk qualification",
      "Selected same-day option contract when the plan is READY",
      "Structural confidence plus the GEX/DEX soft-confirmation adjustment",
      "Explicit read-only sizing reference after you enter your own risk limits",
    ],
    remember:
      "READY means the dashboard found a qualifying plan for review. It does not place an order, guarantee a fill, or guarantee a profitable trade.",
    searchTerms: ["ready", "entry", "trigger", "stop", "target", "risk reward", "contract", "sizing"],
  },
  {
    href: "/alerts",
    title: "Alerts",
    shortTitle: "Alerts",
    purpose: "Shows Trade Plan alert candidates, transitions, and Discord delivery history.",
    useWhen: "Use it to understand why an alert did or did not send.",
    features: [
      "Current alert candidate and transition state",
      "Persistent deduplication so the same plan is not repeatedly sent",
      "Discord delivery and retry history",
      "Foreground monitor status when persistent backend automation is not being used",
    ],
    remember:
      "Automatic delivery is controlled in Settings. A browser page does not need to stay open when persistent backend automation is active.",
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
    href: "/system",
    title: "System Readiness",
    shortTitle: "System",
    purpose: "Checks whether the local V1 system is operational and safe to use.",
    useWhen: "Use it before the session and whenever data or alerts behave unexpectedly.",
    features: [
      "Database, Schwab, Discord, automation, security, replay, and documentation checks",
      "READY, DEGRADED, or BLOCKED overall state",
      "Simple remediation guidance for every warning or failure",
      "Explicit live-data probe with no Discord, Journal, sizing, or order side effects",
    ],
    remember:
      "A DEGRADED result is not automatically unusable. Read which check is degraded and decide whether it affects the feature you need.",
    searchTerms: ["health", "ready", "blocked", "probe", "database", "security", "connection"],
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
    title: "1. The session must be eligible",
    detail:
      "The system needs the correct market date, regular-hours context, and a completed 15-minute opening range before a normal intraday plan can qualify.",
  },
  {
    title: "2. Required data must be trustworthy",
    detail:
      "Quote, VWAP, session candles, opening range, and other required inputs must be current and sufficiently complete. A real required-input problem can stop the plan.",
  },
  {
    title: "3. A structural direction must exist",
    detail:
      "Price is compared with VWAP, the previous-day range, the provider-aligned 7:00–9:30 AM premarket range, and the 15-minute opening range. The evidence must support Calls or Puts without opposing evidence that invalidates the thesis.",
  },
  {
    title: "4. Price must satisfy the entry trigger",
    detail:
      "Calls require price above the bullish trigger structure. Puts require price below the bearish trigger structure. Before this happens, the plan can remain WAITING FOR TRIGGER.",
  },
  {
    title: "5. The structural trade must offer enough reward",
    detail:
      "The engine chooses a structural invalidation and objective. The underlying reward-to-risk must be at least 2:1 or the setup is NOT QUALIFIED.",
  },
  {
    title: "6. A usable same-day contract must exist",
    detail:
      "The selected option must have the correct direction and expiration, a valid bid and ask, an acceptable spread, and a fresh quote. Otherwise the state is NO QUALIFIED CONTRACT.",
  },
  {
    title: "7. GEX/DEX adjusts confidence only",
    detail:
      "Exposure can be SUPPORTIVE, CONFLICTING, MIXED, or NEUTRAL. It can raise or lower confidence, but it cannot create the direction or override the eligibility gates.",
  },
  {
    title: "8. READY means review—not automatic execution",
    detail:
      "READY displays the direction, trigger, invalidation, objective, reward-to-risk, contract, and confidence. You still recheck live values and independently decide whether to trade.",
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
    simpleMeaning: "The underlying setup qualifies, but no returned same-day option passed the contract-quality rules.",
    action: "Wait for quotes or spreads to improve; do not substitute a rejected contract blindly.",
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
  "The backend terminal is running.",
  "Schwab is connected and the required market products are available.",
  "The Discord webhook is connected.",
  "Persistent backend automation is enabled in Settings.",
  "Trade Plan Alerts is enabled.",
  "The scheduler runtime is Active and the heartbeat is recent.",
  "A new alert-eligible plan transition exists; duplicate plans are intentionally suppressed.",
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
    meaning: "The ETF tracked by this dashboard. The V1 release is SPY-only.",
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
    meaning: "A returned-option-window Gamma Exposure proxy used for context and confidence adjustment, not as observed dealer inventory.",
    searchTerms: ["gamma exposure"],
  },
  {
    term: "DEX",
    meaning: "A returned-option-window Delta Exposure proxy used for context and confidence adjustment, not as observed dealer inventory.",
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
    meaning: "Structural confidence after the fixed GEX/DEX soft-confirmation points are added or subtracted.",
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
    meaning: "Potential underlying reward divided by structural underlying risk. The Trade Plan currently requires at least 2:1.",
    searchTerms: ["rr", "2:1"],
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
] as const;
