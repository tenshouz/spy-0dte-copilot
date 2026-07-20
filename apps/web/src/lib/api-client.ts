import {
  AlertSchema,
  CandleSchema,
  DiscordAutomaticScheduledReportDeliveryRequestSchema,
  DiscordAutomaticScheduledReportDeliveryResponseSchema,
  DiscordAutomaticTradePlanAlertDeliveryRequestSchema,
  DiscordAutomaticTradePlanAlertDeliveryResponseSchema,
  DiscordScheduledReportDeliveryRequestSchema,
  DiscordScheduledReportDeliveryResponseSchema,
  DeterministicScheduledReportRequestSchema,
  DeterministicJournalAutomaticCaptureRequestSchema,
  DeterministicJournalAutomaticCaptureResponseSchema,
  DeterministicJournalCaptureRequestSchema,
  DeterministicJournalCaptureResponseSchema,
  DeterministicJournalOutcomeUpdateRequestSchema,
  DeterministicJournalOutcomeUpdateResponseSchema,
  DeterministicJournalSnapshotListResponseSchema,
  SpyZeroDteDeterministicScheduledReportResponseSchema,
  SpyZeroDteScheduledReportScheduleEvaluationResponseSchema,
  DiscordTradePlanAlertDeliveryRequestSchema,
  DiscordTradePlanAlertDeliveryResponseSchema,
  DiscordWebhookStatusResponseSchema,
  DiscordWebhookTestDeliveryResponseSchema,
  DiscordWebhookTestRequestSchema,
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
  SpyZeroDteTradePlanAlertTransitionResponseSchema,
  SpyZeroDtePositionSizingRequestSchema,
  SpyZeroDtePositionSizingResponseSchema,
  SpyZeroDteSchwabAssistedPositionSizingRequestSchema,
  SpyZeroDteSchwabAssistedPositionSizingResponseSchema,
  StrikeExposureSchema,
  type Alert,
  type Candle,
  type DiscordAutomaticScheduledReportDeliveryRequest,
  type DiscordAutomaticScheduledReportDeliveryResponse,
  type DiscordAutomaticTradePlanAlertDeliveryRequest,
  type DiscordScheduledReportDeliveryRequest,
  type DiscordScheduledReportDeliveryResponse,
  type DeterministicScheduledReportRequest,
  type DeterministicJournalAutomaticCaptureRequest,
  type DeterministicJournalAutomaticCaptureResponse,
  type DeterministicJournalCaptureRequest,
  type DeterministicJournalCaptureResponse,
  type DeterministicJournalOutcomeUpdateRequest,
  type DeterministicJournalOutcomeUpdateResponse,
  type DeterministicJournalSnapshotListResponse,
  type SpyZeroDteDeterministicScheduledReportResponse,
  type SpyZeroDteScheduledReportScheduleEvaluationResponse,
  type DiscordAutomaticTradePlanAlertDeliveryResponse,
  type DiscordTradePlanAlertDeliveryRequest,
  type DiscordTradePlanAlertDeliveryResponse,
  type DiscordWebhookStatusResponse,
  type DiscordWebhookTestDeliveryResponse,
  type DiscordWebhookTestRequest,
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
  type SpyZeroDteTradePlanAlertTransitionResponse,
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

async function patchJson<TRequest, TResponse>(
  path: string,
  body: TRequest,
  requestSchema: z.ZodType<TRequest>,
  responseSchema: z.ZodType<TResponse>,
): Promise<TResponse> {
  const validatedBody = requestSchema.parse(body);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
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
  getDeterministicJournalSnapshots: (): Promise<DeterministicJournalSnapshotListResponse> =>
    getPrivateNoStoreJson(
      "/api/journal/spy/snapshots",
      DeterministicJournalSnapshotListResponseSchema,
    ),
  captureDeterministicJournalSnapshot: (): Promise<DeterministicJournalCaptureResponse> =>
    postJson<DeterministicJournalCaptureRequest, DeterministicJournalCaptureResponse>(
      "/api/journal/spy/snapshots",
      {},
      DeterministicJournalCaptureRequestSchema,
      DeterministicJournalCaptureResponseSchema,
    ),
  automaticallyCaptureDeterministicJournalSnapshot: (): Promise<DeterministicJournalAutomaticCaptureResponse> =>
    postJson<
      DeterministicJournalAutomaticCaptureRequest,
      DeterministicJournalAutomaticCaptureResponse
    >(
      "/api/journal/spy/snapshots/automatic",
      {},
      DeterministicJournalAutomaticCaptureRequestSchema,
      DeterministicJournalAutomaticCaptureResponseSchema,
    ),
  updateDeterministicJournalOutcome: (
    snapshotId: string,
    request: DeterministicJournalOutcomeUpdateRequest,
  ): Promise<DeterministicJournalOutcomeUpdateResponse> =>
    patchJson<
      DeterministicJournalOutcomeUpdateRequest,
      DeterministicJournalOutcomeUpdateResponse
    >(
      `/api/journal/spy/snapshots/${encodeURIComponent(snapshotId)}/outcome`,
      request,
      DeterministicJournalOutcomeUpdateRequestSchema,
      DeterministicJournalOutcomeUpdateResponseSchema,
    ),
  getAlerts: (): Promise<Alert[]> => getJson("/api/alerts", z.array(AlertSchema)),
  getSpyScheduledReportScheduleEvaluation: (): Promise<SpyZeroDteScheduledReportScheduleEvaluationResponse> =>
    getPrivateNoStoreJson(
      "/api/reports/spy/schedule-evaluation",
      SpyZeroDteScheduledReportScheduleEvaluationResponseSchema,
    ),
  generateSpyDeterministicScheduledReport: (
    request: DeterministicScheduledReportRequest,
  ): Promise<SpyZeroDteDeterministicScheduledReportResponse> =>
    postJson<
      DeterministicScheduledReportRequest,
      SpyZeroDteDeterministicScheduledReportResponse
    >(
      "/api/reports/spy/deterministic",
      request,
      DeterministicScheduledReportRequestSchema,
      SpyZeroDteDeterministicScheduledReportResponseSchema,
    ),
  getSchwabStatus: (): Promise<SchwabConnectionStatus> =>
    getJson("/api/auth/schwab/status", SchwabConnectionStatusSchema),
  getDiscordWebhookStatus: (): Promise<DiscordWebhookStatusResponse> =>
    getPrivateNoStoreJson(
      "/api/discord/status",
      DiscordWebhookStatusResponseSchema,
    ),
  sendDiscordWebhookTest: (): Promise<DiscordWebhookTestDeliveryResponse> =>
    postJson<DiscordWebhookTestRequest, DiscordWebhookTestDeliveryResponse>(
      "/api/discord/test",
      {},
      DiscordWebhookTestRequestSchema,
      DiscordWebhookTestDeliveryResponseSchema,
    ),
  sendDiscordScheduledReport: (
    request: DiscordScheduledReportDeliveryRequest,
  ): Promise<DiscordScheduledReportDeliveryResponse> =>
    postJson<
      DiscordScheduledReportDeliveryRequest,
      DiscordScheduledReportDeliveryResponse
    >(
      "/api/discord/scheduled-report",
      request,
      DiscordScheduledReportDeliveryRequestSchema,
      DiscordScheduledReportDeliveryResponseSchema,
    ),
  sendDiscordAutomaticScheduledReport: (
    request: DiscordAutomaticScheduledReportDeliveryRequest,
  ): Promise<DiscordAutomaticScheduledReportDeliveryResponse> =>
    postJson<
      DiscordAutomaticScheduledReportDeliveryRequest,
      DiscordAutomaticScheduledReportDeliveryResponse
    >(
      "/api/discord/scheduled-report/automatic",
      request,
      DiscordAutomaticScheduledReportDeliveryRequestSchema,
      DiscordAutomaticScheduledReportDeliveryResponseSchema,
    ),
  sendDiscordTradePlanAlert: (): Promise<DiscordTradePlanAlertDeliveryResponse> =>
    postJson<
      DiscordTradePlanAlertDeliveryRequest,
      DiscordTradePlanAlertDeliveryResponse
    >(
      "/api/discord/trade-plan-alert",
      {},
      DiscordTradePlanAlertDeliveryRequestSchema,
      DiscordTradePlanAlertDeliveryResponseSchema,
    ),
  sendDiscordAutomaticTradePlanAlert: (
    request: DiscordAutomaticTradePlanAlertDeliveryRequest,
  ): Promise<DiscordAutomaticTradePlanAlertDeliveryResponse> =>
    postJson<
      DiscordAutomaticTradePlanAlertDeliveryRequest,
      DiscordAutomaticTradePlanAlertDeliveryResponse
    >(
      "/api/discord/trade-plan-alert/automatic",
      request,
      DiscordAutomaticTradePlanAlertDeliveryRequestSchema,
      DiscordAutomaticTradePlanAlertDeliveryResponseSchema,
    ),
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
  getSpyZeroDteTradePlanAlertTransition: (): Promise<SpyZeroDteTradePlanAlertTransitionResponse> =>
    getPrivateNoStoreJson(
      "/api/trade-plan-alert/spy/transition",
      SpyZeroDteTradePlanAlertTransitionResponseSchema,
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
