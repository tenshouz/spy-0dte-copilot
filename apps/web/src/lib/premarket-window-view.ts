import type { PremarketWindowPolicy } from "@spy-copilot/shared";

export function formatPremarketWindowLabel(
  policy: PremarketWindowPolicy,
): string {
  return `${policy.startTimeEastern}–${policy.endTimeEasternExclusive} ET`;
}

export function formatPremarketWindowDisclosure(
  policy: PremarketWindowPolicy,
): string {
  return `Provider-aligned premarket window: ${formatPremarketWindowLabel(policy)}. Candles before ${policy.startTimeEastern} ET are outside this methodology and do not reduce coverage completeness.`;
}
