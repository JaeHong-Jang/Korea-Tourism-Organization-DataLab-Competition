// 웹 레인 사이에서 행사 선택·필터와 타임라인 원본 목록을 공유한다.

import type { FestivalSummary } from "@crowdcast/contracts/types";
import { create } from "zustand";

export type FestivalFilters = {
  period: string | null;
  sido: string | null;
  type: string | null;
  level: number | null;
};

type SelectionState = {
  timelineFestivals: FestivalSummary[];
  selectedFestivalId: string | null;
  selectedSigunguCode: string | null;
  filters: FestivalFilters;
  selectFestival: (festivalId: string | null) => void;
  selectSigungu: (code: string | null) => void;
  setFilters: (changes: Partial<FestivalFilters>) => void;
  clearFilters: () => void;
  setTimelineFestivals: (festivals: FestivalSummary[]) => void;
};

const emptyFilters: FestivalFilters = {
  period: null,
  sido: null,
  type: null,
  level: null,
};

// 다른 레인은 공개된 동작만 호출해 선택 상태를 바꾼다.
export const useSelectionStore = create<SelectionState>((set) => ({
  timelineFestivals: [],
  selectedFestivalId: null,
  selectedSigunguCode: null,
  filters: emptyFilters,
  selectFestival: (selectedFestivalId) => set({ selectedFestivalId }),
  selectSigungu: (selectedSigunguCode) => set({ selectedSigunguCode }),
  setFilters: (changes) =>
    set((state) => ({ filters: { ...state.filters, ...changes } })),
  clearFilters: () => set({ filters: emptyFilters }),
  setTimelineFestivals: (timelineFestivals) => set({ timelineFestivals }),
}));
