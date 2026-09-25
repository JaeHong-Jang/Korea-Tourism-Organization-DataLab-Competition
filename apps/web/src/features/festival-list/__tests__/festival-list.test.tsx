// 행사 목록의 방향키와 접기 상태가 선택·저장소에 미치는 영향을 확인한다.
// @vitest-environment jsdom
import type { FestivalSummary } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import fixture from "../../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";
import { useSelectionStore } from "../../../lib/selection-store";
import { FestivalList } from "../festival-list";
import { sortFestivals } from "../sort-festivals";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom에 없는 스크롤 동작은 카드 탐색 검증에 필요하지 않아 모의한다.
Object.defineProperty(Element.prototype, "scrollIntoView", {
  value: vi.fn(),
  configurable: true,
});

// 목록 방향키는 카드 선택만 바꾸고 전역 카메라로 기본 동작을 넘기지 않는다.
it("방향키로 다음 행사를 고르면 이벤트 기본 동작을 막는다", async () => {
  window.localStorage.clear();
  useSelectionStore.getState().selectFestival(null);
  const festivals = [
    fixture as FestivalSummary,
    {
      ...fixture,
      eventId: "e-incheon-port-festival-2025",
      name: "인천항 축제",
    } as FestivalSummary,
  ];
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () =>
    root.render(<FestivalList festivals={festivals} status="ready" />),
  );
  const first = node.querySelector<HTMLButtonElement>(".festival-list__pick");
  expect(first).not.toBeNull();
  const event = new KeyboardEvent("keydown", {
    key: "ArrowDown",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => first?.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(useSelectionStore.getState().selectedFestivalId).toBe(
    sortFestivals(festivals, "risk")[1].eventId,
  );
  const second = node.querySelectorAll<HTMLButtonElement>(
    ".festival-list__pick",
  )[1];
  const reverse = new KeyboardEvent("keydown", {
    key: "ArrowUp",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => second.dispatchEvent(reverse));
  expect(reverse.defaultPrevented).toBe(true);
  expect(useSelectionStore.getState().selectedFestivalId).toBe(
    sortFestivals(festivals, "risk")[0].eventId,
  );
  await act(async () => root.unmount());
});

// 접힌 목록은 본문을 숨기고 새 마운트에서도 저장된 접기 상태를 복원한다.
it("접기 버튼은 본문을 숨기고 상태를 기억한다", async () => {
  window.localStorage.clear();
  useSelectionStore.getState().selectFestival(null);
  const node = document.createElement("div");
  let root = createRoot(node);
  await act(async () =>
    root.render(
      <FestivalList festivals={[fixture as FestivalSummary]} status="ready" />,
    ),
  );
  await act(async () =>
    node.querySelector<HTMLButtonElement>(".festival-list__toggle")?.click(),
  );
  expect(
    node.querySelector(".festival-list__body")?.hasAttribute("hidden"),
  ).toBe(true);
  expect(
    node.querySelector(".festival-list__toggle")?.getAttribute("aria-expanded"),
  ).toBe("false");
  expect(window.localStorage.getItem("crowdcast:festival-list:collapsed")).toBe(
    "true",
  );
  await act(async () => root.unmount());
  root = createRoot(node);
  await act(async () =>
    root.render(
      <FestivalList festivals={[fixture as FestivalSummary]} status="ready" />,
    ),
  );
  expect(
    node.querySelector(".festival-list__body")?.hasAttribute("hidden"),
  ).toBe(true);
  await act(async () => root.unmount());
  window.localStorage.clear();
});
