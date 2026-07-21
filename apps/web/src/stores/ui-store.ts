import { create } from "zustand";
import {
  DEFAULT_CHART_LEVEL_VISIBILITY,
  getChartLevelPreset,
  type ChartLevelKey,
  type ChartLevelPreset,
  type ChartLevelVisibility,
} from "@/lib/chart-level-visibility";

/**
 * Client-only UI state. Server/mock data (snapshots, reports, journal, alerts)
 * intentionally does NOT live here — that belongs to TanStack Query hooks in
 * src/hooks. This store is only for things the user controls in-browser.
 */
interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  activeReportId: string | null;
  setActiveReportId: (id: string | null) => void;

  chartLevelVisibility: ChartLevelVisibility;
  setChartLevelVisibility: (key: ChartLevelKey, visible: boolean) => void;
  setChartLevelPreset: (preset: ChartLevelPreset) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  activeReportId: null,
  setActiveReportId: (id) => set({ activeReportId: id }),

  chartLevelVisibility: { ...DEFAULT_CHART_LEVEL_VISIBILITY },
  setChartLevelVisibility: (key, visible) =>
    set((state) => ({
      chartLevelVisibility: { ...state.chartLevelVisibility, [key]: visible },
    })),
  setChartLevelPreset: (preset) =>
    set({ chartLevelVisibility: getChartLevelPreset(preset) }),
}));
