// 검증 화면의 분모·빈 상태·계약 실패를 실제 응답 형태로 확인한다.
// @vitest-environment jsdom
import type {
  BacktestSummary,
  ModelCard,
  PreregistrationScores,
} from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { getBacktest } from "../../../lib/validation/api";
import { EvidenceDashboard } from "../evidence-dashboard";
import { GoldenCases } from "../golden-cases";
import { ModelDetails } from "../model-details";
import { PerformanceMetrics } from "../performance-metrics";
import { PredictionScatter } from "../prediction-scatter";
import { PreregistrationBoard } from "../preregistration-board";
import { backtest, usage } from "./validation-fixtures";

const ready = <T,>(value: T) => ({ status: "ready" as const, value });
const html = (node: React.ReactNode) => renderToStaticMarkup(node);
type GoldenCase = BacktestSummary["golden"][number];

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

// 산점도 점 수와 표 전환은 같은 표본을 사용한다.
it("산점도의 점 수·로그 축·표 보기를 보존한다", async () => {
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () =>
    root.render(<PredictionScatter state={ready(backtest)} />),
  );
  expect(node.querySelectorAll("[data-point]")).toHaveLength(1);
  expect(node.textContent).toContain("로그 축");
  expect(node.textContent).toContain("예측 대상 · 실측 대상1건");
  expect(node.textContent).toContain(
    "실측 대상 미만 0건이라 경계 구분은 아직 볼 수 없어요",
  );
  await act(async () => node.querySelector("button")?.click());
  expect(node.querySelector("table")?.textContent).toContain(
    "부산국제록페스티벌",
  );
  await act(async () => root.unmount());
});

// 로그 축에서는 0을 최솟값으로 속이지 않고 표의 원본 값에 접근하게 한다.
it("p10이 0이면 수염을 화살표로 표시하고 표에는 0을 남긴다", async () => {
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () =>
    root.render(
      <PredictionScatter
        state={ready({
          ...backtest,
          points: [{ ...backtest.points[0], p10: 0 }],
        })}
      />,
    ),
  );
  expect(node.querySelectorAll("[data-point]")).toHaveLength(1);
  expect(node.textContent).toContain("0 이하 — 표 참고");
  expect(node.querySelector(".validation-whisker")?.getAttribute("x1")).toBe(
    "100",
  );
  await act(async () => node.querySelector("button")?.click());
  const table = node.querySelector(
    '[role="region"][aria-label="예측·실측 표, 좌우로 스크롤"]',
  );
  expect(table?.textContent).toContain("0~24,293");
  expect(table?.getAttribute("tabindex")).toBe("0");
  await act(async () => root.unmount());
});

// 양수 점이 하나도 없어도 표 전환으로 모든 원본 값을 볼 수 있게 한다.
it("전부 0인 표본은 차트 빈 상태와 원본 표를 함께 제공한다", async () => {
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () =>
    root.render(
      <PredictionScatter
        state={ready({
          ...backtest,
          points: [
            { ...backtest.points[0], p10: 0, p50: 0, p90: 0, actual: 0 },
          ],
        })}
      />,
    ),
  );
  expect(node.textContent).toContain("로그 축에 표시할 양수 표본이 없어요");
  await act(async () => node.querySelector("button")?.click());
  expect(node.querySelector("table")?.textContent).toContain(
    "부산국제록페스티벌",
  );
  expect(node.querySelectorAll("td")).toHaveLength(5);
  await act(async () => root.unmount());
});

// 옛 계약 응답과 혼합 응답은 사분면을 추측하지 않는다.
it("환산 등급이 빠지면 사분면 집계를 보류한다", () => {
  const output = html(
    <PredictionScatter
      state={ready({
        ...backtest,
        points: backtest.points.map((point) => ({
          ...point,
          level: undefined,
          actualLevel: undefined,
        })),
      })}
    />,
  );
  expect(output).toContain("등급 자료가 없어 보류해요");
  expect(output).not.toContain("예측 대상 · 실측 대상");
});

