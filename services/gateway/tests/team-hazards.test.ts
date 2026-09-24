// 위험 표현은 자동 판정 입력이 아니라 확인 질문으로 이어지는지 검증한다
import { expect, it } from "vitest";
import {
  hazardCandidates,
  hazardQuestion,
} from "../src/team/analysis/hazard-question.js";
import {
  extracted,
  shortText,
  teamFixture,
  validSequence,
} from "./team-fixture.js";

// 표에 명시한 표현만 위험 후보로 대응하고 드론쇼는 위험을 추정하지 않는다
it.each([
  ["불꽃", "폭죽"],
  ["폭죽", "폭죽"],
  ["달집", "불"],
  ["낙화", "불"],
  ["들불", "불"],
  ["횃불", "불"],
  ["수상", "수면"],
  ["물놀이", "수면"],
  ["카누", "수면"],
  ["래프팅", "수면"],
  ["등산", "산"],
  ["산행", "산"],
])("%s는 %s 확인 후보이다", (text, hazard) => {
  expect(hazardCandidates(text, null)).toEqual([hazard]);
});

// 여러 위험을 하나의 질문에 모으고 해당 없음 선택을 함께 제공한다
it("복수 위험 후보에도 질문은 하나이고 없음은 빈 배열이다", () => {
  const candidates = hazardCandidates("달집 카누 산행", "불꽃");
  expect(candidates).toEqual(["폭죽", "불", "수면", "산"]);
  const question = hazardQuestion(candidates);
  expect(question.field).toBe("hazards");
  expect(question.question).toContain("여러 항목");
  expect(question.options.map((option) => option.value)).toEqual([
    "폭죽",
    "불",
    "수면",
    "산",
    "[]",
  ]);
});

// 원문에 위험 단어가 없는 드론쇼에는 위험 질문을 추가하지 않는다
it("드론쇼 문장에는 hazards 질문이 없다", async () => {
  const text = shortText.replace("불꽃축제", "드론쇼");
  const harness = teamFixture({
    recordings: {
      [text]: JSON.stringify({
        ...extracted,
        name: "드론쇼",
        typeText: null,
        dateText: "10월 18일",
        timeText: null,
        venueText: "영종 씨사이드파크",
        feeText: null,
        hostText: null,
        budgetText: null,
        hazards: [],
      }),
    },
  });
  const events = await harness.message(await harness.create(), { text });
  validSequence(events);
  expect(
    events.find((event) => event.event === "event_card")?.data,
  ).toMatchObject({ name: "드론쇼", hazards: [] });
  expect(
    events
      .filter((event) => event.event === "ask")
      .map((event) => (event.data as { field: string }).field),
  ).not.toContain("hazards");
});
