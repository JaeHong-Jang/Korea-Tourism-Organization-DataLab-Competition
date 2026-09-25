// 계약 예보서의 숫자·근거·비활성 사유를 화면 단위로 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ForecastReport } from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import baselineFixture from "../../../../../packages/contracts/fixtures/region-baseline/valid-28110.json";
import similarFixture from "../../../../../packages/contracts/fixtures/similar-event/valid-yeongjong-2024.json";
import { EvidenceCard } from "../../components/common/evidence-card";
import { formatSnapshotNumber } from "../../lib/format";
import { ReportActions } from "./report-actions";
import { ReportClaims } from "./report-claims";
import { ReportContext } from "./report-context";
import {
  ReportJudgment,
  SIZE_BIAS_NOTICE,
  UNVERIFIED_NOTICE,
} from "./report-judgment";
import { ReportNumbers } from "./report-numbers";
import { ReportToolbar, requestPlan } from "./report-toolbar";

const fixture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json",
    ),
    "utf8",
  ),
) as ForecastReport;
const noOpen = () => {};
const html = (report: ForecastReport) =>
  renderToStaticMarkup(
    <>
      <ReportJudgment report={report} onOpen={noOpen} />
      <ReportNumbers report={report} onOpen={noOpen} />
      <ReportClaims
        report={report}
        onOpen={noOpen}
        exclude={["판정", "권고"]}
      />
      <ReportContext report={report} onOpen={noOpen} />
      <ReportActions report={report} onOpen={noOpen} />
    </>,
  );

// 대표값과 구간은 만 단위 축약 없이 스냅샷 수치를 그대로 쓴다.
it("수치·빈 자료·문장 근거를 계약 픽스처대로 표시한다", () => {
  const output = html(fixture);
  expect(output).toContain("21,000");
  expect(formatSnapshotNumber(1234.123456789)).toBe("1,234.123456789");
  expect(output).toContain("12,000");
  expect(output).toContain("35,000");
  expect(output).toContain("13,000");
  expect(output).toContain("평시 자료 없음");
  expect(output).toContain("유사 행사 자료 없음");
  expect(output).toContain("근거 3, 규정:");
  expect(output).toContain('href="#evidence-ev-rule-legal-hazard"');
  expect(output).toContain("순간 최대 1,000명 이상일 확률 99%");
  expect(
    html({ ...fixture, forecast: { ...fixture.forecast, peakHours: null } }),
  ).toContain("자료 없음");
});

// 문장이 인용하지 않은 일평균도 스냅샷의 수치 ID가 모델 근거를 가리키면 칩을 보여 준다.
it("일평균 수치에 직접 연결된 근거 칩을 표시한다", () => {
  const output = renderToStaticMarkup(
    <ReportNumbers report={fixture} onOpen={noOpen} />,
  );
  const daily = output.split("일평균 방문객")[1]?.split("피크 시간")[0];
  expect(daily).toContain('href="#evidence-ev-model-f-yeongjong-2025"');
});

// 비교 자료가 있으면 서로 다른 집계 단위와 추정 여부를 수치 옆에 붙인다.
it("유사 행사와 평시 자료의 원래 값과 집계 단위를 표시한다", () => {
  const similar = {
    ...similarFixture,
    measured: { ...similarFixture.measured, estimated: true },
  } as unknown as ForecastReport["similar"][number];
  const report = {
    ...fixture,
    similar: [similar],
    baseline: baselineFixture,
  } as unknown as ForecastReport;
  const output = renderToStaticMarkup(
    <ReportContext report={report} onOpen={noOpen} />,
  );
  expect(output).toContain("정성 비교");
  expect(output).toContain("15,200명/일 · 일 · 시군구 · 추정");
  expect(output).toContain("50,000명 · 기간누적 · 행사장");
  expect(output).toContain("56,000");
  expect(output).toContain("61,000");
});

// 구간 기준에서는 확률 수치를 출력하지 않고 미검증 문구는 판정 곁에 둔다.
it("구간과 미검증 상태를 판정·수치에 반영한다", () => {
  const report = {
    ...fixture,
    forecast: {
      ...fixture.forecast,
      judgment: { ...fixture.forecast.judgment, basis: "구간" as const },
      predictionRun: {
        ...fixture.forecast.predictionRun,
        modelVerdict: "미검증" as const,
      },
    },
  };
  const output = html(report);
  expect(output.replace(/<[^>]*>/g, "")).not.toContain("%");
  expect(output.match(new RegExp(UNVERIFIED_NOTICE, "g"))).toHaveLength(2);
  expect(output.match(new RegExp(SIZE_BIAS_NOTICE, "g"))).toHaveLength(2);
});

// 근거 카드 번호는 칩 번호표와 같고 법령 이름·게시처·원문을 보인다.
it("규정 카드의 번호와 법령 원문을 표시한다", () => {
  const evidence = fixture.evidence.find(
    (item) => item.kind === "rule" && item.clauseId,
  );
  const output = renderToStaticMarkup(
    <EvidenceCard
      evidence={evidence}
      evidenceOrder={fixture.evidence}
      defaultOpen
    />,
  );
  expect(output).toContain("[3]");
  expect(output).toContain("재난 및 안전관리 기본법 시행령 제73조의9");
  expect(output).toContain("국가법령정보센터");
  expect(output).toContain("https://www.law.go.kr/");
});

// 데이터 카드는 마스터의 이름·원문 주소와 스냅샷의 기간·공개일을 함께 쓴다.
it("데이터 카드에 기간·공개 시점과 데이터셋 원문을 보인다", () => {
  const evidence = fixture.evidence.find((item) => item.kind === "data");
  const output = renderToStaticMarkup(
    <EvidenceCard
      evidence={evidence}
      evidenceOrder={fixture.evidence}
      defaultOpen
    />,
  );
  expect(output).toContain("한국관광공사_빅데이터_지역별 방문자수_GW");
  expect(output).toContain("2025-09-06");
  expect(output).toContain("2025-09-27");
  expect(output).toContain("공개일");
  expect(output).toContain("https://www.data.go.kr/data/15101972/openapi.do");
});

// 계획 경로가 없거나 응답이 잘못되면 내려받기 주소를 사용하지 않는다.
it("docx 요청의 성공·404·오류를 구별한다", async () => {
  const response = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue({
      status,
      ok: status === 200,
      json: async () => body,
    }) as unknown as typeof fetch;
  expect(
    await requestPlan(
      fixture.forecastId,
      response(200, { docxHref: "/api/plans/plan-yeongjong/export.docx" }),
    ),
  ).toEqual({ status: "ready", href: "/api/plans/plan-yeongjong/export.docx" });
  expect(await requestPlan(fixture.forecastId, response(404, {}))).toEqual({
    status: "unavailable",
  });
  expect(await requestPlan(fixture.forecastId, response(500, {}))).toEqual({
    status: "error",
  });
  expect(
    await requestPlan(
      fixture.forecastId,
      response(200, { docxHref: "https://other.example/a.docx" }),
    ),
  ).toEqual({ status: "error" });
  const withoutPlan = { ...fixture, brief: { ...fixture.brief, actions: [] } };
  expect(
    renderToStaticMarkup(<ReportToolbar report={withoutPlan} />),
  ).not.toContain("disabled");
});
