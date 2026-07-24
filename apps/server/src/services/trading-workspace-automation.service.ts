import { randomUUID } from "node:crypto";
import { hasDatabaseUrl } from "../config/env";
import { isDatabaseReachable } from "../lib/db-status";
import { getDiscordWebhookConfig } from "./discord-webhook.logic";
import { getSpyZeroDteOptionsChain } from "./schwab-options-chain.service";
import {
  selectPositionManagementSignal,
  type PositionManagementSignal,
} from "./trading-policy.logic";
import { getTradingWorkspace } from "./trading-workspace.service";
import {
  acquireTradingWorkspaceLease,
  getDefaultTradingUserId,
  insertWorkspaceEvent,
  listPendingWorkspaceEvents,
  markWorkspaceEventDelivery,
  updatePositionTouch,
  updateTradingWorkspaceRuntime,
  upsertPositionMark,
} from "./trading-workspace.repository";

const LOOP_MS = 5_000;
const EVALUATION_MS = 15_000;
const LEASE_MS = 30_000;
const PROVIDER_TIMEOUT_MS = 10_000;
const owner = `trading-workspace-${randomUUID()}`;
let lastEvaluationAtMs = 0;

interface RawSettingsRow {
  backendAutomationEnabled: boolean;
  backendTradePlanAlertsEnabled: boolean;
}

async function getDiscordDeliveryEnabled(userId: string): Promise<boolean> {
  const { prisma } = await import("../lib/prisma");
  const rows = await prisma.$queryRaw<RawSettingsRow[]>`
    SELECT "backendAutomationEnabled", "backendTradePlanAlertsEnabled"
    FROM "Settings" WHERE "userId"=${userId} LIMIT 1
  `;
  return Boolean(
    rows[0]?.backendAutomationEnabled && rows[0]?.backendTradePlanAlertsEnabled,
  );
}

function signalMetadata(signal: PositionManagementSignal): {
  eventType: string;
  severity: "INFO" | "ACTION" | "URGENT";
  field:
    | "target1TouchedAt"
    | "target2TouchedAt"
    | "target3TouchedAt"
    | "stopTouchedAt"
    | "timeStopAlertedAt"
    | "mandatoryExitAlertedAt"
    | null;
  markType: string | null;
  title: string;
  message: string;
} {
  switch (signal) {
    case "ABSOLUTE_EXIT_DEADLINE":
      return {
        eventType: "ABSOLUTE_EXIT_DEADLINE_REACHED",
        severity: "URGENT",
        field: "mandatoryExitAlertedAt",
        markType: "ABSOLUTE_DEADLINE",
        title: "Absolute exit deadline reached",
        message: "The position must be manually exited immediately; the dashboard never submits an order.",
      };
    case "MANDATORY_1555_EXIT":
      return {
        eventType: "MANDATORY_1555_EXIT",
        severity: "URGENT",
        field: "mandatoryExitAlertedAt",
        markType: "MANDATORY_1555",
        title: "3:55 p.m. mandatory exit",
        message: "Manually exit the one-contract position before 4:00 p.m. ET.",
      };
    case "STRUCTURAL_STOP":
      return {
        eventType: "STRUCTURAL_STOP_TOUCHED",
        severity: "URGENT",
        field: "stopTouchedAt",
        markType: "STRUCTURAL_STOP",
        title: "Structural invalidation touched",
        message: "The underlying reached the locked structural invalidation. Review and manually record the exit.",
      };
    case "TARGET_2":
      return {
        eventType: "TARGET_2_TOUCHED",
        severity: "URGENT",
        field: "target2TouchedAt",
        markType: "TARGET_2",
        title: "Target 2 touched",
        message: "Target 2 is the primary one-contract exit. Review and manually record the bid-side exit.",
      };
    case "TARGET_1_MANAGEMENT":
      return {
        eventType: "TARGET_1_MANAGEMENT_TOUCHED",
        severity: "ACTION",
        field: "target1TouchedAt",
        markType: "TARGET_1",
        title: "Target 1 management level touched",
        message: "Target 1 is management information only; Target 2 remains the locked primary exit.",
      };
    case "TARGET_3_RESEARCH":
      return {
        eventType: "TARGET_3_RESEARCH_TOUCHED",
        severity: "INFO",
        field: "target3TouchedAt",
        markType: "TARGET_3",
        title: "Target 3 research level touched",
        message: "Target 3 is research-only and does not change the live Target 2 exit policy.",
      };
    case "TIME_STOP_REVIEW":
      return {
        eventType: "TIME_STOP_REVIEW_DUE",
        severity: "ACTION",
        field: "timeStopAlertedAt",
        markType: "TIME_STOP",
        title: "15-minute time-stop review due",
        message: "Three completed five-minute candles have elapsed. Review progress and manually decide whether to exit.",
      };
    default:
      return {
        eventType: "NONE",
        severity: "INFO",
        field: null,
        markType: null,
        title: "No position-management action",
        message: "No management boundary is active.",
      };
  }
}

