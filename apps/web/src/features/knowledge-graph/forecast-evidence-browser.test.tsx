// 행사·발행 선택에서 지연 응답과 실패가 다른 기록을 섞지 않는지 검증한다.
// @vitest-environment jsdom
import type { ForecastReport } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import { getForecastReport } from "../../lib/api-client";
import { getEventSnapshots, getSavedEvents } from "../../lib/my-events-api";
import { ForecastEvidenceBrowser } from "./forecast-evidence-browser";

vi.mock("../../lib/api-client", () => ({ getForecastReport: vi.fn() }));
vi.mock("../../lib/my-events-api", () => ({
  getSavedEvents: vi.fn(),
  getEventSnapshots: vi.fn(),
}));
const older = fixture as unknown as ForecastReport;
const newer = structuredClone(older);
newer.forecastId = "f-yeongjong-new";
newer.publishedAt = "2026-09-27T12:30:00+09:00";
newer.forecast.peakConcurrent.p50 = 22222;
const second = structuredClone(older);
second.event.id = "e-jeongseon";
second.event.name = "정선아리랑제";
second.forecastId = "f-jeongseon";
second.forecast.peakConcurrent.p50 = 14850;
let root: Root;
let container: HTMLDivElement;
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 예보별로 다른 인원을 제공해 선택 뒤 이전 숫자가 남는 문제를 찾는다.
beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(getSavedEvents).mockResolvedValue([older.event, second.event]);
  vi.mocked(getEventSnapshots).mockImplementation(async (id) =>
    id === second.event.id ? [second] : [older, newer],
  );
  vi.mocked(getForecastReport).mockImplementation(async (id) =>
    id === newer.forecastId ? newer : older,
  );
});

// 비동기 완료 뒤에도 다른 테스트의 화면 상태가 남지 않게 닫는다.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

// 주소로 진입한 상태와 실제 선택 이벤트를 같은 React 경로로 검증한다.
async function render(path = "/graph") {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ForecastEvidenceBrowser />
      </MemoryRouter>,
    ),
  );
}

// 선택 변경은 URL을 통해 요청을 다시 시작한다.
async function choose(index: number, value: string) {
  await act(async () => {
    const select = container.querySelectorAll("select")[index];
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

it("기본 최신 기록과 직접 링크로 연 과거 기록을 구별한다", async () => {
  await render(
    `/graph?eventId=${older.event.id}&forecastId=${older.forecastId}`,
  );
  expect(container.textContent).toContain("21,000 명");
  expect(container.textContent).not.toContain("22,222 명");
  await choose(1, newer.forecastId);
  expect(container.textContent).toContain("22,222 명");
  expect(container.textContent).not.toContain("21,000 명");
});

it("행사를 바꾸면 이전 행사의 발행 식별자와 수치를 지운다", async () => {
  await render(`/graph?forecastId=${older.forecastId}`);
  await choose(0, second.event.id);
  expect(container.textContent).toContain("정선아리랑제");
  expect(container.textContent).toContain("14,850 명");
  expect(container.textContent).not.toContain("21,000 명");
});

// 시차 표기가 다른 발행 기록도 실제 시간순으로 비교한다.
it("발행 시각의 시간대가 달라도 최신 기록을 고른다", async () => {
  vi.mocked(getEventSnapshots).mockResolvedValue([
    older,
    { ...newer, publishedAt: "2026-09-24T12:00:00Z" },
  ]);
  await render();
  expect(container.textContent).toContain("22,222 명");
  expect(container.textContent).not.toContain("21,000 명");
});

it("늦게 도착한 이전 요청이 현재 선택한 예보를 덮지 않는다", async () => {
  let finish: (report: ForecastReport) => void = () => {};
  vi.mocked(getForecastReport).mockImplementation((id) =>
    id === newer.forecastId
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(older),
  );
  await render(
    `/graph?eventId=${older.event.id}&forecastId=${newer.forecastId}`,
  );
  await choose(1, older.forecastId);
  await act(async () => finish(newer));
  expect(container.textContent).toContain("21,000 명");
  expect(container.textContent).not.toContain("22,222 명");
});

it("없는 발행 링크를 최신 예보로 바꿔 보여 주지 않는다", async () => {
  vi.mocked(getForecastReport).mockRejectedValue(new Error("기록 없음"));
  await render(`/graph?eventId=${older.event.id}&forecastId=f-missing`);
  expect(container.textContent).toContain("요청한 예보를 불러오지 못했어요");
  expect(container.textContent).not.toContain("22,222 명");
});

it("행사 목록과 이력이 실패해도 직접 연 발행본을 볼 수 있다", async () => {
  vi.mocked(getSavedEvents).mockRejectedValue(new Error("목록 실패"));
  vi.mocked(getEventSnapshots).mockRejectedValue(new Error("이력 실패"));
  await render(`/graph?forecastId=${older.forecastId}`);
  expect(container.textContent).toContain("21,000 명");
  expect(container.textContent).toContain("이력 재시도");
});

it("발행 이력이 없으면 예보를 만들지 않고 빈 상태를 안내한다", async () => {
  vi.mocked(getEventSnapshots).mockResolvedValue([]);
  await render();
  expect(container.textContent).toContain("아직 발행된 예보가 없어요");
  expect(container.querySelector(".snapshot-path")).toBeNull();
});

it("행사와 발행본이 다른 주소는 섞어 표시하지 않는다", async () => {
  await render(
    `/graph?eventId=${second.event.id}&forecastId=${older.forecastId}`,
  );
  expect(container.textContent).toContain(
    "주소의 행사와 발행 예보가 일치하지 않아요",
  );
  expect(container.querySelector(".snapshot-path")).toBeNull();
});
