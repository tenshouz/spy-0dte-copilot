"use client";

import { BiasCard } from "@/components/dashboard/bias-card";
import { ConfidenceCard } from "@/components/dashboard/confidence-card";
import { CurrentPriceCard } from "@/components/dashboard/current-price-card";
import { LiveChart } from "@/components/dashboard/live-chart";
import { MarketRegimeCard } from "@/components/dashboard/market-regime-card";
import { SessionTimeline } from "@/components/dashboard/session-timeline";
import { TodaysLevelsCard } from "@/components/dashboard/todays-levels-card";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { useDisplaySpyZeroDteDexProxy } from "@/hooks/use-spy-dex-proxy";
import { useDisplaySpyZeroDteExpectedMove } from "@/hooks/use-spy-expected-move";
import { useDisplaySpyZeroDteGexProxy } from "@/hooks/use-spy-gex-proxy";
import { useSpyZeroDteTradePlanAssembly } from "@/hooks/use-spy-trade-plan-assembly";
import {
  formatDashboardCompact,
  formatDashboardNumber,
  formatDashboardPrice,
  getDashboardPlanStateLabel,
  summarizeGexConcentrations,
} from "@/lib/dashboard-deterministic-view";

function stateTone(state: string): "bull" | "wait" {
  return state === "LIVE" || state === "AVAILABLE" ? "bull" : "wait";
}

