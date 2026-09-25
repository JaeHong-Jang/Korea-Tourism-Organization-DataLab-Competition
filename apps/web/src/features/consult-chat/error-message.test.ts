// 상담 오류 문구가 검사 종류를 남기고 예보팀 이유는 그대로 두는지 확인한다.
import { describe, expect, it } from "vitest";
import { consultErrorMessage } from "./error-message";

describe("consultErrorMessage", () => {
  // 스트림 검사 오류는 개발자 말 대신 검사 종류만 밝힌다
  it("순서·형식 검사 오류를 사용자 말로 바꾼다", () => {
    expect(consultErrorMessage("SSE 순서 위반: done 없음")).toContain("순서 검사");
    expect(consultErrorMessage("SSE 계약 위반: data/id")).toContain("형식 검사");
    expect(consultErrorMessage("SSE 순서 위반: x")).not.toContain("SSE");
  });

  // 게이트 실패처럼 예보팀이 보낸 이유는 바꾸지 않는다
  it("예보팀이 보낸 이유는 그대로 보인다", () => {
    const reason = "분석 결과 검사를 통과하지 못해 예보를 발행하지 않았어요.";
    expect(consultErrorMessage(reason)).toBe(reason);
    expect(consultErrorMessage("TypeError: Failed to fetch")).toContain(
      "다시 보내 주세요",
    );
  });
});
