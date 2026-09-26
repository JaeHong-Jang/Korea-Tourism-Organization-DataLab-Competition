// 견본 30건의 필터·정렬·계약 실패와 선택 동작을 검증한다.
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FestivalFiltersPanel } from "../../features/festival-filters/festival-filters";
import { FestivalList } from "../../features/festival-list/festival-list";
import { sortFestivals } from "../../features/festival-list/sort-festivals";
import { KpiStrip } from "../../features/kpi-timeline/kpi-strip";
import { useSelectionStore } from "../selection-store";
import { filterFestivals } from "./filter-festivals";
import { sceneFestivals } from "./scene-fixture";
import { useUpcomingFestivals } from "./use-upcoming-festivals";

const today = "2026-10-18";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const all = sceneFestivals(today);
const empty = { period: null, sido: null, type: null, level: null };
let root: Root | null = null;
let host: HTMLDivElement | null = null;

// 브라우저 DOM에 실제 이벤트를 보내 스토어의 공개 동작을 검사한다.
async function render(view: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(view);
  });
  return host;
}

afterEach(async () => {
  if (root)
    await act(async () => {
      root?.unmount();
    });
  host?.remove();
  root = null;
  host = null;
  useSelectionStore.getState().clearFilters();
  useSelectionStore.getState().selectFestival(null);
  useSelectionStore.getState().selectSigungu(null);
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("S1 행사 패널", () => {
  // 하루 한 건인 견본의 기간·시도·등급 조합은 손으로 센 값과 같아야 한다.
  it("30건의 필터 조합과 KPI를 같은 목록에서 계산한다", async () => {
    expect(all).toHaveLength(30);
    const subset = filterFestivals(
      all,
      { period: "two-weeks", sido: "서울특별시", type: null, level: 1 },
      today,
    );
    expect(subset.map((festival) => festival.name)).toEqual([
      "견본 행사 1",
      "견본 행사 13",
    ]);
    const node = await render(
      <KpiStrip
        festivals={subset}
        receivedAt="2026-10-18T12:00:00+09:00"
        fixture
      />,
    );
    expect(node.textContent).toContain("예보 행사2건");
    expect(node.textContent).toContain("수립 대상0건");
    expect(
      filterFestivals(all, { ...empty, period: "week" }, today),
    ).toHaveLength(1);
    expect(
      filterFestivals(all, { ...empty, period: "month" }, today),
    ).toHaveLength(30);
    expect(
      filterFestivals(
        all,
        { ...empty, period: "custom:2026-10-20:2026-10-22" },
        today,
      ),
    ).toHaveLength(3);
    expect(
      filterFestivals(all, { ...empty, type: "불꽃" }, today),
    ).toHaveLength(5);
  });

  // 위험 순은 높은 등급부터, 날짜 순은 첫 행사부터 시작한다.
  it("위험 순과 날짜 순의 첫 카드를 구분한다", () => {
    expect(sortFestivals(all, "risk")[0].name).toBe("견본 행사 20");
    expect(sortFestivals(all, "date")[0].name).toBe("견본 행사 1");
  });

  // 오프셋이 다른 시각도 실제 시작 순간으로 비교해 날짜 순 동률을 푼다.
  it("다른 시간대의 시작일을 타임스탬프로 정렬한다", () => {
    const later = {
      ...all[0],
      eventId: "later",
      startsAt: "2026-10-18T16:00:00Z",
    };
    const earlier = {
      ...all[0],
      eventId: "earlier",
      startsAt: "2026-10-19T00:30:00+09:00",
    };
    expect(
      sortFestivals([later, earlier], "date").map((item) => item.eventId),
    ).toEqual(["earlier", "later"]);
    expect(
      sortFestivals([later, earlier], "risk").map((item) => item.eventId),
    ).toEqual(["earlier", "later"]);
  });

  // 조건 변경은 적용 개수를 늘리고 한 번에 초기화할 수 있어야 한다.
  it("필터의 적용 개수와 초기화를 동기화한다", async () => {
    const node = await render(<FestivalFiltersPanel all={all} />);
    const sido = node.querySelectorAll("select")[1];
    expect(sido.querySelectorAll("option")).toHaveLength(18);
    expect(sido.textContent).toContain("대구광역시 (0건)");
    await act(async () => {
      useSelectionStore
        .getState()
        .setFilters({ period: "week", level: 4, sido: "대구광역시" });
    });
    expect(node.textContent).toContain("적용 3개");
    expect((sido as HTMLSelectElement).value).toBe("대구광역시");
    await act(async () => {
      (node.querySelector("button") as HTMLButtonElement).click();
    });
    expect(node.textContent).toContain("적용 0개");
    expect(useSelectionStore.getState().filters).toEqual(empty);
  });

  // 카드 클릭은 행사와 시군구를 함께 선택하고 선택 상태를 강조한다.
  it("카드에서 두 선택 동작을 호출한다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const node = await render(
      <FestivalList festivals={all.slice(0, 1)} status="ready" />,
    );
    await act(async () => {
      (node.querySelector(".festival-list__pick") as HTMLButtonElement).click();
    });
    expect(useSelectionStore.getState().selectedFestivalId).toBe("e-scene-1");
    expect(useSelectionStore.getState().selectedSigunguCode).toBe("11110");
    expect(node.querySelector(".festival-list__items li")?.className).toBe(
      "is-selected",
    );
    expect(node.textContent).toContain("법정 기준 1,000명의 약");
    expect(node.querySelector(".range-bar__table summary")?.textContent).toBe(
      "값 표 보기",
    );
  });

  // API 미구현과 계약 위반은 각각 빈 상태와 오류 상태로 표시한다.
  it.each([
    [503, null, "예보가 준비되면 여기에 나타나요", true],
    [
      200,
      [{ eventId: "wrong" }],
      "행사 예보의 형식을 확인할 수 없어요.",
      false,
    ],
  ])(
    "API 응답 %i의 상태를 표시한다",
    async (status, body, message, showsZero) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(body), { status })),
      );
      function Screen() {
        const data = useUpcomingFestivals(empty);
        return (
          <>
            <KpiStrip
              festivals={data.festivals}
              receivedAt={data.receivedAt}
              fixture={false}
              status={data.status}
            />
            <FestivalList festivals={data.festivals} status={data.status} />
          </>
        );
      }
      const node = await render(<Screen />);
      expect(node.textContent?.includes("예보 행사0건")).toBe(showsZero);
      expect(node.textContent).toContain(message);
    },
  );
});
