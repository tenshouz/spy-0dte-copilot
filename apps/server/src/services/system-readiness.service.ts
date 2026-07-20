import type {
  BackendAutomationSettingsResponse,
  BackendAutomationStatusResponse,
  DiscordWebhookStatusResponse,
  SchwabConnectionStatus,
  SpyCandleResponse,
  SpyQuote,
  SpyZeroDteOptionsChainResponse,
  SpyZeroDteTradePlanAssemblyResponse,
  SystemDataProbeResponse,
  SystemReadinessResponse,
} from "@spy-copilot/shared";
import { getSchwabConfig, hasDatabaseUrl, type SchwabConfig } from "../config/env";
import { isDatabaseReachable } from "../lib/db-status";
import {
  getBackendAutomationSettings,
  getBackendAutomationStatus,
} from "./backend-automation.service";
import { getDiscordWebhookStatus } from "./discord-webhook.service";
import { getSpyCandles } from "./schwab-candles.service";
import { getSpyQuote } from "./schwab-market-data.service";
import { getSpyZeroDteOptionsChain } from "./schwab-options-chain.service";
import { getConnectionStatus } from "./schwab-auth.service";
import { getSpyZeroDteTradePlanAssembly } from "./trade-plan-assembly.service";
import {
  buildSystemDataProbeResponse,
  buildSystemReadinessResponse,
} from "./system-readiness.logic";

export interface SystemReadinessDependencies {
  databaseConfigured: () => boolean;
  databaseReachable: () => Promise<boolean>;
  schwabConfig: () => SchwabConfig;
  schwabConnection: () => Promise<SchwabConnectionStatus>;
  discordStatus: () => DiscordWebhookStatusResponse;
  automationSettings: () => Promise<BackendAutomationSettingsResponse>;
  automationStatus: () => Promise<BackendAutomationStatusResponse>;
  now: () => Date;
  uptimeSeconds: () => number;
  nodeVersion: () => string;
  environment: () => string | undefined;
}

const defaultReadinessDependencies: SystemReadinessDependencies = {
  databaseConfigured: () => hasDatabaseUrl,
  databaseReachable: isDatabaseReachable,
  schwabConfig: getSchwabConfig,
  schwabConnection: getConnectionStatus,
  discordStatus: getDiscordWebhookStatus,
  automationSettings: getBackendAutomationSettings,
  automationStatus: getBackendAutomationStatus,
  now: () => new Date(),
  uptimeSeconds: process.uptime,
  nodeVersion: () => process.version,
  environment: () => process.env.NODE_ENV,
};

function normalizedEnvironment(
  value: string | undefined,
): "development" | "production" | "test" | "unknown" {
  if (value === "development" || value === "production" || value === "test") {
    return value;
  }
  return "unknown";
}

export async function getSystemReadinessWithDependencies(
  dependencies: SystemReadinessDependencies,
): Promise<SystemReadinessResponse> {
  const databaseConfigured = dependencies.databaseConfigured();
  const databaseReachable = databaseConfigured
    ? await dependencies.databaseReachable()
    : false;
  const schwabConfig = dependencies.schwabConfig();

  let schwabConnection: SchwabConnectionStatus;
  let automationSettings: BackendAutomationSettingsResponse | null = null;
  let automationStatus: BackendAutomationStatusResponse | null = null;

  if (databaseReachable) {
    try {
      schwabConnection = await dependencies.schwabConnection();
    } catch {
      schwabConnection = {
        state: "database_not_configured",
        expiresAt: null,
        detail: null,
      };
    }
    try {
      [automationSettings, automationStatus] = await Promise.all([
        dependencies.automationSettings(),
        dependencies.automationStatus(),
      ]);
    } catch {
      automationSettings = null;
      automationStatus = null;
    }
  } else {
    schwabConnection = {
      state: "database_not_configured",
      expiresAt: null,
      detail: null,
    };
  }

  return buildSystemReadinessResponse({
    calculatedAt: dependencies.now(),
    uptimeSeconds: dependencies.uptimeSeconds(),
    nodeVersion: dependencies.nodeVersion(),
    environment: normalizedEnvironment(dependencies.environment()),
    databaseConfigured,
    databaseReachable,
    schwabConfig,
    schwabConnection,
    discordStatus: dependencies.discordStatus(),
    automationSettings,
    automationStatus,
  });
}

export function getSystemReadiness(): Promise<SystemReadinessResponse> {
  return getSystemReadinessWithDependencies(defaultReadinessDependencies);
}

export interface SystemDataProbeDependencies {
  getQuote: () => Promise<SpyQuote>;
  getCandles: () => Promise<SpyCandleResponse>;
  getOptionsChain: () => Promise<SpyZeroDteOptionsChainResponse>;
  getAssembly: () => Promise<SpyZeroDteTradePlanAssemblyResponse>;
  now: () => Date;
}

const defaultProbeDependencies: SystemDataProbeDependencies = {
  getQuote: getSpyQuote,
  getCandles: getSpyCandles,
  getOptionsChain: getSpyZeroDteOptionsChain,
  getAssembly: getSpyZeroDteTradePlanAssembly,
  now: () => new Date(),
};

export async function runSystemDataProbeWithDependencies(
  dependencies: SystemDataProbeDependencies,
): Promise<SystemDataProbeResponse> {
  // Run sequentially so token refresh, provider backoff, and existing service
  // caches coordinate instead of creating an avoidable startup request burst.
  const quote = await dependencies.getQuote();
  const candles = await dependencies.getCandles();
  const optionsChain = await dependencies.getOptionsChain();
  const assembly = await dependencies.getAssembly();
  return buildSystemDataProbeResponse({
    calculatedAt: dependencies.now(),
    quote,
    candles,
    optionsChain,
    assembly,
  });
}

export function runSystemDataProbe(): Promise<SystemDataProbeResponse> {
  return runSystemDataProbeWithDependencies(defaultProbeDependencies);
}
