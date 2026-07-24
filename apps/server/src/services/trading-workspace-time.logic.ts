export interface WorkspaceAssemblySourceTiming {
  calculatedAt: string;
  sourceContextAssembledAt: string;
  exposureStructure?: { calculatedAt: string } | null;
}

function parsedTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A Trading Workspace request captures its policy clock before awaiting live
 * market data. The assembled market state is calculated later and can contain
 * embedded gamma research calculated later still. All downstream assembly
 * products use one stable timestamp, but that timestamp must never precede an
 * upstream source timestamp or strict response validation will correctly fail.
 */
export function resolveWorkspaceAssemblyTimeMs(
  requestedTimeMs: number,
  marketState: WorkspaceAssemblySourceTiming,
): number {
  if (!Number.isFinite(requestedTimeMs)) {
    throw new RangeError("Workspace assembly time must be a finite timestamp");
  }

  const sourceTimes = [
    parsedTimestampMs(marketState.sourceContextAssembledAt),
    parsedTimestampMs(marketState.calculatedAt),
    parsedTimestampMs(marketState.exposureStructure?.calculatedAt),
  ].filter((value): value is number => value !== null);

  return Math.max(requestedTimeMs, ...sourceTimes);
}
