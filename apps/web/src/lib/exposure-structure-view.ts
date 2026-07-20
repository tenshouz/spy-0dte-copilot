import type {
  ExposureStructureEngineState,
  ExposureStructureWarningCode,
  SpyZeroDteExposureStructureResponse,
} from "@spy-copilot/shared";
import type { ChartReferenceLine } from "@/components/panels/chart-container";

export function formatExposureState(value: string): string {
  return value.replace(/_/g, " ");
}

export function exposureStructureTone(
  state: ExposureStructureEngineState,
): "bull" | "wait" | "bear" {
  if (state === "AVAILABLE") return "bull";
  if (state === "PARTIAL") return "wait";
  return "bear";
}

export function exposureStructureWarningMessage(
  code: ExposureStructureWarningCode,
): string {
  switch (code) {
    case "GEX_UNAVAILABLE":
      return "Gamma structure is unavailable because no eligible current-date GEX proxy exists.";
    case "DEX_UNAVAILABLE":
      return "DEX structure is unavailable; Gamma structure remains independently usable.";
    case "PARTIAL_GEX_COVERAGE":
      return "Some returned contracts lacked required Gamma or Open Interest inputs.";
    case "PARTIAL_DEX_COVERAGE":
      return "Some returned contracts lacked required Delta or Open Interest inputs.";
    case "RETAINED_STALE_CHAIN":
      return "Structure uses the last retained eligible Options Chain snapshot.";
    case "GAMMA_BALANCE_CROSS_NOT_FOUND":
      return "No cumulative Net GEX zero crossing exists inside the returned strike window.";
    case "INSUFFICIENT_STRIKES_FOR_CLIFFS":
      return "At least two eligible GEX strikes are required to calculate adjacent Gamma cliffs.";
  }
}

export function getExposureStructureReferenceLines(
  response: SpyZeroDteExposureStructureResponse | null,
): ChartReferenceLine[] {
  if (!response || response.engineState === "UNAVAILABLE") return [];
  const lines: ChartReferenceLine[] = [];
  const callWall = response.callWalls[0];
  const putWall = response.putWalls[0];
  if (callWall) {
    lines.push({ price: callWall.strikePrice, title: "Call Wall", color: "#22C55E", lineStyle: 2 });
  }
  if (putWall) {
    lines.push({ price: putWall.strikePrice, title: "Put Wall", color: "#EF4444", lineStyle: 2 });
  }
  if (response.gammaFlipProxy.estimatedStrike !== null) {
    lines.push({
      price: response.gammaFlipProxy.estimatedStrike,
      title: "Gamma Balance",
      color: "#A78BFA",
      lineStyle: 3,
    });
  }
  return lines;
}
