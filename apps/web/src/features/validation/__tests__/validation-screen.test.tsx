// 검증 화면의 분모·빈 상태·계약 실패를 실제 응답 형태로 확인한다.
// @vitest-environment jsdom
import type { PreregistrationScores } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { getBacktest } from "../../../lib/validation/api";
import { FestivalVisitorsChart } from "../festival-visitors-chart";
import { festivalVisitors } from "../festival-visitors-data";
import { PerformanceMetrics } from "../performance-metrics";
import { PreregistrationBoard } from "../preregistration-board";
import { backtest } from "./validation-fixtures";

const ready = <T,>(value: T) => ({ status: "ready" as const, value });
const html = (node: React.ReactNode) => renderToStaticMarkup(node);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

// 지표는 비율만 백분율로 바꾸고 비교 불가 값을 0으로 그리지 않는다.
it("포함률·표본·경계 한계와 기준선 비교 쌍을 함께 읽는다", () => {
  const output = html(<PerformanceMetrics state={ready(backtest)} />);
  expect(output).toContain("57.0%");
  expect(output).toContain("(49/86)");
  expect(output).toContain("평가 N 86건 (골드 1 · 실버 85)");
  expect(output).toContain(
    "실측 대상 미만 0건 — 경계 성능은 아직 말할 수 없어요",
  );
  expect(output).toContain("비교 쌍 없음");
  expect(output).toContain("2024년 학습 표본 부족");
  expect(output).toContain("명절 실버 등 채점 불가 34건");
});

// 2017~2025년 실제 점 9개와 2026년 예측 점을 그리고, 가리키면 보고 축제 수를 보인다.
it("축제 총 방문객 추이와 2026 예측을 그리고 표 보기를 보존한다", async () => {
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () => root.render(<FestivalVisitorsChart />));
  const years = [...node.querySelectorAll("[data-year]")].map((item) =>
    item.getAttribute("data-year"),
  );
  expect(years).toEqual([
    ...festivalVisitors.points.map((point) => String(point.year)),
    "2026",
  ]);
  expect(node.querySelectorAll(".festival-point.is-forecast")).toHaveLength(1);
  expect(
    node.querySelector(".festival-line")?.getAttribute("points")?.split(" "),
  ).toHaveLength(10);
  await act(async () =>
    node
      .querySelector('[data-year="2025"]')
      ?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })),
  );
  expect(
    node.querySelector('[data-year="2025"]')?.getAttribute("aria-label"),
  ).toContain("보고 축제 1,181개");
  expect(node.querySelector(".validation-point-detail")).toBeNull();
  expect(node.textContent).toContain("총 방문객 (명)");
  await act(async () => node.querySelector("button")?.click());
  const rows = node.querySelectorAll("tbody tr");
  expect(rows).toHaveLength(10);
  expect(rows[9].textContent).toContain("예측");
  await act(async () => root.unmount());
});

// API 미구현과 계약 오류는 견본 숫자를 대신 보여 주지 않는다.
it("API 실패는 빈 상태, 계약 위반은 오류로 남긴다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }),
  );
  await expect(getBacktest()).rejects.toThrow("503");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...backtest,
        metrics: { ...backtest.metrics, coverage80: 57 },
      }),
    }),
  );
  await expect(getBacktest()).rejects.toThrow("API 계약 불일치");
  expect(html(<PerformanceMetrics state={{ status: "empty" }} />)).toContain(
    "백테스트 결과가 아직 공개되지 않았어요",
  );
  expect(html(<PerformanceMetrics state={{ status: "error" }} />)).toContain(
    "자료 형식을 확인할 수 없어요",
  );
});

// HTTP 200의 파싱 실패는 미공개 자료가 아니라 계약 오류로 전달한다.
it("깨진 JSON 응답을 계약 오류로 분류한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    }),
  );
  await expect(getBacktest()).rejects.toThrow(
    "API 계약 불일치: JSON 파싱 실패",
  );
});

// 사전 등록 실측은 같은 인원 수라도 집계 시간을 함께 보여 준다.
it("사전 등록 실측의 기간 누적 단위를 표시한다", () => {
  const scores = {
    registeredAt: "2026-09-29T12:00:00+09:00",
    tag: "v1",
    rulesDoc: "사전 등록 규칙",
    summary: {
      registered: 1,
      scored: 1,
      inInterval: 0,
      unscorable: 0,
      cancelled: 0,
    },
    entries: [
      {
        seq: 1,
        eventId: "e-2025-26530-356df7c5fd",
        name: "부산국제록페스티벌",
        startsAt: "2025-09-26T12:00:00+09:00",
        endsAt: "2025-09-28T23:00:00+09:00",
        leadDays: 14,
        level: 4,
        dailyMeanP10: 1000,
        dailyMeanP50: 2000,
        dailyMeanP90: 3000,
        actual: {
          id: "q-2025-26530-356df7c5fd",
          name: "실측 방문객",
          value: 5000,
          p10: null,
          p50: null,
          p90: null,
          unit: "명",
          timeUnit: "기간누적",
          spatialScope: "행사장",
          valueKind: "사후집계",
          estimated: false,
          assumptionIds: [],
          announcedAt: "2025-10-01",
        },
        status: "채점 완료",
        inInterval: false,
        levelMatch: null,
      },
    ],
  } as PreregistrationScores;
  const output = html(<PreregistrationBoard state={ready(scores)} />);
  expect(output).toContain("5,000명 (기간 누적 · 행사장)");
  expect(output).toContain('aria-label="사전 등록 채점 표, 좌우로 스크롤"');
});
