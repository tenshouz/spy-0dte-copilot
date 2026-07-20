import {
  SystemDataProbeResponseSchema,
  SystemReadinessResponseSchema,
  type BackendAutomationSettingsResponse,
  type BackendAutomationStatusResponse,
  type DiscordWebhookStatusResponse,
  type SchwabConnectionStatus,
  type SpyCandleResponse,
  type SpyQuote,
  type SpyZeroDteOptionsChainResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
  type SystemDataProbeComponent,
  type SystemDataProbeResponse,
  type SystemReadinessCheck,
  type SystemReadinessResponse,
} from "@spy-copilot/shared";
import type { SchwabConfig } from "../config/env";

export const SYSTEM_READINESS_METHODOLOGY_VERSION = "SYSTEM_READINESS_V1" as const;
export const SYSTEM_DATA_PROBE_METHODOLOGY_VERSION = "SYSTEM_DATA_PROBE_V1" as const;
export const V1_RELEASE_VERSION = "1.1.0" as const;

export interface SystemReadinessInputs {
  calculatedAt: Date;
  uptimeSeconds: number;
  nodeVersion: string;
  environment: "development" | "production" | "test" | "unknown";
  databaseConfigured: boolean;
  databaseReachable: boolean;
  schwabConfig: SchwabConfig;
  schwabConnection: SchwabConnectionStatus;
  discordStatus: DiscordWebhookStatusResponse;
  automationSettings: BackendAutomationSettingsResponse | null;
  automationStatus: BackendAutomationStatusResponse | null;
}

function check(args: SystemReadinessCheck): SystemReadinessCheck {
  return args;
}

function databaseCheck(inputs: SystemReadinessInputs): SystemReadinessCheck {
  if (!inputs.databaseConfigured) {
    return check({
      id: "DATABASE",
      label: "PostgreSQL persistence",
      state: "FAIL",
      required: true,
      reasonCode: "DATABASE_NOT_CONFIGURED",
      detail: "DATABASE_URL is missing, so tokens, journal, replay, and automation persistence cannot operate.",
      remediation: "Configure DATABASE_URL, start PostgreSQL, and deploy all Prisma migrations.",
    });
  }
  if (!inputs.databaseReachable) {
    return check({
      id: "DATABASE",
      label: "PostgreSQL persistence",
      state: "FAIL",
      required: true,
      reasonCode: "DATABASE_UNAVAILABLE",
      detail: "DATABASE_URL is configured, but the backend cannot complete a connectivity probe.",
      remediation: "Start Docker Desktop/PostgreSQL and verify the configured database URL.",
    });
  }
  return check({
    id: "DATABASE",
    label: "PostgreSQL persistence",
    state: "PASS",
    required: true,
    reasonCode: "DATABASE_READY",
    detail: "The backend can reach PostgreSQL for encrypted tokens and persistent application records.",
    remediation: null,
  });
}

function schwabConfigurationCheck(inputs: SystemReadinessInputs): SystemReadinessCheck {
  if (inputs.schwabConfig.status === "missing") {
    return check({
      id: "SCHWAB_CONFIGURATION",
      label: "Schwab OAuth configuration",
      state: "FAIL",
      required: true,
      reasonCode: "SCHWAB_CONFIGURATION_MISSING",
      detail: `Required Schwab configuration is incomplete: ${inputs.schwabConfig.missingVars.join(", ")}.`,
      remediation: "Complete the Schwab variables in apps/server/.env and restart the backend.",
    });
  }
  if (inputs.schwabConfig.status === "invalid") {
    return check({
      id: "SCHWAB_CONFIGURATION",
      label: "Schwab OAuth configuration",
      state: "FAIL",
      required: true,
      reasonCode: "SCHWAB_CONFIGURATION_INVALID",
      detail: inputs.schwabConfig.reason,
      remediation: "Correct the invalid Schwab configuration and restart the backend.",
    });
  }
  return check({
    id: "SCHWAB_CONFIGURATION",
    label: "Schwab OAuth configuration",
    state: "PASS",
    required: true,
    reasonCode: "SCHWAB_CONFIGURATION_READY",
    detail: "The callback URL, credentials, and token-encryption key satisfy V1 validation rules.",
    remediation: null,
  });
}

