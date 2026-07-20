"use client";

import { useEffect, useState } from "react";

export function getLiveDataAgeMs(fetchedAt: string | null, nowMs = Date.now()): number | null {
  if (!fetchedAt) return null;
  const fetchedAtMs = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedAtMs)) return null;
  return Math.max(0, nowMs - fetchedAtMs);
}

export function formatLiveDataAge(ageMs: number | null): string {
  if (ageMs === null) return "—";
  if (ageMs < 1_000) return "Now";

  const seconds = Math.floor(ageMs / 1_000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function useLiveDataAge(fetchedAt: string | null): {
  ageMs: number | null;
  label: string;
} {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const ageMs = getLiveDataAgeMs(fetchedAt, nowMs);
  return { ageMs, label: formatLiveDataAge(ageMs) };
}