function touched(input: {
  direction: "CALLS" | "PUTS";
  price: number;
  level: number;
  favorable: boolean;
}): boolean {
  if (input.direction === "CALLS") {
    return input.favorable ? input.price >= input.level : input.price <= input.level;
  }
  return input.favorable ? input.price <= input.level : input.price >= input.level;
}

async function findPositionContractQuote(
  contractSymbol: string,
): Promise<{
  bid: number | null;
  ask: number | null;
  sourceState: string;
  snapshot: unknown;
}> {
  try {
    const chain = await getSpyZeroDteOptionsChain();
    const contract = [...chain.calls, ...chain.puts].find(
      (row) => row.contractSymbol === contractSymbol,
    );
    return {
      bid:
        contract?.bid !== null && contract?.bid !== undefined && Number.isFinite(contract.bid)
          ? contract.bid
          : null,
      ask:
        contract?.ask !== null && contract?.ask !== undefined && Number.isFinite(contract.ask)
          ? contract.ask
          : null,
      sourceState: contract ? chain.sourceState : "CONTRACT_NOT_RETURNED",
      snapshot: {
        chainFetchedAt: chain.fetchedAt,
        sourceState: chain.sourceState,
        warningCode: chain.warningCode,
        contractQuoteAt: contract?.quoteAt ?? null,
      },
    };
  } catch {
    return { bid: null, ask: null, sourceState: "UNAVAILABLE", snapshot: null };
  }
}

async function recordTouchIfNew(input: {
  userId: string;
  positionId: string;
  marketDate: string;
  signal: PositionManagementSignal;
  underlyingPrice: number;
  contractBid: number | null;
  contractAsk: number | null;
  sourceState: string;
  sourceSnapshot: unknown;
  now: Date;
  actionable: boolean;
}): Promise<void> {
  const metadata = signalMetadata(input.signal);
  if (!metadata.field || !metadata.markType) return;
  const updated = await updatePositionTouch({
    positionId: input.positionId,
    field: metadata.field,
    at: input.now,
  });
  const markInserted = await upsertPositionMark({
    positionId: input.positionId,
    markType: metadata.markType,
    observedAt: input.now,
    underlyingPrice: input.underlyingPrice,
    contractBid: input.contractBid,
    contractAsk: input.contractAsk,
    sourceState: input.sourceState,
    sourceSnapshot: input.sourceSnapshot,
  });
  if (!updated && !markInserted) return;
  await insertWorkspaceEvent({
    userId: input.userId,
    marketDate: input.marketDate,
    eventType: metadata.eventType,
    severity: input.actionable ? metadata.severity : "INFO",
    dedupeKey: `${metadata.eventType}:${input.positionId}`,
    relatedPositionId: input.positionId,
    payload: {
      title: metadata.title,
      message: metadata.message,
      actionable: input.actionable && metadata.severity !== "INFO",
      positionId: input.positionId,
      underlyingPrice: input.underlyingPrice,
      modeledExitBid: input.contractBid,
      observedAt: input.now.toISOString(),
      noOrderSubmitted: true,
    },
  });
}

