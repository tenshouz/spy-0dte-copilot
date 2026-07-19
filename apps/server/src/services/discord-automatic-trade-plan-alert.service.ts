import type {
  DiscordAutomaticTradePlanAlertDeliveryRequest,
  DiscordAutomaticTradePlanAlertDeliveryResponse,
  DiscordTradePlanAlertDeliveryResponse,
} from "@spy-copilot/shared";
import {
  DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_MAXIMUM_ATTEMPTS,
  DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_RETRY_DELAY_MS,
  buildDiscordAutomaticTradePlanAlertDeliveryResponse,
  isDiscordAutomaticTradePlanAlertRetryEligible,
} from "./discord-automatic-trade-plan-alert.logic";
import { sendDiscordTradePlanAlert } from "./discord-trade-plan-alert.service";

export interface DiscordAutomaticTradePlanAlertDeliveryDependencies {
  send: () => Promise<DiscordTradePlanAlertDeliveryResponse>;
  sleep: (milliseconds: number) => Promise<void>;
  maximumAttempts: typeof DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_MAXIMUM_ATTEMPTS;
  retryDelayMs: typeof DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_RETRY_DELAY_MS;
}

const defaultDependencies: DiscordAutomaticTradePlanAlertDeliveryDependencies = {
  send: sendDiscordTradePlanAlert,
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maximumAttempts: DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_MAXIMUM_ATTEMPTS,
  retryDelayMs: DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_RETRY_DELAY_MS,
};

export async function runDiscordAutomaticTradePlanAlertDeliveryWithDependencies(
  request: DiscordAutomaticTradePlanAlertDeliveryRequest,
  dependencies: DiscordAutomaticTradePlanAlertDeliveryDependencies,
): Promise<DiscordAutomaticTradePlanAlertDeliveryResponse> {
  const results: DiscordTradePlanAlertDeliveryResponse[] = [];

  for (
    let attemptNumber = 1;
    attemptNumber <= dependencies.maximumAttempts;
    attemptNumber += 1
  ) {
    const result = await dependencies.send();
    results.push(result);

    if (
      !isDiscordAutomaticTradePlanAlertRetryEligible(result) ||
      attemptNumber >= dependencies.maximumAttempts
    ) {
      break;
    }

    await dependencies.sleep(dependencies.retryDelayMs);
  }

  return buildDiscordAutomaticTradePlanAlertDeliveryResponse({
    request,
    results,
  });
}

export function createSerializedDiscordAutomaticTradePlanAlertRunner(
  dependencies: DiscordAutomaticTradePlanAlertDeliveryDependencies,
): (
  request: DiscordAutomaticTradePlanAlertDeliveryRequest,
) => Promise<DiscordAutomaticTradePlanAlertDeliveryResponse> {
  let queue: Promise<void> = Promise.resolve();

  return (request) => {
    const result = queue.then(() =>
      runDiscordAutomaticTradePlanAlertDeliveryWithDependencies(
        request,
        dependencies,
      ),
    );
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

const defaultRunner = createSerializedDiscordAutomaticTradePlanAlertRunner(
  defaultDependencies,
);

export function runDiscordAutomaticTradePlanAlertDelivery(
  request: DiscordAutomaticTradePlanAlertDeliveryRequest,
): Promise<DiscordAutomaticTradePlanAlertDeliveryResponse> {
  return defaultRunner(request);
}
