// 질문 종류별 답이 게이트웨이 메시지의 text와 answer를 모두 채우는지 본다.
import { expect, it } from "vitest";
import { choiceAnswer, hazardsAnswer, timeAnswer } from "./answers";

it("시각을 날짜와 두 시각으로 보낸다", () => {
  expect(timeAnswer("2026-10-18", "19:00", "21:00")).toEqual({
    text: "2026-10-18 19:00~21:00",
    answer: {
      startsAt: "2026-10-18T19:00:00+09:00",
      endsAt: "2026-10-18T21:00:00+09:00",
    },
  });
});
it("위험요소 복수 선택과 해당 없음을 구분한다", () => {
  expect(hazardsAnswer(["폭죽", "불"]).answer).toEqual({
    hazards: ["폭죽", "불"],
  });
  expect(hazardsAnswer([])).toEqual({
    text: "해당 없어요",
    answer: { hazards: [] },
  });
});
it("주최 유형 버튼을 해당 필드의 답으로 보낸다", () => {
  expect(choiceAnswer("hostType", "민간")).toEqual({
    text: "민간",
    answer: { hostType: "민간" },
  });
});
