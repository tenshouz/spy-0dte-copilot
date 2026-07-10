import { AlertSchema, type Alert } from "@spy-copilot/shared";

export function getMockAlerts(): Alert[] {
  const alerts: Alert[] = [
    {
      id: "alert_mock_001",
      severity: "bias_change",
      title: "Bias changed: WAIT → CALLS",
      message: "Confidence 8/10 — above VWAP, positive gamma, opening drive confirmed.",
      createdAt: new Date(Date.now() - 6 * 60_000).toISOString(),
      delivered: true,
    },
    {
      id: "alert_mock_002",
      severity: "warning",
      title: "Low relative volume",
      message: "RVOL at 0.9x heading into the 9:45 checkpoint — confirm expansion before adding size.",
      createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
      delivered: true,
    },
    {
      id: "alert_mock_003",
      severity: "info",
      title: "Premarket report generated",
      message: "9:25 AM premarket report is ready — regime: range-bound, bias: WAIT.",
      createdAt: new Date(Date.now() - 40 * 60_000).toISOString(),
      delivered: true,
    },
    {
      id: "alert_mock_004",
      severity: "invalidation",
      title: "Trade plan invalidation level approached",
      message: "SPY traded down to 616.35, within 0.15 of the 616.20 invalidation level.",
      createdAt: new Date(Date.now() - 1 * 60_000).toISOString(),
      delivered: false,
    },
  ];

  return alerts.map((a) => AlertSchema.parse(a));
}
