// 질문 종류별 답이 게이트웨이 메시지의 text와 answer를 모두 채우는지 본다.
import { expect, it } from "vitest";
import {
  askOptions,
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

// 선택지가 없는 유형 질문도 계약의 일곱 값만 고르고 잘못된 부분 답은 막는다.
it("유형 질문은 계약 선택지를 사용하고 임의 유형을 거절한다", () => {
  const ask = {
    field: "type",
    question: "행사 유형은 무엇인가요?",
    options: [],
  };
  expect(askOptions(ask).map((option) => option.value)).toEqual([
    "불꽃",
    "공연",
    "대학",
    "먹거리",
    "꽃",
    "전통",
    "기타",
  ]);
  const inputs = {
    choices: { type: "불꽃" },
    hazards: null,
    date: "",
    start: "",
    end: "",
  };
  expect(combinedAnswer([ask], inputs).answer).toEqual({ type: "불꽃" });
  expect(() =>
    combinedAnswer([ask], { ...inputs, choices: { type: "축제" } }),
  ).toThrow(/답을 확인/);
});

// 질문 선택지가 계약의 위험요소 밖이면 전송 전에 부분 스키마가 거절한다.
it("질문 선택값도 행사 초안 부분 스키마로 검증한다", () => {
  expect(() =>
    combinedAnswer(
      [
        {
          field: "hazards",
          question: "위험요소는요?",
          options: [{ label: "임의 위험", value: "임의 위험" }],
        },
      ],
      {
        choices: {},
        hazards: ["임의 위험" as never],
        date: "",
        start: "",
        end: "",
      },
    ),
  ).toThrow(/답 형식/);
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
