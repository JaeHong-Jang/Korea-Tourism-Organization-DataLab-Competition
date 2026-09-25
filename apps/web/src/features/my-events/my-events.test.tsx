// 계약 픽스처로 표 정렬·재예보 수치·실측 검증·오류 문장을 확인한다.
import type {
  Event,
  ForecastReport,
  ReforecastResult,
} from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import eventFixture from "../../../../../packages/contracts/fixtures/event/valid-yeongjong.json";
import reportFixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import resultFixture from "../../../../../packages/contracts/fixtures/reforecast-result/valid-weather-applied.json";
import {
  MyEventsApiError,
  postActual,
  postReforecast,
} from "../../lib/my-events-api";
import { actualQuantity } from "./actual-form";
import { changedCondition, reforecastError } from "./event-detail";
import { orderedSnapshots, type SavedEvent, sortAndFilter } from "./event-list";
import { ReforecastCard } from "./reforecast-card";
import { SharedReport } from "./shared-report";

const event = eventFixture as Event;
const report = reportFixture as unknown as ForecastReport;

// 응답 순서와 무관하게 발행 순으로 타임라인에 넘긴다.
it("스냅샷을 발행 시각 순으로 놓고 최신 발행으로 표를 정렬한다", () => {
  const older = { ...report, publishedAt: "2025-10-01T09:00:00+09:00" };
  const newer = { ...report, publishedAt: "2025-10-11T09:00:00+09:00" };
  expect(
    orderedSnapshots([newer, older]).map((item) => item.publishedAt),
  ).toEqual([older.publishedAt, newer.publishedAt]);
  const other = {
    ...event,
    id: "e-busan-2025",
    name: "부산 바다축제",
    startsAt: "2025-10-17T09:00:00+09:00",
    endsAt: "2025-10-17T21:00:00+09:00",
  };
  const rows: SavedEvent[] = [
    { event, snapshots: [newer] },
    { event: other, snapshots: [older] },
  ];
  expect(
    sortAndFilter(rows, "date", "전체", new Set()).map((item) => item.event.id),
  ).toEqual([other.id, event.id]);
  expect(
    sortAndFilter(rows, "forecast", "전체", new Set()).map(
      (item) => item.event.id,
    ),
  ).toEqual([event.id, other.id]);
  expect(
    sortAndFilter(rows, "date", "실측 입력됨", new Set([event.id])).map(
      (item) => item.event.id,
    ),
  ).toEqual([event.id]);
});

// 변화 카드의 인원은 비교 응답의 p50 값을 그대로 표기한다.
it("재예보 카드에 계약 숫자·날씨 근거 링크를 보인다", () => {
  const html = renderToStaticMarkup(
    <ReforecastCard result={resultFixture as ReforecastResult} />,
  );
  expect(html).toContain("21,000");
  expect(html).toContain("18,500");
  expect(html).toContain("52,000");
  expect(html).toContain("46,000");
  expect(html).toContain("ev-weather-yeongjong-2025-r2");
  expect(html).toContain("/f/f-yeongjong-2025-r2#evidence-");
});

// 게이트의 code와 message를 함께 유지하고 연결 오류는 구별한다.
it("재예보 409 이유와 404·503 상태를 구별한다", () => {
  expect(
    reforecastError(new MyEventsApiError(409, "gate_b · 근거 검증 실패")),
  ).toContain("gate_b");
  expect(reforecastError(new MyEventsApiError(404, "없음"))).toContain(
    "찾지 못했어요",
  );
  expect(reforecastError(new MyEventsApiError(503, "연결 실패"))).toContain(
    "연결할 수 없어요",
  );
});

// 게이트 실패 응답의 code·message를 화면 오류까지 전달한다.
it("재예보 409 응답에서 게이트 이름을 보존한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: "gate_b", message: "근거 검증 실패" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
  );
  try {
    await expect(postReforecast(event.id)).rejects.toThrow(
      "gate_b · 근거 검증 실패",
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

// 실측의 양수·단위·출처·범위는 저장 요청 전에 확정한다.
it("실측은 양수만 허용하고 항목에 맞는 단위를 붙인다", () => {
  expect(() => actualQuantity(event, "daily", "0", "관측", "행사장")).toThrow(
    "0보다 큰",
  );
  expect(() => actualQuantity(event, "peak", "-1", "관측", "행사장")).toThrow(
    "0보다 큰",
  );
  const actual = actualQuantity(event, "daily", "1250", "사후집계", "시군구");
  expect(actual).toMatchObject({
    value: 1250,
    unit: "명/일",
    timeUnit: "일",
    spatialScope: "시군구",
    valueKind: "사후집계",
    estimated: false,
  });
});

// 저장 요청은 기록 서비스가 받는 quantity 본문만 전송한다.
it("실측 POST는 단위와 관측 범위를 계약 본문에 넣는다", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    await postActual(
      event.id,
      actualQuantity(event, "peak", "18500", "관측", "행사장"),
    );
    expect(fetcher.mock.calls[0][0]).toBe("/api/records/actuals");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      eventId: event.id,
      actual: {
        value: 18500,
        unit: "명",
        timeUnit: "순간",
        spatialScope: "행사장",
        valueKind: "관측",
      },
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

// 공유 문서에는 발행 수치와 근거만 있으며 후속 행동 버튼은 없다.
it("공유 예보서는 읽기 전용으로 판정·수치·근거를 보여 준다", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <SharedReport report={report} />
    </MemoryRouter>,
  );
  expect(html).toContain("공유된 예보서 · 읽기 전용");
  expect(html).toContain("21,000");
  expect(html).toContain("근거 서랍");
  expect(html).not.toContain("계획 초안 docx 받기");
  expect(html).not.toContain("재예보");
  expect(html).not.toContain("실측 저장");
});

// what-if 예보가 저장 행사 이력에 붙으면 조건이 바뀐 것만 표시한다
it("이력의 행사 조건이 저장 행사와 다를 때만 조건 바꿈으로 본다", () => {
  const saved = event;
  expect(changedCondition(saved, saved)).toBe(false);
  expect(
    changedCondition(
      { ...saved, startsAt: "2025-10-19T19:00:00+09:00" },
      saved,
    ),
  ).toBe(true);
  expect(changedCondition({ ...saved, fee: "유료" }, saved)).toBe(true);
});
