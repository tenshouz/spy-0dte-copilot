import { ReportSchema, type Report } from "@spy-copilot/shared";
import { getMockSnapshot } from "./market-snapshot.mock";

export function getMockReport(): Report {
  const report: Report = {
    id: "report_mock_0935",
    type: "0935",
    createdAt: new Date().toISOString(),
    snapshot: getMockSnapshot(),
    bias: "CALLS",
    confidence: 8,
    bullishScenario:
      "Price holds above VWAP and the opening range high; a push through the gamma flip near 617 " +
      "invites dealer hedging that accelerates the move toward the call wall.",
    bearishScenario:
      "A fast rejection back below VWAP on expanding volume would flip the regime back to range-bound " +
      "and put the put wall in play.",
    tradePlan: {
      entryCondition: "Break and hold above 617.40 with volume confirmation",
      targets: [618.9, 620.1],
      invalidation: 616.2,
      riskNote: "Theta accelerates after 2:00 PM ET — reduce size on late-day entries.",
    },
    warnings: ["Relative volume only 1.12x — confirm expansion before adding size."],
    reasoning:
      "Price is above VWAP with dealers positioned long gamma, which favors an orderly grind rather than " +
      "a violent move. The opening drive has confirmed with volume, and DEX suggests dealers are net " +
      "buyers on dips, reinforcing the bullish case into the call wall at 620.",
    factorScores: [
      { factor: "Above VWAP", points: 2, detail: "Spot 617.42 vs VWAP 616.85" },
      { factor: "Positive Gamma", points: 2, detail: "Net GEX +$1.24B — dampens volatility" },
      { factor: "Opening Drive confirmed", points: 2, detail: "Opening range high broken with volume" },
      { factor: "Volume Expanding", points: 1, detail: "RVOL 1.12x" },
      { factor: "Dealer Position Bullish (DEX)", points: 2, detail: "Net DEX +$340M" },
    ],
    screenshotUrl: null,
  };

  return ReportSchema.parse(report);
}

export function getMockReportHistory(): Report[] {
  const latest = getMockReport();
  return [
    { ...latest, id: "report_mock_1000", type: "1000", confidence: 8 },
    { ...latest, id: "report_mock_0945", type: "0945", confidence: 7 },
    { ...latest, id: "report_mock_0935", type: "0935", confidence: 8 },
    {
      ...latest,
      id: "report_mock_premarket",
      type: "premarket",
      bias: "WAIT",
      confidence: 5,
      reasoning: "Premarket range is tight and inside yesterday's value area — no clear edge yet.",
    },
  ];
}
