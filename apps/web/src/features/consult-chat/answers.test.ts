// 질문 종류별 답이 게이트웨이 메시지의 text와 answer를 모두 채우는지 본다.
import { expect, it } from "vitest";
import {
  choiceAnswer,
  combinedAnswer,
  hazardsAnswer,
  timeAnswer,
} from "./answers";

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

// 실제 되묻기 세 종류를 한 번의 검증된 answer 부분 객체로 묶는다.
it("주최·시각·위험 질문을 한 번에 답한다", () => {
  const asks = [
    {
      field: "hostType",
      question: "주최 유형을 확인해 주세요.",
      options: ["지자체", "민간", "대학", "기타"].map((value) => ({
        label: value,
        value,
      })),
    },
    { field: "time", question: "시각을 확인해 주세요.", options: [] },
    {
      field: "hazards",
      question: "위험요소를 확인해 주세요.",
      options: [
        { label: "폭죽 써요", value: "폭죽" },
        { label: "해당 없어요", value: "[]" },
      ],
    },
  ];
  expect(
    combinedAnswer(asks, {
      choices: { hostType: "지자체" },
      date: "2026-10-18",
      start: "19:00",
      end: "21:00",
      hazards: ["폭죽"],
    }).answer,
  ).toEqual({
    hostType: "지자체",
    startsAt: "2026-10-18T19:00:00+09:00",
    endsAt: "2026-10-18T21:00:00+09:00",
    hazards: ["폭죽"],
  });
  expect(() =>
    combinedAnswer(asks, {
      choices: { hostType: "지자체" },
      date: "2026-10-18",
      start: "21:00",
      end: "19:00",
      hazards: [],
    }),
  ).toThrow(/시각/);
  expect(() =>
    combinedAnswer(asks, {
      choices: { hostType: "지자체" },
      date: "2026-10-18",
      start: "19:00",
      end: "21:00",
      hazards: null,
    }),
  ).toThrow(/위험요소/);
});
