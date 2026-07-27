"use client";

import { Calculator, Info, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  DeterministicTradePlanState,
  SpyZeroDteSchwabAssistedPositionSizingResponse,
} from "@spy-copilot/shared";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSpyZeroDteSchwabAssistedPositionSizing } from "@/hooks/use-spy-schwab-assisted-position-sizing";
import {
  buildSchwabAssistedSizingRequest,
  EMPTY_SCHWAB_ASSISTED_SIZING_FORM,
  formatControlLabel,
  getSchwabAssistedSizingStateView,
  type SchwabAssistedSizingField,
  type SchwabAssistedSizingFormErrors,
  type SchwabAssistedSizingFormValues,
  type SchwabAssistedSizingViewTone,
} from "@/lib/schwab-assisted-sizing-view";
import {
  formatNullableNumber,
  formatNullablePercent,
  formatNullablePrice,
  formatNullableTimestamp,
} from "@/lib/trade-plan-assembly-view";

type SizingBadgeVariant = "default" | "bull" | "bear" | "wait";

function sizingBadgeVariant(tone: SchwabAssistedSizingViewTone): SizingBadgeVariant {
  return tone;
}

interface SchwabAssistedSizingPanelProps {
  planState: DeterministicTradePlanState;
}

export function SchwabAssistedSizingPanel({
  planState,
}: SchwabAssistedSizingPanelProps) {
  const [values, setValues] = useState<SchwabAssistedSizingFormValues>({
    ...EMPTY_SCHWAB_ASSISTED_SIZING_FORM,
  });
  const [errors, setErrors] = useState<SchwabAssistedSizingFormErrors>({});
  const mutation = useSpyZeroDteSchwabAssistedPositionSizing();
  const planReady = planState === "READY";

  function updateField(field: SchwabAssistedSizingField, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (mutation.data || mutation.isError) mutation.reset();
  }

  function submitSizing(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = buildSchwabAssistedSizingRequest(values);
    setErrors(parsed.errors);
    if (!parsed.success || !planReady) return;
    mutation.mutate(parsed.request);
  }

  return (
    <Panel
      title="Schwab-Assisted Position Sizing"
      className="min-w-0 lg:col-span-3"
      action={<Badge variant="accent">Read-only reference</Badge>}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-md border border-accent/20 bg-accent/5 p-3 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">Available cash may come from Schwab only after an explicit calculation.</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Account equity and risk budgets remain caller supplied. Risk capacity uses the modeled structural-invalidation loss; capital capacity uses the full Ask debit. Nothing is saved, and no positions, orders, or transactions are requested.
            </p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submitSizing} noValidate>
          <fieldset disabled={mutation.isPending} className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Caller risk inputs
              </h3>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SizingInput
                  label="Account Equity"
                  field="accountEquityDollars"
                  value={values.accountEquityDollars}
                  error={errors.accountEquityDollars}
                  placeholder="25000"
                  minimum="0.01"
                  onChange={updateField}
                />
                <SizingInput
                  label="Remaining Daily-Loss Budget"
                  field="remainingDailyLossBudgetDollars"
                  value={values.remainingDailyLossBudgetDollars}
                  error={errors.remainingDailyLossBudgetDollars}
                  placeholder="1000"
                  minimum="0"
                  onChange={updateField}
                />
                <SizingInput
                  label="Remaining Portfolio-Risk Budget"
                  field="remainingPortfolioRiskBudgetDollars"
                  value={values.remainingPortfolioRiskBudgetDollars}
                  error={errors.remainingPortfolioRiskBudgetDollars}
                  placeholder="1500"
                  minimum="0"
                  onChange={updateField}
                />
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Risk policy
              </h3>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SizingInput
                  label="Maximum Risk Per Trade"
                  field="maximumRiskPerTradeDollars"
                  value={values.maximumRiskPerTradeDollars}
                  error={errors.maximumRiskPerTradeDollars}
                  placeholder="800"
                  minimum="0"
                  onChange={updateField}
                />
                <SizingInput
                  label="Maximum Capital Allocation"
                  field="maximumCapitalAllocationDollars"
                  value={values.maximumCapitalAllocationDollars}
                  error={errors.maximumCapitalAllocationDollars}
                  placeholder="3000"
                  minimum="0"
                  onChange={updateField}
                />
                <SizingInput
                  label="Maximum Contracts"
                  field="maximumContracts"
                  value={values.maximumContracts}
                  error={errors.maximumContracts}
                  placeholder="10"
                  minimum="0"
                  step="1"
                  onChange={updateField}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {planReady
                  ? "The source Assembly is READY. Calculation may request the sanitized read-only Schwab cash snapshot."
                  : "Sizing is disabled until the source Trade Plan Assembly is READY."}
              </p>
              <Button type="submit" disabled={!planReady || mutation.isPending}>
                <Calculator className="h-4 w-4" aria-hidden />
                {mutation.isPending ? "Calculating…" : "Calculate reference size"}
              </Button>
            </div>
          </fieldset>
        </form>

        {mutation.isError ? (
          <div className="rounded-md border border-bear/30 bg-bear-muted/30 p-3 text-sm text-bear" role="alert">
            The sizing request failed before a validated result was returned. No prior sizing result is retained.
          </div>
        ) : null}

        {mutation.data && planReady ? <SizingResult result={mutation.data} /> : null}
      </div>
    </Panel>
  );
}