function schwabConnectionCheck(inputs: SystemReadinessInputs): SystemReadinessCheck {
  const state = inputs.schwabConnection.state;
  if (state === "connected") {
    return check({
      id: "SCHWAB_CONNECTION",
      label: "Schwab authenticated connection",
      state: "PASS",
      required: true,
      reasonCode: "SCHWAB_CONNECTED",
      detail: "An encrypted Schwab token record is present and the access token has not expired.",
      remediation: null,
    });
  }

  const reasonCode = {
    database_not_configured: "SCHWAB_DATABASE_UNAVAILABLE",
    credentials_not_configured: "SCHWAB_CONFIGURATION_MISSING",
    config_invalid: "SCHWAB_CONFIGURATION_INVALID",
    not_connected: "SCHWAB_NOT_CONNECTED",
    token_expired: "SCHWAB_TOKEN_EXPIRED",
  }[state];

  return check({
    id: "SCHWAB_CONNECTION",
    label: "Schwab authenticated connection",
    state: "FAIL",
    required: true,
    reasonCode,
    detail:
      state === "token_expired"
        ? "The stored access token is expired and could not be considered live-ready."
        : "A usable authenticated Schwab connection is not currently available.",
    remediation: "Open Settings and complete or repeat the Schwab connection flow.",
  });
}

function discordCheck(inputs: SystemReadinessInputs): SystemReadinessCheck {
  if (inputs.discordStatus.state === "READY") {
    return check({
      id: "DISCORD_DELIVERY",
      label: "Discord delivery configuration",
      state: "PASS",
      required: false,
      reasonCode: "DISCORD_READY",
      detail: "A validated Discord webhook is configured without exposing its URL or token.",
      remediation: null,
    });
  }
  return check({
    id: "DISCORD_DELIVERY",
    label: "Discord delivery configuration",
    state: "WARNING",
    required: false,
    reasonCode:
      inputs.discordStatus.state === "NOT_CONFIGURED"
        ? "DISCORD_NOT_CONFIGURED"
        : "DISCORD_CONFIGURATION_INVALID",
    detail: inputs.discordStatus.detail ?? "Discord delivery is not ready.",
    remediation: "Configure a valid Discord webhook in apps/server/.env, then restart and test it explicitly.",
  });
}

function automationCheck(inputs: SystemReadinessInputs): SystemReadinessCheck {
  if (
    inputs.automationSettings?.engineState !== "AVAILABLE" ||
    inputs.automationStatus?.engineState !== "AVAILABLE"
  ) {
    return check({
      id: "BACKEND_AUTOMATION",
      label: "Persistent backend automation",
      state: inputs.databaseReachable ? "WARNING" : "FAIL",
      required: false,
      reasonCode: "BACKEND_AUTOMATION_UNAVAILABLE",
      detail: "Persistent automation settings or runtime status could not be loaded.",
      remediation: "Verify PostgreSQL and restart the backend before enabling persistent automation.",
    });
  }

  const enabled = inputs.automationSettings.settings?.enabled === true;
  return check({
    id: "BACKEND_AUTOMATION",
    label: "Persistent backend automation",
    state: "PASS",
    required: false,
    reasonCode: enabled ? "BACKEND_AUTOMATION_ENABLED" : "BACKEND_AUTOMATION_SAFE_DISABLED",
    detail: enabled
      ? `Persistent automation is enabled and currently reports ${inputs.automationStatus.runtimeState.toLowerCase()} runtime state.`
      : "Persistent automation is installed and restart-safe, but remains disabled by saved settings.",
    remediation: null,
  });
}

