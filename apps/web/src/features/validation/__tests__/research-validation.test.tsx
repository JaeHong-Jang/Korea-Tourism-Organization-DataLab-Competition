// v2 연구 성적과 발행 미적용 상태가 두 화면에서 같은 뜻으로 보이는지 확인한다.

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { ResearchModelEvidence } from "../../knowledge-graph/research-model-evidence";
import { ResearchComputationRecord } from "../research-computation-record";
import { ResearchSplitDetails } from "../research-split-details";
import { researchV2 } from "../research-v2-data";
import { ResearchValidationSummary } from "../research-validation-summary";

// 보류 사유·채택 판정은 연구 문서에만 두고 화면 문구에는 싣지 않는다.
const reasonWords = ["보류", "채택 조건", "탈락", "미충족"];

// 생성 데이터가 산출물의 선택 설정과 평가 분모를 그대로 담고 있다.
it("생성 데이터가 v2 선택 설정과 평가 분모를 담는다", () => {
  expect(researchV2.selected).toMatchObject({
    variant: "prior",
    numLeaves: 15,
    minChildSamples: 40,
  });
  expect(researchV2.evaluation.map((item) => item.events)).toEqual([635, 358]);
  expect(researchV2).not.toHaveProperty("criteria");
});

// 모델 검증 첫 카드는 실제 평가 분모·MAE·포함률만 표시한다.
it("v2의 연도별 성적을 표시하고 보류 사유는 싣지 않는다", () => {
  const output = renderToStaticMarkup(<ResearchValidationSummary />);
  expect(output).toContain("연구 모델 · 발행 예보 미적용");
  expect(output).toContain("v2 · 앞선 회차 입력 추가 연구 모델");
  expect(output).toContain("2025·2026년 993건");
  expect(output).toContain("12,360.4");
  expect(output).toContain("9,822.8");
  expect(output).toContain("81.3%");
  expect(output).toContain("82.2%");
  for (const word of reasonWords) expect(output).not.toContain(word);
});

// 예보 근거는 연구 모델과 발행본 모델이 다른 상태임을 명시한다.
it("예보 근거에서 v2의 입력·출력·미적용 상태를 구분한다", () => {
  const output = renderToStaticMarkup(
    <MemoryRouter>
      <ResearchModelEvidence />
    </MemoryRouter>,
  );
  expect(output).toContain("연구 모델 · 발행 예보 미적용");
  expect(output).toContain("앞선 회차 순증");
  expect(output).toContain("이 연구 후보의 수치로 바뀐 것이 아닙니다");
  expect(output).toContain("/validation#research-signed-model");
  for (const word of reasonWords) expect(output).not.toContain(word);
});

// 분할 상세는 연도마다 학습·보정·평가 수가 달라진 것을 그대로 보여 준다.
it("월별 되풀이 학습의 연도별 분할 수를 표시한다", () => {
  const output = renderToStaticMarkup(<ResearchSplitDetails />);
  expect(output).toContain("294행");
  expect(output).toContain("1,041행");
  expect(output).toContain("439행");
  expect(output).toContain("개최 14일 전(D-14)");
});

// 계산 기록은 기준선 대조와 실행 식별자를 남긴다.
it("기준선 대조와 실행 식별자를 표시한다", () => {
  const output = renderToStaticMarkup(<ResearchComputationRecord />);
  expect(output).toContain("v2 · 앞선 회차 입력 추가");
  expect(output).toContain("12,769.1");
  expect(output).toContain("silver-v2-20260928");
  expect(output).toContain("4.6.0");
  for (const word of reasonWords) expect(output).not.toContain(word);
});