function SizingInput({
  label,
  field,
  value,
  error,
  placeholder,
  minimum,
  step = "0.01",
  onChange,
}: {
  label: string;
  field: SchwabAssistedSizingField;
  value: string;
  error?: string;
  placeholder: string;
  minimum: string;
  step?: string;
  onChange: (field: SchwabAssistedSizingField, value: string) => void;
}) {
  const errorId = `${field}-error`;
  return (
    <label className="min-w-0 space-y-1.5 text-xs">
      <span className="block font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        {field !== "maximumContracts" ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-muted-foreground">
            $
          </span>
        ) : null}
        <input
          type="number"
          inputMode={field === "maximumContracts" ? "numeric" : "decimal"}
          min={minimum}
          step={step}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(field, event.target.value)}
          className={`h-10 w-full rounded-md border bg-background px-3 font-mono text-sm tabular-nums placeholder:text-muted-foreground/40 ${
            field !== "maximumContracts" ? "pl-7" : ""
          } ${error ? "border-bear" : "border-input"}`}
        />
      </div>
      {error ? (
        <span id={errorId} className="block text-[11px] text-bear" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function SizingResult({
  result,
}: {
  result: SpyZeroDteSchwabAssistedPositionSizingResponse;
}) {
  const view = getSchwabAssistedSizingStateView(result.sizingState);
  const broker = result.accountContext.brokerSnapshot;
  const quantity = result.quantityCalculation.maximumContractsUnderPolicy;

  return (
    <div className="space-y-4 border-t border-panel-border pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-base font-semibold">{view.title}</h3>
            <Badge variant={sizingBadgeVariant(view.tone)}>
              {result.sizingState.replaceAll("_", " ")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{view.description}</p>
          <p className="text-xs text-muted-foreground">
            Reason: <span className="font-mono">{result.primaryReasonCode}</span>
            {result.warningCode ? (
              <>
                {" "}· Warning: <span className="font-mono text-wait">{result.warningCode}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="rounded-md border border-panel-border bg-background/40 px-3 py-2 text-right text-xs text-muted-foreground">
          <p>Calculated</p>
          <p className="font-mono text-foreground">{formatNullableTimestamp(result.calculatedAt)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Reference Quantity"
          value={formatNullableNumber(quantity, 0)}
          tone={view.tone}
          sublabel="Maximum under all explicit controls"
        />
        <MetricCard
          label="Current Ask Reference"
          value={formatNullablePrice(result.premiumRiskReference.premiumPriceReference)}
          sublabel="Not a guaranteed fill"
        />
        <MetricCard
          label="Planned Structural Loss / Contract"
          value={formatNullablePrice(
            result.premiumRiskReference.plannedStructuralLossReferencePerContractDollars,
          )}
          sublabel="Used for risk capacity"
          tone="bear"
        />
        <MetricCard
          label="Full Premium Exposure / Contract"
          value={formatNullablePrice(
            result.premiumRiskReference.fullPremiumLossReferencePerContractDollars,
          )}
          sublabel="Catastrophic capital exposure"
        />
        <MetricCard
          label="$50 Bid Backstop"
          value={formatNullablePrice(
            result.premiumRiskReference.hardLossBackstopExitPremium,
          )}
          sublabel="Manual exit reference; no automated order"
          tone="bear"
        />
        <MetricCard
          label="Schwab Available Cash"
          value={formatNullablePrice(result.accountContext.availableCashDollars)}
          sublabel={formatControlLabel(result.accountContext.availableCashSource)}
        />
        <MetricCard
          label="Effective Risk Budget"
          value={formatNullablePrice(result.budgets.effectiveRiskBudgetDollars)}
          sublabel={joinControls(result.budgets.limitingRiskControls)}
        />
        <MetricCard
          label="Effective Capital Budget"
          value={formatNullablePrice(result.budgets.effectiveCapitalBudgetDollars)}
          sublabel={joinControls(result.budgets.limitingCapitalControls)}
        />
        <MetricCard
          label="Total Premium Debit Reference"
          value={formatNullablePrice(
            result.positionReferences.totalPremiumDebitReferenceDollars,
          )}
          sublabel="Reference only"
        />
        <MetricCard
          label="Total Planned Structural Risk"
          value={formatNullablePrice(
            result.positionReferences.totalPlannedStructuralLossReferenceDollars,
          )}
          sublabel="Quantity × modeled structural loss"
          tone="bear"
        />
        <MetricCard
          label="Account Equity Risk Reference"
          value={formatNullablePercent(
            result.positionReferences.riskPercentOfAccountEquity,
          )}
          sublabel="Planned structural risk / caller equity"
        />
        <MetricCard
          label="Account Equity Capital Reference"
          value={formatNullablePercent(
            result.positionReferences.capitalPercentOfAccountEquity,
          )}
          sublabel="Full premium debit / caller equity"
        />
      </div>

      {result.quantityCalculation.blockingControls.length > 0 ? (
        <div className="rounded-md border border-bear/30 bg-bear-muted/20 p-3 text-xs">
          <p className="font-semibold text-bear">Blocking controls</p>
          <p className="mt-1 font-mono text-muted-foreground">
            {joinControls(result.quantityCalculation.blockingControls)}
          </p>
        </div>
      ) : null}

      <details className="group rounded-md border border-panel-border bg-background/30 p-3 text-xs">
        <summary className="cursor-pointer select-none font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent">
          View sanitized broker provenance and sizing controls
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ResultDetails
            title="Broker snapshot"
            rows={[
              ["Requested", broker.requested ? "Yes" : "No"],
              ["Used for sizing", broker.usedForSizing ? "Yes" : "No"],
              ["Snapshot state", broker.snapshotState],
              ["Account type", broker.accountType ?? "—"],
              ["Linked accounts", formatNullableNumber(broker.linkedAccountCount, 0)],
              ["Balances fetched", formatNullableTimestamp(broker.accountBalancesFetchedAt)],
            ]}
          />
          <ResultDetails
            title="Quantity controls"
            rows={[
              ["Permitted by risk", formatNullableNumber(result.quantityCalculation.contractsPermittedByRisk, 0)],
              ["Permitted by capital", formatNullableNumber(result.quantityCalculation.contractsPermittedByCapital, 0)],
              ["Policy maximum", formatNullableNumber(result.quantityCalculation.maximumContractsPolicyLimit, 0)],
              ["Limiting controls", joinControls(result.quantityCalculation.limitingQuantityControls)],
              ["Revalidation required", result.revalidation.required ? "Yes" : "No"],
            ]}
          />
          <ResultDetails
            title="Selected contract"
            rows={[
              ["Symbol", result.selectedContract.contractSymbol ?? "—"],
              ["Direction", result.selectedContract.contractDirection ?? "—"],
              ["Strike", formatNullablePrice(result.selectedContract.strikePrice)],
              ["Expiration", result.selectedContract.expirationDate ?? "—"],
              ["Quote freshness", result.selectedContract.quoteFreshnessState ?? "—"],
              ["Quote time", formatNullableTimestamp(result.selectedContract.quoteAt)],
              ["Planned structural loss", formatNullablePrice(result.selectedContract.estimatedPlannedStructuralLossDollars)],
              ["Hard-loss bid backstop", formatNullablePrice(result.selectedContract.hardLossBackstopExitPremium)],
            ]}
          />
        </div>
      </details>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Quantity is a deterministic reference only. The full premium remains possible catastrophic loss, while risk sizing uses the conservative modeled loss at SPY structural invalidation. Revalidate the current ask before any independently entered order. The $50 bid backstop is a manual alert reference; this dashboard does not create, preview, or transmit orders.
      </p>
    </div>
  );
}

function joinControls(values: readonly string[]): string {
  if (values.length === 0) return "None";
  return values.map(formatControlLabel).join(", ");
}

function ResultDetails({
  title,
  rows,
}: {
  title: string;
  rows: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div className="min-w-0 rounded-md border border-panel-border bg-background/40 p-3">
      <p className="font-semibold">{title}</p>
      <dl className="mt-2 space-y-1 text-muted-foreground">
        {rows.map(([label, value]) => (
          <div key={label} className="grid min-w-0 grid-cols-[auto_1fr] gap-2">
            <dt>{label}</dt>
            <dd className="min-w-0 break-words text-right font-mono text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