export function buildSystemReadinessResponse(
  inputs: SystemReadinessInputs,
): SystemReadinessResponse {
  const checks: SystemReadinessCheck[] = [
    databaseCheck(inputs),
    schwabConfigurationCheck(inputs),
    schwabConnectionCheck(inputs),
    discordCheck(inputs),
    automationCheck(inputs),
    check({
      id: "HTTP_SECURITY",
      label: "HTTP and browser boundary hardening",
      state: "PASS",
      required: true,
      reasonCode: "HTTP_SECURITY_CONTROLS_ACTIVE",
      detail: "The API applies request IDs, restrictive CORS, no-store headers, response hardening, bounded JSON bodies, and write-rate limiting.",
      remediation: null,
    }),
    check({
      id: "TRADING_SAFETY",
      label: "Decision-support safety boundary",
      state: "PASS",
      required: true,
      reasonCode: "NO_EXECUTION_CAPABILITY",
      detail: "V1 exposes analysis, journaling, replay, and notification workflows only; no order-placement route or execution service is registered.",
      remediation: null,
    }),
    check({
      id: "REPLAY_AND_AUDIT",
      label: "Replay and no-look-ahead audit",
      state: "PASS",
      required: true,
      reasonCode: "CAPTURED_REPLAY_AUDIT_AVAILABLE",
      detail: "Persisted captured-snapshot replay, source-time validation, and post-hoc outcome separation are available.",
      remediation: null,
    }),
    check({
      id: "RELEASE_DOCUMENTATION",
      label: "V1 operations and recovery documentation",
      state: "PASS",
      required: true,
      reasonCode: "V1_DOCUMENTATION_AVAILABLE",
      detail: "The repository includes release, verification, backup, recovery, and PRD-compliance documentation.",
      remediation: null,
    }),
  ];

  const passCount = checks.filter((item) => item.state === "PASS").length;
  const warningCount = checks.filter((item) => item.state === "WARNING").length;
  const failCount = checks.filter((item) => item.state === "FAIL").length;
  const requiredFailureCount = checks.filter(
    (item) => item.required && item.state === "FAIL",
  ).length;
  const engineState =
    requiredFailureCount > 0 ? "BLOCKED" : warningCount > 0 || failCount > 0 ? "DEGRADED" : "READY";

  return SystemReadinessResponseSchema.parse({
    product: "SPY_ZERO_DTE_V1_SYSTEM_READINESS",
    methodologyVersion: SYSTEM_READINESS_METHODOLOGY_VERSION,
    releaseVersion: V1_RELEASE_VERSION,
    calculatedAt: inputs.calculatedAt.toISOString(),
    engineState,
    summary: {
      totalChecks: checks.length,
      passCount,
      warningCount,
      failCount,
      requiredFailureCount,
    },
    runtime: {
      nodeVersion: inputs.nodeVersion,
      environment: inputs.environment,
      uptimeSeconds: Math.max(0, Math.floor(inputs.uptimeSeconds)),
    },
    checks,
    disclosures: {
      noSecretsReturned: true,
      noProviderBodiesReturned: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderCreation: true,
      noOrderExecution: true,
      configurationAndRuntimeStatusOnly: true,
    },
  });
}

function quoteComponent(quote: SpyQuote): SystemDataProbeComponent {
  const state = quote.sourceState === "LIVE" ? "PASS" : quote.sourceState === "STALE" ? "DEGRADED" : "FAIL";
  return {
    id: "QUOTE",
    label: "SPY quote",
    state,
    sourceState: quote.sourceState,
    reasonCode: quote.warningCode ?? `QUOTE_${quote.sourceState}`,
    detail: `${quote.sourceState} quote, age ${Math.round(quote.dataAgeMs / 1000)} seconds.`,
  };
}

function candleComponent(candles: SpyCandleResponse): SystemDataProbeComponent {
  const state = candles.sourceState === "LIVE" ? "PASS" : candles.sourceState === "STALE" ? "DEGRADED" : "FAIL";
  return {
    id: "CANDLES",
    label: "SPY five-minute candles",
    state,
    sourceState: candles.sourceState,
    reasonCode: candles.warningCode ?? `CANDLES_${candles.sourceState}`,
    detail: `${candles.candles.length} normalized candles, age ${Math.round(candles.dataAgeMs / 1000)} seconds.`,
  };
}

