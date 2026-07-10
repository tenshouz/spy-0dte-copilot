import { create } from "zustand";

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
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  activeReportId: null,
  setActiveReportId: (id) => set({ activeReportId: id }),
}));
