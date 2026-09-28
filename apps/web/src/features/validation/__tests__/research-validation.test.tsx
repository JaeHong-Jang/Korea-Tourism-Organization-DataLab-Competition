// 연구 검증 수치와 발행 미적용 한계가 두 화면에서 같은 뜻으로 보이는지 확인한다.

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { ResearchModelEvidence } from "../../knowledge-graph/research-model-evidence";
import { ResearchValidationSummary } from "../research-validation-summary";

// 모델 검증은 실제 평가 분모·MAE·포함률과 운영 보류 이유를 함께 표시한다.
it("전체 자료 연구의 실제 성적과 취약 구간을 표시한다", () => {
  const output = renderToStaticMarkup(<ResearchValidationSummary />);
  expect(output).toContain("1,804건 전체 자료 연구");
  expect(output).toContain("2025·2026년 993건");
  expect(output).toContain("12,486.3");
  expect(output).toContain("10,764.8");
  expect(output).toContain("81.8%");
  expect(output).toContain("85.3%");
  expect(output).toContain("큰 행사에서 과소예측이 남았습니다");
  expect(output).toContain("행사장 방문객, 순간 최대 인원");
});

// 예보 근거는 연구 모델과 발행본 모델이 다른 상태임을 명시한다.
it("예보 근거에서 연구 후보의 입력·출력·미적용 상태를 구분한다", () => {
  const output = renderToStaticMarkup(
    <MemoryRouter>
      <ResearchModelEvidence />
    </MemoryRouter>,
  );
  expect(output).toContain("연구 후보 · 발행 예보 미적용");
  expect(output).toContain("시군구 일평균 방문 순증");
  expect(output).toContain("이 연구 후보의 수치로 바뀐 것이 아닙니다");
  expect(output).toContain("/validation#research-signed-model");
});