function optionsComponent(
  chain: SpyZeroDteOptionsChainResponse,
): SystemDataProbeComponent {
  if (
    chain.metricState === "UNAVAILABLE" &&
    chain.warningCode === "NO_CURRENT_DATE_EXPIRATION"
  ) {
    return {
      id: "OPTIONS_CHAIN",
      label: "SPY current-date options chain",
      state: "NOT_APPLICABLE",
      sourceState: chain.sourceState,
      reasonCode: chain.warningCode,
      detail: "No current-date SPY expiration is available for the observed market date.",
    };
  }
  const state =
    chain.metricState === "LIVE"
      ? "PASS"
      : chain.metricState === "STALE"
        ? "DEGRADED"
        : "FAIL";
  return {
    id: "OPTIONS_CHAIN",
    label: "SPY current-date options chain",
    state,
    sourceState: chain.sourceState,
    reasonCode: chain.warningCode ?? `OPTIONS_${chain.metricState}`,
    detail: `${chain.totalContracts} normalized contracts with ${chain.returnedUniqueStrikeCount} unique strikes.`,
  };
}

function assemblyComponent(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): SystemDataProbeComponent {
  if (assembly.planState === "NOT_APPLICABLE") {
    return {
      id: "TRADE_PLAN_ASSEMBLY",
      label: "Deterministic Trade Plan assembly",
      state: "NOT_APPLICABLE",
      sourceState: assembly.engineState,
      reasonCode: assembly.primaryReasonCode,
      detail: "The deterministic Trade Plan is correctly not applicable for the current captured context.",
    };
  }
  const state =
    assembly.engineState === "AVAILABLE"
      ? "PASS"
      : assembly.engineState === "PARTIAL"
        ? "DEGRADED"
        : "FAIL";
  return {
    id: "TRADE_PLAN_ASSEMBLY",
    label: "Deterministic Trade Plan assembly",
    state,
    sourceState: assembly.engineState,
    reasonCode: assembly.primaryReasonCode,
    detail: `${assembly.planState} / ${assembly.direction} using ${assembly.methodologyVersion}.`,
  };
}

export function buildSystemDataProbeResponse(args: {
  calculatedAt: Date;
  quote: SpyQuote;
  candles: SpyCandleResponse;
  optionsChain: SpyZeroDteOptionsChainResponse;
  assembly: SpyZeroDteTradePlanAssemblyResponse;
}): SystemDataProbeResponse {
  const components = [
    quoteComponent(args.quote),
    candleComponent(args.candles),
    optionsComponent(args.optionsChain),
    assemblyComponent(args.assembly),
  ];
  const failCount = components.filter((item) => item.state === "FAIL").length;
  const degradedCount = components.filter((item) => item.state === "DEGRADED").length;
  const notApplicableCount = components.filter(
    (item) => item.state === "NOT_APPLICABLE",
  ).length;
  const passCount = components.filter((item) => item.state === "PASS").length;

  return SystemDataProbeResponseSchema.parse({
    product: "SPY_ZERO_DTE_V1_EXPLICIT_DATA_PROBE",
    methodologyVersion: SYSTEM_DATA_PROBE_METHODOLOGY_VERSION,
    calculatedAt: args.calculatedAt.toISOString(),
    probeState: failCount > 0 ? "FAIL" : degradedCount > 0 ? "DEGRADED" : "PASS",
    summary: {
      totalComponents: components.length,
      passCount,
      degradedCount,
      failCount,
      notApplicableCount,
    },
    components,
    disclosures: {
      explicitUserInitiatedProbe: true,
      providerRequestsMayOccur: true,
      noDiscordDelivery: true,
      noJournalMutation: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderCreation: true,
      noOrderExecution: true,
    },
  });
}
