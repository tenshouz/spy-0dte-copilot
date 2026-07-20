import type {
  SystemDataProbeComponentState,
  SystemDataProbeState,
  SystemReadinessCheckState,
  SystemReadinessEngineState,
} from "@spy-copilot/shared";

export type ReadinessTone = "bull" | "wait" | "bear" | "default";

export function readinessEngineLabel(state: SystemReadinessEngineState): string {
  return {
    READY: "Ready",
    DEGRADED: "Degraded",
    BLOCKED: "Blocked",
  }[state];
}

export function readinessEngineTone(state: SystemReadinessEngineState): ReadinessTone {
  if (state === "READY") return "bull";
  if (state === "DEGRADED") return "wait";
  return "bear";
}

export function readinessCheckLabel(state: SystemReadinessCheckState): string {
  return { PASS: "Pass", WARNING: "Warning", FAIL: "Fail" }[state];
}

export function readinessCheckTone(state: SystemReadinessCheckState): ReadinessTone {
  if (state === "PASS") return "bull";
  if (state === "WARNING") return "wait";
  return "bear";
}

export function dataProbeLabel(state: SystemDataProbeState): string {
  return { PASS: "Passed", DEGRADED: "Degraded", FAIL: "Failed" }[state];
}

export function dataProbeTone(state: SystemDataProbeState): ReadinessTone {
  if (state === "PASS") return "bull";
  if (state === "DEGRADED") return "wait";
  return "bear";
}

export function dataProbeComponentLabel(
  state: SystemDataProbeComponentState,
): string {
  return {
    PASS: "Pass",
    DEGRADED: "Degraded",
    FAIL: "Fail",
    NOT_APPLICABLE: "Not applicable",
  }[state];
}

export function dataProbeComponentTone(
  state: SystemDataProbeComponentState,
): ReadinessTone {
  if (state === "PASS") return "bull";
  if (state === "DEGRADED" || state === "NOT_APPLICABLE") return "wait";
  return "bear";
}

export function formatReadinessTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
