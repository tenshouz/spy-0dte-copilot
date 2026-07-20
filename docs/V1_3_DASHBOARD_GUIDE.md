# V1.3.0 Dashboard Guide and First-Time User Onboarding

## Purpose

V1.3.0 adds a complete in-application **Dashboard Guide** at `/guide`. The page is written for someone who has never seen the project and does not assume knowledge of options terminology, the deterministic methodology, or the local development setup.

## Included explanations

The Guide contains:

- a one-sentence explanation of what the product does and does not do;
- a six-step daily workflow;
- plain-English descriptions of Dashboard, Market Data, Options Chain, GEX/DEX, Trade Plan, Alerts, Trade Journal, Historical Replay, System Readiness, Settings, and the Guide itself;
- the complete Trade Plan progression from session eligibility through `READY`;
- simple definitions of all Trade Plan states and source-quality states;
- an explanation of dashboard colors that distinguishes bearish evidence from application errors;
- the persistent Discord-alert checklist and expected scheduler behavior;
- the difference between Journal snapshots, user-entered outcomes, analytics, and captured-snapshot replay;
- a public-sharing and secret-safety checklist;
- a searchable glossary for the core market, options, exposure, risk, alert, and replay terms.

## Search behavior

The Guide search is entirely local to the browser. It filters the page cards and glossary using fixed static content. It makes no backend request, collects no search analytics, and exposes no configuration or user data.

## Methodology boundaries

The Guide documents the current release behavior without changing any calculation:

- provider-aligned premarket remains 07:00–09:30 ET;
- the minimum underlying reward-to-risk remains 2:1;
- GEX/DEX remains soft confirmation only;
- automatic Discord delivery remains backend-scheduler controlled;
- Journal outcomes remain explicit user input;
- replay remains captured-snapshot replay rather than raw-market reconstruction;
- no order creation or execution capability is added.

## Public deployment warning

The Guide explicitly states that the current application is local and single-user. The presence of onboarding documentation does not make the backend safe for direct public exposure. A public product still requires authentication, authorization, tenant isolation, hosted secret management, HTTPS, monitoring, rate limiting appropriate for untrusted users, and deployment-specific operational controls.
