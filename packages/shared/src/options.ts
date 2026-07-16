export const DEFAULT_VISIBLE_STRIKE_COUNT = 9;

export interface AtmCenteredStrikeWindow {
  atmStrike: number | null;
  visibleStrikes: number[];
}

export function sortUniqueStrikes(strikes: readonly number[]): number[] {
  return [...new Set(strikes.filter(Number.isFinite))].sort((a, b) => a - b);
}

export function selectAtmStrike(
  strikes: readonly number[],
  underlyingPrice: number | null,
): number | null {
  if (underlyingPrice === null || !Number.isFinite(underlyingPrice)) return null;

  const sortedStrikes = sortUniqueStrikes(strikes);
  if (sortedStrikes.length === 0) return null;

  let selected = sortedStrikes[0] ?? null;
  if (selected === null) return null;

  let selectedDistance = Math.abs(selected - underlyingPrice);
  for (let index = 1; index < sortedStrikes.length; index += 1) {
    const strike = sortedStrikes[index];
    if (strike === undefined) continue;

    const distance = Math.abs(strike - underlyingPrice);
    // The ascending list plus strict comparison preserves the lower strike
    // when two strikes are equally distant from the underlying.
    if (distance < selectedDistance) {
      selected = strike;
      selectedDistance = distance;
    }
  }

  return selected;
}

export function selectAtmCenteredStrikeWindow(
  strikes: readonly number[],
  underlyingPrice: number | null,
  visibleStrikeCount = DEFAULT_VISIBLE_STRIKE_COUNT,
): AtmCenteredStrikeWindow {
  const sortedStrikes = sortUniqueStrikes(strikes);
  const safeCount = Math.max(1, Math.floor(visibleStrikeCount));
  const atmStrike = selectAtmStrike(sortedStrikes, underlyingPrice);

  if (sortedStrikes.length <= safeCount) {
    return { atmStrike, visibleStrikes: sortedStrikes };
  }

  if (atmStrike === null) {
    return { atmStrike: null, visibleStrikes: sortedStrikes.slice(0, safeCount) };
  }

  const atmIndex = sortedStrikes.indexOf(atmStrike);
  const strikesBeforeAtm = Math.floor((safeCount - 1) / 2);
  const preferredStart = atmIndex - strikesBeforeAtm;
  const maxStart = sortedStrikes.length - safeCount;
  const start = Math.min(Math.max(preferredStart, 0), maxStart);

  return {
    atmStrike,
    visibleStrikes: sortedStrikes.slice(start, start + safeCount),
  };
}