// 골든 자료와 발행 문장의 실제 부재는 숫자 비율을 만들지 않는다.
it("골든 0건 고지와 분모 없는 근거 상태를 표시한다", () => {
  expect(html(<GoldenCases state={ready(backtest)} />)).toContain(
    "골든 사례 0건 — 사례 재현 검증 전 임시 사용",
  );
  const output = html(
    <EvidenceDashboard state={ready({ ...usage, publishedClaims: 0 })} />,
  );
  expect(output).toContain("발행 문장이 아직 없어요");
  expect(output).toContain("0건");
  expect(output).toContain("검증 기록 없음");
  expect(output).not.toContain("0.0%");
});

// 데이터랩 도달과 전체 연결은 서로 다른 분자를 쓴다.
it("두 근거 비율을 분리한다", () => {
  const output = html(<EvidenceDashboard state={ready(usage)} />);
  expect(output).toContain("80.0%");
  expect(output).toContain("30.0%");
  expect(output).toContain("방문자");
  expect(output).toContain("0건");
});

// 데이터랩 메뉴 여부와 관계없이 모든 데이터셋과 0건 행을 남긴다.
it("근거 데이터셋 전체를 메뉴가 있는 순서로 표시한다", () => {
  const datasets = [
    { datasetId: "ds-other", title: "기상 관측", datalabMenu: null, count: 0 },
    {
      datasetId: "ds-visitors",
      title: "지역별 방문자 수",
      datalabMenu: "방문자 수",
      count: 2,
    },
  ];
  const output = html(
    <EvidenceDashboard
      state={ready({ ...usage, evidenceByDataset: datasets })}
    />,
  );
  expect(output).toContain("기상 관측");
  expect(output).toContain("0건");
  expect(output.indexOf("지역별 방문자 수")).toBeLessThan(
    output.indexOf("기상 관측"),
  );
  expect(output).toContain("validation-datalab-menu");
});

// 모델 notes의 공백과 문단 구분은 원문을 고치지 않는다.
it("모델 카드의 한계 원문을 보존한다", () => {
  const notes = "첫 문단입니다.\n\n둘째 문단입니다.";
  const card = {
    id: "mr-v1-f0667d86aafd47d09472",
    target: "일평균 방문객",
    createdAt: "2026-09-25T12:00:00+09:00",
    modelVersion: "v1-cf776619db785ed12810",
    trainRange: { from: "2022", to: "2024" },
    evalYears: [2025],
    backtestRunId: backtest.runId,
    features: ["행사 유형"],
    notes,
  } as ModelCard;
  const output = html(<ModelDetails state={ready(card)} goldenEmpty />);
  expect(output).toContain(notes);
  expect(output).toContain("골든 사례 0건 — 사례 재현 검증 전 임시 사용");
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

// 골든 실측·주최 예상은 공용 포매터로 추정 여부와 대표값(value 없으면 p50)을 보존한다.
it("골든 수치의 추정 표시와 중앙값 대체를 보존한다", () => {
  const quantity: GoldenCase["actual"] = {
    id: "q-yeongjong-2024-actual",
    name: "보도 인원",
    value: null,
    p10: null,
    p50: 30000,
    p90: null,
    unit: "명",
    timeUnit: "순간",
    spatialScope: "행사장",
    valueKind: "사후집계",
    estimated: true,
    assumptionIds: [],
    announcedAt: null,
  };
  const golden: GoldenCase = {
    eventId: "e-yeongjong-2024",
    name: "영종 불꽃축제",
    hostExpected: {
      ...quantity,
      id: "q-yeongjong-2024-host",
      p50: 2000,
      estimated: false,
    },
    model: { p10: 10000, p50: 20000, p90: 40000, unit: "명", timeUnit: "순간" },
    actual: quantity,
    unitsComparable: true,
    verdict: "포함",
  };
  const output = html(
    <GoldenCases state={ready({ ...backtest, golden: [golden] })} />,
  );
  expect(output).toContain("3만");
  expect(output).toContain("추정");
  expect(output).not.toContain("—");
  expect(output).toContain('aria-label="골든 사례 표, 좌우로 스크롤"');
});
