// 행사 선택과 필터 변경이 서로의 값을 지우지 않는지 확인한다.
import { beforeEach, describe, expect, it } from "vitest";
import { useSelectionStore } from "../src/lib/selection-store";

// 매 검사 전에 선택 상태를 비워 검사 순서의 영향을 없앤다.
beforeEach(() => {
  useSelectionStore.getState().selectFestival(null);
  useSelectionStore.getState().clearFilters();
});

describe("선택 스토어", () => {
  // 행사 선택과 필터 합성이 각 웹 레인의 상태를 보존한다.
  it("선택과 필터를 따로 갱신한다", () => {
    useSelectionStore.getState().selectFestival("영종씨사이드파크");
    useSelectionStore.getState().setFilters({ sido: "인천광역시" });
    useSelectionStore.getState().setFilters({ type: "불꽃" });
    expect(useSelectionStore.getState().selectedFestivalId).toBe(
      "영종씨사이드파크",
    );
    expect(useSelectionStore.getState().filters).toMatchObject({
      sido: "인천광역시",
      type: "불꽃",
    });
    useSelectionStore.getState().clearFilters();
    expect(useSelectionStore.getState().filters.sido).toBeNull();
    expect(useSelectionStore.getState().selectedFestivalId).toBe(
      "영종씨사이드파크",
    );
  });
});
