// 검증 첫 문장이 평가 범위와 한계를 함께 설명하는지 확인한다.
import { expect, it } from "vitest";
import { validationLead } from "../validation-story";
import { backtest } from "./validation-fixtures";

// 첫 화면은 일평균 채점의 한계를 한 문장으로 말한다.
it("검증 첫 문장에 오차·구간·정답 종류를 함께 적는다", () => {
  const lead = validationLead(backtest);
  expect(lead).toContain("49.3%");
  expect(lead).toContain("86건 중 49건");
  expect(lead).toContain("행사장 정답은 1건");
  expect(lead).toContain("시군구 방문자에서 평시를 뺀 값");
  expect(lead).toContain("순간 최대도, 1,000명 경계도 채점하지 못했습니다");
});