async function evaluateOpenPosition(userId: string, now: Date): Promise<void> {
  const workspace = await getTradingWorkspace({ reconcile: true, now });
  const position = workspace.openPosition;
  const price = workspace.sourceAssembly.currentPrice;
  if (!position || price === null) return;
  const quote = await findPositionContractQuote(position.contractSymbol);

  const primarySignal = selectPositionManagementSignal({
    nowMs: now.getTime(),
    direction: position.direction,
    underlyingPrice: price,
    structuralStopLevel: position.structuralStopLevel,
    target1Level: position.target1Level,
    target2Level: position.target2Level,
    target3Level: position.target3Level,
    timeStopReviewAtMs: Date.parse(position.timeStopReviewAt),
  });

  // Record every crossed research/management boundary independently, but mark
  // only the deterministic highest-priority signal actionable for delivery.
  const conditions: Array<[PositionManagementSignal, boolean]> = [
    [
      "STRUCTURAL_STOP",
      touched({
        direction: position.direction,
        price,
        level: position.structuralStopLevel,
        favorable: false,
      }),
    ],
    [
      "TARGET_1_MANAGEMENT",
      touched({
        direction: position.direction,
        price,
        level: position.target1Level,
        favorable: true,
      }),
    ],
    [
      "TARGET_2",
      touched({
        direction: position.direction,
        price,
        level: position.target2Level,
        favorable: true,
      }),
    ],
    [
      "TARGET_3_RESEARCH",
      position.target3Level !== null &&
        touched({
          direction: position.direction,
          price,
          level: position.target3Level,
          favorable: true,
        }),
    ],
    ["TIME_STOP_REVIEW", now.getTime() >= Date.parse(position.timeStopReviewAt)],
  ];
  for (const [signal, isActive] of conditions) {
    if (!isActive) continue;
    await recordTouchIfNew({
      userId,
      positionId: position.id,
      marketDate: position.marketDate,
      signal,
      underlyingPrice: price,
      contractBid: quote.bid,
      contractAsk: quote.ask,
      sourceState: quote.sourceState,
      sourceSnapshot: quote.snapshot,
      now,
      actionable: signal === primarySignal,
    });
  }
  if (
    primarySignal === "MANDATORY_1555_EXIT" ||
    primarySignal === "ABSOLUTE_EXIT_DEADLINE"
  ) {
    await recordTouchIfNew({
      userId,
      positionId: position.id,
      marketDate: position.marketDate,
      signal: primarySignal,
      underlyingPrice: price,
      contractBid: quote.bid,
      contractAsk: quote.ask,
      sourceState: quote.sourceState,
      sourceSnapshot: quote.snapshot,
      now,
      actionable: true,
    });
  }
}

function discordPayload(event: {
  eventType: string;
  severity: string;
  payload: Record<string, unknown>;
}): Record<string, unknown> {
  const title = typeof event.payload.title === "string" ? event.payload.title : event.eventType;
  const message =
    typeof event.payload.message === "string"
      ? event.payload.message
      : "Review the SPY 0DTE trading workspace.";
  return {
    username: "SPY 0DTE Copilot",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title,
        description: message,
        fields: [
          { name: "Severity", value: event.severity, inline: true },
          { name: "Source", value: "Persistent backend trading workspace", inline: true },
        ],
        footer: { text: "Decision support only • No order was created or executed" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function sendPendingDiscordEvents(userId: string, now: Date): Promise<void> {
  if (!(await getDiscordDeliveryEnabled(userId))) return;
  const config = getDiscordWebhookConfig();
  if (config.status !== "valid") return;
  const events = await listPendingWorkspaceEvents(userId, 20);
  for (const event of events) {
    if (event.payload.actionable !== true) {
      await markWorkspaceEventDelivery({
        userId,
        eventId: event.id,
        state: "SUPPRESSED",
        statusCode: null,
        now,
      });
      continue;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.webhookUrl}?wait=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload(event)),
        signal: controller.signal,
      });
      await markWorkspaceEventDelivery({
        userId,
        eventId: event.id,
        state: response.ok ? "DELIVERED" : response.status === 429 ? "AMBIGUOUS" : "FAILED",
        statusCode: response.status,
        now,
      });
    } catch {
      await markWorkspaceEventDelivery({
        userId,
        eventId: event.id,
        state: "AMBIGUOUS",
        statusCode: null,
        now,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function tick(): Promise<void> {
  const now = new Date();
  if (!hasDatabaseUrl || !(await isDatabaseReachable())) return;
  const userId = await getDefaultTradingUserId();
  const acquired = await acquireTradingWorkspaceLease({
    userId,
    owner,
    now,
    expiresAt: new Date(now.getTime() + LEASE_MS),
  });
  if (!acquired) return;
  if (now.getTime() - lastEvaluationAtMs < EVALUATION_MS) {
    await updateTradingWorkspaceRuntime({
      userId,
      owner,
      now,
      outcome: "HEARTBEAT",
    });
    return;
  }
  lastEvaluationAtMs = now.getTime();
  try {
    await evaluateOpenPosition(userId, now);
    await sendPendingDiscordEvents(userId, now);
    await updateTradingWorkspaceRuntime({
      userId,
      owner,
      now,
      outcome: "EVALUATED",
      errorCode: null,
    });
  } catch {
    await updateTradingWorkspaceRuntime({
      userId,
      owner,
      now,
      outcome: "UNAVAILABLE",
      errorCode: "TRADING_WORKSPACE_AUTOMATION_FAILURE",
    });
    // Fixed category only. Never log positions, provider bodies, or webhook data.
    // eslint-disable-next-line no-console
    console.error("[trading-workspace-automation] evaluation failure");
  }
}

export function startTradingWorkspaceScheduler(): { stop: () => void } {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await tick();
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), LOOP_MS);
  timer.unref();
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
