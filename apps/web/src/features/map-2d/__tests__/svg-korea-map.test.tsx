// SVG 지역의 클릭과 키보드 선택이 기존 행사 요약을 지우는지 확인한다.
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useSelectionStore } from "../../../lib/selection-store";
import { SvgKoreaMap } from "../svg-korea-map";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const topology = {
  type: "Topology",
  objects: {
    regions: {
      type: "GeometryCollection",
      geometries: [
        {
          type: "Polygon",
          arcs: [[0]],
          properties: { sgg: "11110", sidonm: "서울특별시", sggnm: "종로구" },
        },
      ],
    },
  },
  arcs: [
    [
      [126, 37],
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ],
  ],
};

// 지도 요청 가짜 응답을 치우고 공유 선택 상태를 되돌린다.
afterEach(() => {
  vi.unstubAllGlobals();
  useSelectionStore.getState().selectFestival(null);
  useSelectionStore.getState().selectSigungu(null);
  useSelectionStore.getState().clearFilters();
});

// 같은 시도를 고를 때도 이전 행사 선택을 반드시 비운다.
it("SVG 지역 클릭과 Enter가 행사 선택을 해제한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => topology }),
  );
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () => root.render(<SvgKoreaMap festivals={[]} />));
  const region = node.querySelector<SVGPathElement>(
    '.svg-korea-map__regions [role="button"]',
  );
  expect(region).not.toBeNull();
  await act(async () =>
    useSelectionStore.getState().selectFestival("e-seoul-2025"),
  );
  await act(async () =>
    region?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(useSelectionStore.getState().selectedFestivalId).toBeNull();
  expect(useSelectionStore.getState().selectedSigunguCode).toBe("11110");
  await act(async () =>
    useSelectionStore.getState().selectFestival("e-seoul-2025"),
  );
  await act(async () =>
    region?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(useSelectionStore.getState().selectedFestivalId).toBeNull();
  await act(async () => root.unmount());
});
