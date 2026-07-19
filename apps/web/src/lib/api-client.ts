import {
  AlertSchema,
  CandleSchema,
  JournalEntrySchema,
  MarketSnapshotSchema,
  ReportSchema,
  SchwabConnectionStatusSchema,
  SchwabReadOnlyAccountRiskSnapshotResponseSchema,
  SpyCandleResponseSchema,
  SpyOpeningRangeResponseSchema,
  SpyZeroDteExpectedMoveResponseSchema,
  SpyZeroDteDexProxyResponseSchema,
  SpyZeroDteGexProxyResponseSchema,
  SpyZeroDteOptionsChainResponseSchema,
  SpyQuoteSchema,
  SpyRthGapResponseSchema,
  SpyRthVwapResponseSchema,
  SpySessionLevelsResponseSchema,
  SpyZeroDteMarketContextResponseSchema,
  SpyZeroDteDeterministicMarketStateResponseSchema,
  SpyZeroDteDeterministicBiasResponseSchema,
  SpyZeroDteDeterministicTradePlanResponseSchema,
  SpyZeroDteObjectiveRiskResponseSchema,
  SpyZeroDteContractSelectionResponseSchema,
  SpyZeroDteTradePlanAssemblyResponseSchema,
  SpyZeroDteTradePlanAlertCandidateResponseSchema,
  SpyZeroDtePositionSizingRequestSchema,
  SpyZeroDtePositionSizingResponseSchema,
  SpyZeroDteSchwabAssistedPositionSizingRequestSchema,
  SpyZeroDteSchwabAssistedPositionSizingResponseSchema,
  StrikeExposureSchema,
  type Alert,
  type Candle,
  type JournalEntry,
  type MarketSnapshot,
  type Report,
  type SchwabConnectionStatus,
  type SchwabReadOnlyAccountRiskSnapshotResponse,
  type SpyCandleResponse,
  type SpyOpeningRangeResponse,
  type SpyZeroDteExpectedMoveResponse,
  type SpyZeroDteDexProxyResponse,
  type SpyZeroDteGexProxyResponse,
  type SpyZeroDteOptionsChainResponse,
  type SpyQuote,
  type SpyRthGapResponse,
  type SpyRthVwapResponse,
  type SpySessionLevelsResponse,
  type SpyZeroDteMarketContextResponse,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteDeterministicBiasResponse,
  type SpyZeroDteDeterministicTradePlanResponse,
  type SpyZeroDteObjectiveRiskResponse,
  type SpyZeroDteContractSelectionResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
  type SpyZeroDteTradePlanAlertCandidateResponse,
  type SpyZeroDtePositionSizingRequest,
  type SpyZeroDtePositionSizingResponse,
  type SpyZeroDteSchwabAssistedPositionSizingRequest,
  type SpyZeroDteSchwabAssistedPositionSizingResponse,
  type StrikeExposure,
} from "@spy-copilot/shared";
import { z } from "zod";

