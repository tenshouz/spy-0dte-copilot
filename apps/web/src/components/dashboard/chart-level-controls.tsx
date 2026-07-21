"use client";

import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CHART_LEVEL_KEYS,
  countSelectedChartLevels,
  type ChartLevelKey,
  type ChartLevelPreset,
} from "@/lib/chart-level-visibility";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

interface LevelOption {
  key: ChartLevelKey;
  label: string;
  color: string;
}

interface LevelGroup {
  label: string;
  options: readonly LevelOption[];
}

const LEVEL_GROUPS: readonly LevelGroup[] = [
  {
    label: "Market",
    options: [
      { key: "livePrice", label: "Live Price", color: "#3B9EFF" },
      { key: "vwap", label: "RTH VWAP", color: "#3B9EFF" },
    ],
  },
  {
    label: "Premarket",
    options: [
      { key: "premarketHigh", label: "PM High", color: "#A78BFA" },
      { key: "premarketLow", label: "PM Low", color: "#A78BFA" },
    ],
  },
  {
    label: "Previous Day",
    options: [
      { key: "previousHigh", label: "Prev High", color: "#C9CDD6" },
      { key: "previousLow", label: "Prev Low", color: "#C9CDD6" },
      { key: "previousClose", label: "Prev Close", color: "#C9CDD6" },
    ],
  },
  {
    label: "Opening Ranges",
    options: [
      { key: "openingRange5High", label: "OR5 High", color: "#22D3EE" },
      { key: "openingRange5Low", label: "OR5 Low", color: "#22D3EE" },
      { key: "openingRange15High", label: "OR15 High", color: "#F5A524" },
      { key: "openingRange15Low", label: "OR15 Low", color: "#F5A524" },
      { key: "openingRange30High", label: "OR30 High", color: "#FB7185" },
      { key: "openingRange30Low", label: "OR30 Low", color: "#FB7185" },
    ],
  },
  {
    label: "Pivots",
    options: [
      { key: "dailyPivot", label: "Daily Pivot", color: "#FACC15" },
      { key: "weeklyPivot", label: "Weekly Pivot", color: "#E879F9" },
    ],
  },
  {
    label: "Options Structure",
    options: [
      { key: "callWall", label: "Call Wall", color: "#22C55E" },
      { key: "putWall", label: "Put Wall", color: "#EF4444" },
      { key: "gammaBalance", label: "Gamma Balance", color: "#A78BFA" },
    ],
  },
] as const;

const PRESETS: readonly { value: ChartLevelPreset; label: string }[] = [
  { value: "CORE", label: "Core" },
  { value: "ALL", label: "All" },
  { value: "NONE", label: "None" },
];

export function ChartLevelControls() {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visibility = useUiStore((state) => state.chartLevelVisibility);
  const setVisibility = useUiStore((state) => state.setChartLevelVisibility);
  const applyPreset = useUiStore((state) => state.setChartLevelPreset);
  const selectedCount = countSelectedChartLevels(visibility);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2 font-mono text-[10px]"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Levels</span>
        <span className="tabular text-muted-foreground">{selectedCount}/{CHART_LEVEL_KEYS.length}</span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")}
          aria-hidden="true"
        />
      </Button>

      {isOpen && (
        <div
          role="group"
          aria-label="Chart level visibility"
          className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-panel-border bg-panel shadow-2xl shadow-black/40"
        >
          <div className="flex items-start justify-between gap-3 border-b border-panel-border px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-foreground">Chart Levels</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Shared by Dashboard and Market Data.
              </p>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">
              {selectedCount} selected
            </span>
          </div>

          <div className="flex gap-1.5 border-b border-panel-border px-3 py-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant="subtle"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => applyPreset(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="scrollbar-thin max-h-[min(31rem,calc(100vh-10rem))] overflow-y-auto p-2.5">
            <div className="space-y-3">
              {LEVEL_GROUPS.map((group) => (
                <fieldset key={group.label}>
                  <legend className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </legend>
                  <div className="grid grid-cols-2 gap-1">
                    {group.options.map((option) => {
                      const checked = visibility[option.key];
                      return (
                        <label
                          key={option.key}
                          className={cn(
                            "flex min-h-8 cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-[10px] transition-colors",
                            checked
                              ? "border-accent/35 bg-accent/10 text-foreground"
                              : "border-transparent text-muted-foreground hover:border-panel-border hover:bg-panel-hover hover:text-foreground",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={checked}
                            onChange={(event) => setVisibility(option.key, event.target.checked)}
                          />
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: option.color }}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          <span
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-panel",
                              checked
                                ? "border-accent bg-accent text-accent-foreground"
                                : "border-panel-border bg-background",
                            )}
                            aria-hidden="true"
                          >
                            {checked && <Check className="h-2.5 w-2.5" />}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