export default function DashboardPage() {
  const expectedMove = useDisplaySpyZeroDteExpectedMove();
  const gex = useDisplaySpyZeroDteGexProxy();
  const dex = useDisplaySpyZeroDteDexProxy();
  const assemblyQuery = useSpyZeroDteTradePlanAssembly();
  const assembly = assemblyQuery.isError ? null : assemblyQuery.data ?? null;
  const gexSummary = gex.display
    ? summarizeGexConcentrations(gex.display.response)
    : null;

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Dashboard"
        description="Current deterministic SPY 0DTE structure, evidence, and conditional planning references."
      />

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-4">
        <CurrentPriceCard />
        <BiasCard />
        <ConfidenceCard />
        <MarketRegimeCard />

        <Panel
          title="GEX Concentrations"
          isLoading={gex.isLoading}
          isError={gex.isError}
          className="lg:col-span-1"
          action={
            gex.display && (
              <Badge variant={stateTone(gex.display.response.metricState)}>
                {gex.display.response.metricState}
              </Badge>
            )
          }
        >
          {gex.display && gexSummary && (
            <div className="grid grid-cols-1 gap-2">
              <MetricCard
                label="Largest Positive Net GEX Strike"
                value={formatDashboardPrice(gexSummary.largestPositiveStrike)}
                sublabel={formatDashboardCompact(gexSummary.largestPositiveExposure)}
                tone="bull"
              />
              <MetricCard
                label="Largest Negative Net GEX Strike"
                value={formatDashboardPrice(gexSummary.largestNegativeStrike)}
                sublabel={formatDashboardCompact(gexSummary.largestNegativeExposure)}
                tone="bear"
              />
              <MetricCard
                label="Returned Strike Window"
                value={`${formatDashboardPrice(gex.display.response.minimumReturnedStrike)} – ${formatDashboardPrice(gex.display.response.maximumReturnedStrike)}`}
                sublabel={`${gex.display.response.coverageState} coverage · not a dealer wall model`}
              />
            </div>
          )}
        </Panel>

        <TodaysLevelsCard />

        <Panel
          title="Expected Move"
          isLoading={expectedMove.isLoading}
          isError={expectedMove.isError}
          className="lg:col-span-1"
          action={
            expectedMove.display && (
              <Badge variant={stateTone(expectedMove.display.response.metricState)}>
                {expectedMove.display.response.metricState}
              </Badge>
            )
          }
        >
          {expectedMove.display && (
            <div className="grid grid-cols-1 gap-2">
              <MetricCard
                label="ATM Implied Move"
                value={
                  expectedMove.display.response.impliedMovePoints === null
                    ? "—"
                    : `± ${formatDashboardNumber(expectedMove.display.response.impliedMovePoints)} pts`
                }
                sublabel={
                  expectedMove.display.response.impliedMovePercent === null
                    ? "Unavailable"
                    : `${formatDashboardNumber(expectedMove.display.response.impliedMovePercent)}% of underlying`
                }
              />
              <MetricCard
                label="Implied Range"
                value={`${formatDashboardPrice(expectedMove.display.response.lowerImpliedMoveLevel)} – ${formatDashboardPrice(expectedMove.display.response.upperImpliedMoveLevel)}`}
                sublabel="ATM straddle mark reference"
              />
            </div>
          )}
        </Panel>

        <Panel
          title="GEX / DEX Proxies"
          isLoading={gex.isLoading && dex.isLoading}
          isError={gex.isError && dex.isError}
          className="lg:col-span-1"
        >
          {(gex.display || dex.display) && (
            <div className="grid grid-cols-1 gap-2">
              {gex.display && (
                <MetricCard
                  label={`Returned-Window Net GEX · ${gex.display.response.metricState}`}
                  value={formatDashboardCompact(gex.display.response.returnedWindowNetGammaExposureProxy)}
                  sublabel={`${gex.display.response.eligibleStrikeCount} eligible strikes`}
                  tone={
                    (gex.display.response.returnedWindowNetGammaExposureProxy ?? 0) > 0
                      ? "bull"
                      : (gex.display.response.returnedWindowNetGammaExposureProxy ?? 0) < 0
                        ? "bear"
                        : "default"
                  }
                />
              )}
              {dex.display && (
                <MetricCard
                  label={`Returned-Window Net DEX · ${dex.display.response.metricState}`}
                  value={formatDashboardCompact(dex.display.response.returnedWindowNetDeltaExposureProxy)}
                  sublabel={`${dex.display.response.eligibleStrikeCount} eligible strikes`}
                  tone={
                    (dex.display.response.returnedWindowNetDeltaExposureProxy ?? 0) > 0
                      ? "bull"
                      : (dex.display.response.returnedWindowNetDeltaExposureProxy ?? 0) < 0
                        ? "bear"
                        : "default"
                  }
                />
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Returned-chain-window exposure proxies only; they do not assert exact dealer inventory.
              </p>
            </div>
          )}
        </Panel>

        <LiveChart />

        <Panel
          title="Trade Plan Assembly"
          isLoading={assemblyQuery.isLoading}
          isError={assemblyQuery.isError}
          className="lg:col-span-2"
          action={
            assembly && (
              <Badge variant={assembly.planState === "READY" ? "bull" : "wait"}>
                {getDashboardPlanStateLabel(assembly.planState)}
              </Badge>
            )
          }
        >
          {assembly && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard
                label="Direction"
                value={assembly.direction.replace(/_/g, " ")}
                sublabel={`${assembly.bias.biasState} structural bias`}
                tone={assembly.direction === "CALLS" ? "bull" : assembly.direction === "PUTS" ? "bear" : "wait"}
              />
              <MetricCard
                label="Entry Condition"
                value={assembly.entryCondition.state.replace(/_/g, " ")}
                sublabel={
                  assembly.entryCondition.triggerLevel === null
                    ? assembly.entryCondition.planningReferenceType.replace(/_/g, " ")
                    : `Trigger ${formatDashboardPrice(assembly.entryCondition.triggerLevel)}`
                }
              />
              <MetricCard
                label="Structural Invalidation"
                value={formatDashboardPrice(assembly.structuralInvalidation.level)}
                sublabel={assembly.structuralInvalidation.levelType?.replace(/_/g, " ") ?? "Unavailable"}
                tone="bear"
              />
              <MetricCard
                label="Primary Objective"
                value={formatDashboardPrice(assembly.primaryObjective.level)}
                sublabel={assembly.primaryObjective.levelType?.replace(/_/g, " ") ?? "Unavailable"}
                tone="bull"
              />
              <MetricCard
                label="Underlying Reward / Risk"
                value={
                  assembly.underlyingRiskReward.rewardRiskRatio === null
                    ? "—"
                    : `${formatDashboardNumber(assembly.underlyingRiskReward.rewardRiskRatio)} : 1`
                }
                sublabel={assembly.underlyingRiskReward.qualification.replace(/_/g, " ")}
              />
              <MetricCard
                label="Selected Contract"
                value={assembly.selectedContract.contractSymbol ?? "—"}
                sublabel={
                  assembly.selectedContract.strikePrice === null
                    ? "Available only when plan is READY"
                    : `${assembly.selectedContract.contractDirection} ${formatDashboardPrice(assembly.selectedContract.strikePrice)}`
                }
                className="col-span-2 sm:col-span-3"
              />
            </div>
          )}
        </Panel>

        <div className="lg:col-span-4">
          <SessionTimeline />
        </div>
      </div>
    </div>
  );
}