/**
 * Thin fetch wrapper around the Express backend (apps/server). This is the
 * ONLY module in the frontend that knows the API base URL or fetch mechanics.
 * Every hook in src/hooks calls through here instead of importing mock data
 * directly. Responses are parsed against the shared Zod schemas so a shape
 * mismatch between frontend and backend fails loudly (as a query error)
 * rather than silently rendering wrong data.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return schema.parse(data);
}

async function getPrivateNoStoreJson<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return schema.parse(await res.json());
}

async function postJson<TRequest, TResponse>(
  path: string,
  body: TRequest,
  requestSchema: z.ZodType<TRequest>,
  responseSchema: z.ZodType<TResponse>,
): Promise<TResponse> {
  const validatedBody = requestSchema.parse(body);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(validatedBody),
  });
  if (!res.ok) {
    throw new Error(`API request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return responseSchema.parse(await res.json());
}

export const apiClient = {
  getSnapshot: (): Promise<MarketSnapshot> => getJson("/api/snapshot/latest", MarketSnapshotSchema),
  getStrikeExposures: (): Promise<StrikeExposure[]> =>
    getJson("/api/snapshot/strikes", z.array(StrikeExposureSchema)),
  getCandles: (): Promise<Candle[]> => getJson("/api/snapshot/candles", z.array(CandleSchema)),
  getLatestReport: (): Promise<Report> => getJson("/api/reports/latest", ReportSchema),
  getReportHistory: (): Promise<Report[]> => getJson("/api/reports", z.array(ReportSchema)),
  getJournalEntries: (): Promise<JournalEntry[]> => getJson("/api/journal", z.array(JournalEntrySchema)),
  getAlerts: (): Promise<Alert[]> => getJson("/api/alerts", z.array(AlertSchema)),
  getSchwabStatus: (): Promise<SchwabConnectionStatus> =>
    getJson("/api/auth/schwab/status", SchwabConnectionStatusSchema),
  getSchwabReadOnlyAccountRiskSnapshot: (): Promise<SchwabReadOnlyAccountRiskSnapshotResponse> =>
    getPrivateNoStoreJson(
      "/api/account-risk/schwab",
      SchwabReadOnlyAccountRiskSnapshotResponseSchema,
    ),
  getSpyOpeningRange: (): Promise<SpyOpeningRangeResponse> =>
    getJson("/api/opening-range/spy", SpyOpeningRangeResponseSchema),
  getSpyZeroDteOptionsChain: (): Promise<SpyZeroDteOptionsChainResponse> =>
    getJson("/api/options-chain/spy", SpyZeroDteOptionsChainResponseSchema),
  getSpyZeroDteExpectedMove: (): Promise<SpyZeroDteExpectedMoveResponse> =>
    getJson("/api/expected-move/spy", SpyZeroDteExpectedMoveResponseSchema),
  getSpyZeroDteGexProxy: (): Promise<SpyZeroDteGexProxyResponse> =>
    getJson("/api/gex/spy", SpyZeroDteGexProxyResponseSchema),
  getSpyZeroDteDexProxy: (): Promise<SpyZeroDteDexProxyResponse> =>
    getJson("/api/dex/spy", SpyZeroDteDexProxyResponseSchema),
  getSpyQuote: (): Promise<SpyQuote> => getJson("/api/quote/spy", SpyQuoteSchema),
  getSpyCandles: (): Promise<SpyCandleResponse> => getJson("/api/candles/spy", SpyCandleResponseSchema),
  getSpyRthGap: (): Promise<SpyRthGapResponse> =>
    getJson("/api/gap/spy", SpyRthGapResponseSchema),
  getSpyRthVwap: (): Promise<SpyRthVwapResponse> =>
    getJson("/api/vwap/spy", SpyRthVwapResponseSchema),
  getSpySessionLevels: (): Promise<SpySessionLevelsResponse> =>
    getJson("/api/session-levels/spy", SpySessionLevelsResponseSchema),
  getSpyZeroDteMarketContext: (): Promise<SpyZeroDteMarketContextResponse> =>
    getJson("/api/market-context/spy", SpyZeroDteMarketContextResponseSchema),
  getSpyZeroDteDeterministicMarketState: (): Promise<SpyZeroDteDeterministicMarketStateResponse> =>
    getJson("/api/market-state/spy", SpyZeroDteDeterministicMarketStateResponseSchema),
  getSpyZeroDteDeterministicBias: (): Promise<SpyZeroDteDeterministicBiasResponse> =>
    getJson("/api/market-bias/spy", SpyZeroDteDeterministicBiasResponseSchema),
  getSpyZeroDteDeterministicTradePlan: (): Promise<SpyZeroDteDeterministicTradePlanResponse> =>
    getJson("/api/trade-plan/spy", SpyZeroDteDeterministicTradePlanResponseSchema),
  getSpyZeroDteObjectiveRiskFramework: (): Promise<SpyZeroDteObjectiveRiskResponse> =>
    getJson("/api/trade-risk/spy", SpyZeroDteObjectiveRiskResponseSchema),
  getSpyZeroDteContractSelection: (): Promise<SpyZeroDteContractSelectionResponse> =>
    getJson("/api/trade-contract/spy", SpyZeroDteContractSelectionResponseSchema),
  getSpyZeroDteTradePlanAssembly: (): Promise<SpyZeroDteTradePlanAssemblyResponse> =>
    getJson("/api/trade-plan-assembly/spy", SpyZeroDteTradePlanAssemblyResponseSchema),
  getSpyZeroDteTradePlanAlertCandidate: (): Promise<SpyZeroDteTradePlanAlertCandidateResponse> =>
    getJson(
      "/api/trade-plan-alert/spy",
      SpyZeroDteTradePlanAlertCandidateResponseSchema,
    ),
  calculateSpyZeroDtePositionSizing: (
    request: SpyZeroDtePositionSizingRequest,
  ): Promise<SpyZeroDtePositionSizingResponse> =>
    postJson(
      "/api/trade-sizing/spy",
      request,
      SpyZeroDtePositionSizingRequestSchema,
      SpyZeroDtePositionSizingResponseSchema,
    ),
  calculateSpyZeroDteSchwabAssistedPositionSizing: (
    request: SpyZeroDteSchwabAssistedPositionSizingRequest,
  ): Promise<SpyZeroDteSchwabAssistedPositionSizingResponse> =>
    postJson(
      "/api/trade-sizing/spy/schwab",
      request,
      SpyZeroDteSchwabAssistedPositionSizingRequestSchema,
      SpyZeroDteSchwabAssistedPositionSizingResponseSchema,
    ),
};

export const schwabLoginUrl = `${API_BASE_URL}/api/auth/schwab/login`;
