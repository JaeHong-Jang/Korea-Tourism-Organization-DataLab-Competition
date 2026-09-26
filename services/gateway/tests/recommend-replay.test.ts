// 추천 trace 재생에도 새 예보와 구별되는 정본 순서 검증을 적용한다
import { expect, it } from "vitest";
import { validateTrace } from "../src/team/replay/validate-trace.js";
import { contractEvents, traceText } from "./replay-fixture.js";

// 허용된 추천은 그대로 읽고 게이트를 섞은 기록은 재생 전에 거부한다
it("추천 trace에는 recommend 순서를 적용한다", () => {
  const events = contractEvents("valid-recommend");
  expect(validateTrace(traceText(events)).map((item) => item.envelope)).toEqual(
    events,
  );
  expect(() =>
    validateTrace(traceText(contractEvents("invalid-recommend-with-gate"))),
  ).toThrow("SSE 순서 위반");
});
