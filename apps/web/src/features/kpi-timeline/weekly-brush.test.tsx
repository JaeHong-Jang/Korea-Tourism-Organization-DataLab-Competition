// 브러시 선택과 필터 패널의 기간 값이 같은 스토어를 오가는지 검증한다.
// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { filterFestivals } from "../../lib/festivals/filter-festivals";
import { sceneFestivals } from "../../lib/festivals/scene-fixture";
import { useSelectionStore } from "../../lib/selection-store";
import { WeeklyTimeline } from "./weekly-timeline";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const all = sceneFestivals("2026-10-18");

// 드래그가 주 경계의 custom 기간을 만들고 외부 기간 변경도 두 핸들에 반영한다.
it("드래그와 필터 패널 기간을 양방향으로 동기화한다", async () => {
  window.history.replaceState({}, "", "/?at=2026-10-18T12%3A00%3A00%2B09%3A00");
  useSelectionStore.getState().setTimelineFestivals(all);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<WeeklyTimeline festivals={all} />));
  const track = host.querySelector<HTMLButtonElement>(".weekly-brush__track");
  expect(track).not.toBeNull();
  if (!track) return;
  track.setPointerCapture = vi.fn();
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
    left: 0,
    width: 600,
  } as DOMRect);
  await act(async () =>
    track.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: 150 }),
    ),
  );
  await act(async () =>
    track.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 250 }),
    ),
  );
  await act(async () =>
    track.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, clientX: 250 }),
    ),
  );
  const period = useSelectionStore.getState().filters.period;
  expect(period).toBe("custom:2026-10-19:2026-11-01");
  expect(
    filterFestivals(all, useSelectionStore.getState().filters, "2026-10-18"),
  ).toHaveLength(14);
  await act(async () =>
    useSelectionStore.getState().setFilters({ period: "week" }),
  );
  expect(
    host.querySelector<HTMLInputElement>('input[aria-label="기간 시작 주"]')
      ?.value,
  ).toBe("0");
  expect(
    host.querySelector<HTMLInputElement>('input[aria-label="기간 끝 주"]')
      ?.value,
  ).toBe("0");
  await act(async () => root.unmount());
  host.remove();
});

afterEach(() => {
  useSelectionStore.getState().clearFilters();
  useSelectionStore.getState().setTimelineFestivals([]);
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});
