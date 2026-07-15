import {
  AlertSchema,
  CandleSchema,
  JournalEntrySchema,
  MarketSnapshotSchema,
  ReportSchema,
  SchwabConnectionStatusSchema,
  SpyCandleResponseSchema,
  SpyOpeningRangeResponseSchema,
  SpyQuoteSchema,
  SpyRthGapResponseSchema,
  SpyRthVwapResponseSchema,
  SpySessionLevelsResponseSchema,
  StrikeExposureSchema,
  type Alert,
  type Candle,
  type JournalEntry,
  type MarketSnapshot,
  type Report,
  type SchwabConnectionStatus,
  type SpyCandleResponse,
  type SpyOpeningRangeResponse,
  type SpyQuote,
  type SpyRthGapResponse,
  type SpyRthVwapResponse,
  type SpySessionLevelsResponse,
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
  getSpyOpeningRange: (): Promise<SpyOpeningRangeResponse> =>
    getJson("/api/opening-range/spy", SpyOpeningRangeResponseSchema),
  getSpyQuote: (): Promise<SpyQuote> => getJson("/api/quote/spy", SpyQuoteSchema),
  getSpyCandles: (): Promise<SpyCandleResponse> => getJson("/api/candles/spy", SpyCandleResponseSchema),
  getSpyRthGap: (): Promise<SpyRthGapResponse> =>
    getJson("/api/gap/spy", SpyRthGapResponseSchema),
  getSpyRthVwap: (): Promise<SpyRthVwapResponse> =>
    getJson("/api/vwap/spy", SpyRthVwapResponseSchema),
  getSpySessionLevels: (): Promise<SpySessionLevelsResponse> =>
    getJson("/api/session-levels/spy", SpySessionLevelsResponseSchema),
};

export const schwabLoginUrl = `${API_BASE_URL}/api/auth/schwab/login`;
