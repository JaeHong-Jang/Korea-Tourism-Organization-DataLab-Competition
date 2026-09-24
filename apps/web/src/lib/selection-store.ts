// 웹 레인 사이에서 행사 선택과 필터만 공유한다.
import { create } from "zustand";

export type FestivalFilters = {
  period: string | null;
  sido: string | null;
  type: string | null;
  level: number | null;
};

type SelectionState = {
  selectedFestivalId: string | null;
  selectedSigunguCode: string | null;
  filters: FestivalFilters;
  selectFestival: (festivalId: string | null) => void;
  selectSigungu: (code: string | null) => void;
  setFilters: (changes: Partial<FestivalFilters>) => void;
  clearFilters: () => void;
};

const emptyFilters: FestivalFilters = {
  period: null,
  sido: null,
  type: null,
  level: null,
};

// 다른 레인은 공개된 동작만 호출해 선택 상태를 바꾼다.
export const useSelectionStore = create<SelectionState>((set) => ({
  selectedFestivalId: null,
  selectedSigunguCode: null,
  filters: emptyFilters,
  selectFestival: (selectedFestivalId) => set({ selectedFestivalId }),
  selectSigungu: (selectedSigunguCode) => set({ selectedSigunguCode }),
  setFilters: (changes) =>
    set((state) => ({ filters: { ...state.filters, ...changes } })),
  clearFilters: () => set({ filters: emptyFilters }),
}));
