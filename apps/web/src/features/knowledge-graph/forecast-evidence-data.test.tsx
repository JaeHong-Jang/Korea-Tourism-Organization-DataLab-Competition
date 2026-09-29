// 발행본 수치와 근거 역할이 공통 기준이나 다른 모델로 덮이지 않는지 검증한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import fixture from "../../../../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json";
import {
  evidenceAtStage,
  evidenceObservation,
  evidenceRole,
  forecastEvidenceHref,
  snapshotEvidence,
} from "./forecast-evidence-data";
import { SnapshotEvidence } from "./snapshot-evidence";
import { SnapshotEvidenceDetail } from "./snapshot-evidence-detail";

const report = fixture as unknown as ForecastReport;

// 관측 첨부와 실제 사용은 별개이며 판정·환산은 명시적 식별자로 확인한다.
it("관측을 사용으로 단정하지 않고 환산·판정·모델 역할을 구별한다", () => {
  expect(report.evidence.map((item) => evidenceRole(report, item))).toEqual([
    "unconfirmed",
    "model",
    "judgment",
    "judgment",
    "conversion",
    "conversion",
  ]);
  expect(
    evidenceRole(report, {
      ...report.evidence[1],
      modelVersion: "다른-모델",
      id: "ev-other",
    }),
  ).toBe("unconfirmed");
  expect(
    report.evidence.filter((item) =>
      evidenceAtStage(report, item, "conversion"),
    ),
  ).toHaveLength(2);
  expect(evidenceAtStage(report, report.evidence[0], "daily")).toBe(false);
});

// 같은 출처의 서로 다른 관측에 한 값을 임의로 붙이지 않는다.
it("관측 식별자와 출처가 모두 일치할 때만 적용 값을 보여 준다", () => {
  const observation = report.forecast.observations[0];
  const evidence = {
    ...report.evidence[0],
    summary: JSON.stringify(observation),
  };
  expect(evidenceObservation(report, evidence)?.value).toBe(61000);
  expect(
    evidenceObservation(report, {
      ...evidence,
      summary: JSON.stringify({ id: "obs-other" }),
    }),
  ).toBeUndefined();
  expect(
    evidenceObservation(report, { ...evidence, source: null }),
  ).toBeUndefined();
});

// 발행본의 동일 식별자가 중복되면 발행 문서 쪽 설명을 우선한다.
it("근거를 중복 없이 합치고 발행본 내용을 유지한다", () => {
  const changed = structuredClone(report);
  changed.evidence[0].title = "발행 당시 확정 출처";
  expect(snapshotEvidence(changed)).toHaveLength(report.evidence.length);
  expect(snapshotEvidence(changed)[0].title).toBe("발행 당시 확정 출처");
});

// 모델·결과·날짜를 바꾼 발행본도 고정된 예시 문구 없이 표시한다.
it("단계 화면은 선택한 예보 수치를 그대로 읽고 성능 숫자를 만들지 않는다", () => {
  const changed = structuredClone(report);
  changed.event.name = "정선아리랑제";
  changed.forecast.modelVersion = "v-custom-2026";
  changed.forecast.dailyMean.p50 = 12345;
  changed.forecast.peakConcurrent.p50 = 14850;
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <SnapshotEvidence report={changed} />
    </MemoryRouter>,
  );
  for (const text of [
    "정선아리랑제",
    "v-custom-2026",
    "12,345",
    "14,850",
    "추정",
    "기준일",
  ])
    expect(html).toContain(text);
  for (const text of ["부산바다축제", "49.3%", "57.0%", "13,000", "21,000"])
    expect(html).not.toContain(text);
  const href = new URL(forecastEvidenceHref(changed), "https://local.test");
  expect(href.searchParams.get("forecastId")).toBe(changed.forecastId);
});

// 잘못된 외부 주소나 해석 불가능한 요약도 실행하거나 추측하지 않는다.
it("상세는 기록된 값만 보이고 원문 덤프와 위험한 링크는 숨긴다", () => {
  const source = report.evidence[0].source;
  if (!source) throw new Error("테스트 출처가 필요해요.");
  const evidence = {
    ...report.evidence[0],
    summary: "요약 기록",
    source: { ...source, accessUrl: "javascript:alert(1)" },
  };
  const html = renderToStaticMarkup(
    <SnapshotEvidenceDetail report={report} evidence={evidence} />,
  );
  expect(html).toContain("사용 확인 필요");
  expect(html).not.toContain("요약 기록");
  expect(html).not.toContain("javascript:");
});
