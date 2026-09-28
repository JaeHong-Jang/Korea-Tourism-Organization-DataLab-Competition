// 인사이트의 자료 상태와 보고서 복사에 해석 한계가 보존되는지 확인한다.
// @vitest-environment jsdom
import type { DatalabSpec, Insight } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import specFixture from "../../../../../../packages/contracts/fixtures/datalab-spec/valid-example.json";
import { DatalabSpecTable } from "../datalab-spec-table";
import { InsightPredictionPatterns } from "../insight-prediction-patterns";
import { InsightReadiness } from "../insight-readiness";
import { InsightResults } from "../insight-results";
import { InsightSources } from "../insight-sources";
import { insight } from "./insight-fixtures";

const ready = <T,>(value: T) => ({ status: "ready" as const, value });
const html = (node: React.ReactNode) => renderToStaticMarkup(node);

// 표본이 맞는 반복 진단만 표시하고 누락된 근거는 숨긴다.
it("반복 진단은 실제 표본과 일치할 때만 표시한다", () => {
  const base = insight({ sampleSize: 2 });
  const value: Insight = {
    ...base,
    evidence: [
      {
        ...base.evidence[0],
        summary: JSON.stringify({
          predictionDiagnostics: {
            sampleSize: 2,
            dailyPatternCount: 1,
            peakPatternCount: 2,
            largeRuleCount: 2,
            outsideTrainingCount: 1,
          },
        }),
      },
    ],
  };
  const output = html(<InsightPredictionPatterns insight={value} />);
  expect(output).toContain("1가지 조합");
  expect(output).toContain("학습 자료가 부족하거나");
  expect(
    html(<InsightPredictionPatterns insight={{ ...value, sampleSize: 3 }} />),
  ).toBe("");
  expect(html(<InsightPredictionPatterns insight={base} />)).toBe("");
});
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 준비 중인 자료에는 고정 날짜나 복사할 가짜 결과를 표시하지 않는다.
it("빈 상태에 고정 날짜와 복사 버튼이 없고 다시 확인할 수 있다", () => {
  const output = html(
    <InsightResults first={{ status: "empty" }} second={{ status: "empty" }} />,
  );
  expect(output).not.toContain("9/27");
  expect(output.match(/자료 다시 확인/g)).toHaveLength(2);
  expect(output).not.toContain("분석 요약 복사");
});

// 누락 결과에 입력 일정이 분석 기간처럼 보이거나 무관한 진단 합계가 섞이지 않는다.
it("I1은 미래 입력 일정을 숨기고 검증된 제외 사유만 표시한다", () => {
  const base = insight({
    key: "I1",
    sampleSize: 0,
    comparablePairs: 0,
    period: { from: "2016-12-23", to: "2027-02-14" },
  });
  const diagnostics = {
    version: 1,
    labelRows: 8,
    restoredAnnouncementYears: 10,
    stages: {
      eventMissing: 0,
      observationIneligible: 2,
      announcementMissing: 1,
      conditionsMismatch: 5,
      ambiguous: 0,
      matched: 0,
    },
  };
  const value: Insight = {
    ...base,
    evidence: [
      {
        ...base.evidence[0],
        summary: JSON.stringify({ comparisonDiagnostics: diagnostics }),
      },
    ],
  };
  const output = html(
    <InsightResults first={ready(value)} second={{ status: "loading" }} />,
  );
  expect(output).toContain("과거 행사 주최측 발표·관측값 비교");
  expect(output).not.toContain("동일 조건으로 확인된 비교");
  expect(output).not.toContain("2027-02-14");
  diagnostics.labelRows = 9;
  const broken: Insight = {
    ...value,
    evidence: [
      {
        ...value.evidence[0],
        summary: JSON.stringify({ comparisonDiagnostics: diagnostics }),
      },
    ],
  };
  expect(html(<InsightReadiness insight={broken} />)).toBe("");
});

// 실패한 지표와 정상 지표를 동시에 확인할 수 있다.
it("I1 오류가 I2의 독립적인 자료 상태를 가리지 않는다", () => {
  const output = html(
    <InsightResults
      first={{ status: "error" }}
      second={ready(insight({ comparablePairs: 0 }))}
    />,
  );
  expect(output).toContain("자료를 불러오지 못했어요");
  expect(output).not.toContain("0%");
  expect(output).toContain("행사별 하루 평균 방문객");
  expect(output).toContain("일평균 예측 자료를 확인할 수 없습니다.");
});

// I1은 비교 표본이 없으면 입력 자료 범위를 실제 비교 기간으로 설명하지 않는다.
it("I1 공개 사례가 없으면 빈 상태를 보여 준다", () => {
  const output = html(
    <InsightResults
      first={ready(insight({ key: "I1", sampleSize: 0, comparablePairs: 0 }))}
      second={{ status: "loading" }}
    />,
  );
  expect(output).toContain("과거 행사 목록을 확인할 수 없습니다.");
  expect(output).not.toContain("<details");
  expect(output).not.toContain("0쌍");
  expect(output).toContain("자료를 불러오는 중입니다.");
  expect(output).not.toContain("분석 요약 복사");
});

// 유효 I1의 비율 분포는 같은 건수의 표로도 확인할 수 있다.
it("I1은 비교 비율과 분포 설명을 본문에서 제외한다", () => {
  const value = insight({
    key: "I1",
    headline: { value: 0, unit: "배", text: "관측과 같은 조건으로 비교" },
    series: [{ label: "1배 미만", value: 2 }],
  });
  const output = html(
    <InsightResults first={ready(value)} second={{ status: "empty" }} />,
  );
  expect(output).not.toContain("0.0배");
  expect(output).not.toContain("발표 / 관측 비율 분포 수치 표 보기");
});

// 화면 숫자만 복사되어 한계를 놓치지 않도록 원래 설명도 포함한다.
it("보고서 문장 복사 성공을 알리고 해석 한계를 보존한다", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () => root.render(<InsightSources insight={insight()} />));
  await act(async () =>
    Array.from(node.querySelectorAll("button"))
      .find((button) => button.textContent === "분석 요약 복사")
      ?.click(),
  );
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining("올해 사전 예상치가 아닙니다"),
  );
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining(
      "표본 2건, 예보 대상 행사 일정 2026-10-01~2026-10-03",
    ),
  );
  expect(node.textContent).toContain("복사됨");
  await act(async () => root.unmount());
});

// 클립보드가 차단되어도 사용자가 실패 이유와 직접 복사할 문장을 볼 수 있다.
it("복사 실패 시 안내와 직접 복사할 문장을 제공한다", async () => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    configurable: true,
  });
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () => root.render(<InsightSources insight={insight()} />));
  await act(async () =>
    Array.from(node.querySelectorAll("button"))
      .find((button) => button.textContent === "분석 요약 복사")
      ?.click(),
  );
  expect(node.querySelector('[role="alert"]')?.textContent).toContain(
    "복사하지 못했어요",
  );
  expect(node.querySelector("textarea")?.value).toContain("추정 산식 기반");
  await act(async () => root.unmount());
});

// 명세는 날짜의 의미와 원문 용도를 함께 읽을 수 있다.
it("자료 기간·확인일·생성 시각과 원문 설명을 구분한다", () => {
  const output = html(
    <DatalabSpecTable state={ready(specFixture as DatalabSpec)} />,
  );
  expect(output).toContain("원자료 기간");
  expect(output).toContain("자료 확인일");
  expect(output).not.toContain("자료 활용 기록 · 작성");
  expect(output).not.toContain("자료 사용 내역");
  expect(output).toContain("외지인·현지인·외국인 방문자 수");
});
