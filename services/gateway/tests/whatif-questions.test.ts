// 모호한 값·버튼 답·분류 실패와 발행 전 질문이 임의 예측으로 이어지지 않는지 검사한다
import { expect, it } from "vitest";
import { eventData } from "../evals/scenario-score.js";
import {
  classificationResponse,
  isClassification,
  validFollowup,
} from "./followup-fixture.js";
import { validSequence } from "./team-fixture.js";
import { whatifFixture } from "./whatif-fixture.js";

// 필드가 모호하면 new 모드의 질문을 보내고 해당 버튼 답만 다음 예보에 적용한다
it.each([
  [
    "요일 바꾸면?",
    "startsAt",
    "2026-10-25",
    {
      startsAt: "2026-10-25T19:00:00+09:00",
      endsAt: "2026-10-25T21:00:00+09:00",
    },
  ],
  ["밤이나 낮이면?", "timeOfDay", "주간", { timeOfDay: "주간" }],
  ["입장료 바꾸면?", "fee", "유료", { fee: "유료" }],
  ["유형 바꾸면?", "type", "공연", { type: "공연" }],
] as const)(
  "%s는 %s 버튼을 받고 다시 예보한다",
  async (text, field, answer, changes) => {
    const harness = whatifFixture();
    const { id, report, forecastId } = await harness.publish();
    const before = harness.calls.length;
    const question = await harness.message(id, { text });
    validSequence(question);
    expect(eventData(question, "ask")).toMatchObject([
      { field, options: expect.any(Array) },
    ]);
    expect(harness.calls.slice(before)).toHaveLength(0);
    expect(harness.snapshots.get(forecastId)).toEqual(report);
    const events = await harness.message(id, { text: answer });
    validSequence(events);
    expect(eventData(events, "claim").length).toBeGreaterThan(0);
    expect(
      harness.calls
        .slice(before)
        .find((call) => call.url.pathname === "/v1/whatif")?.body,
    ).toEqual({ event: report.event, changes });
  },
);

// 구조화 답변에 섞인 장소·유형·위험요소는 질문하지 않았으면 반영하지 않는다
it("요금 질문은 답변의 fee만 허용한다", async () => {
  const harness = whatifFixture();
  const { id, report } = await harness.publish();
  await harness.message(id, { text: "요금 바꿔 볼까요?" });
  const events = await harness.message(id, {
    text: "선택했어요",
    answer: { fee: "유료", type: "공연", hazards: [], venueText: "서울광장" },
  });
  validSequence(events);
  expect(
    harness.calls.find((call) => call.url.pathname === "/v1/whatif")?.body,
  ).toEqual({ event: report.event, changes: { fee: "유료" } });
});

// 불명확한 문장은 한 번의 스키마 분류로 끝내고 조건 값을 LLM에게 추측시키지 않는다
it("규칙 없는 요청은 LLM 한 번 뒤 선택 질문으로 전환한다", async () => {
  const harness = whatifFixture({
    override: async (call) => {
      if (!isClassification(call)) return;
      const response = await classificationResponse("whatif").json();
      response.message.content = JSON.stringify({
        intent: "whatif",
        whatifKind: "fee",
      });
      return Response.json(response);
    },
  });
  const { id } = await harness.publish();
  const before = harness.calls.length;
  const events = await harness.message(id, { text: "돈을 받는다면?" });
  validSequence(events);
  expect(eventData(events, "ask")).toMatchObject([{ field: "fee" }]);
  expect(harness.calls.slice(before).filter(isClassification)).toHaveLength(1);
  expect(
    harness.calls
      .slice(before)
      .filter((call) => call.url.pathname === "/v1/whatif"),
  ).toHaveLength(0);
});

// 발행 없는 질문은 받아쓰기나 상류 요청 전에 선행 예보를 안내한다
it.each([
  "일요일이면?",
  "밤이면?",
  "유료면?",
  "공연이면?",
  "비 오면?",
  "비슷한 행사는?",
])("발행 전 %s는 먼저 예보를 안내한다", async (text) => {
  const harness = whatifFixture();
  const id = await harness.create();
  const events = await harness.message(id, { text });
  validSequence(events);
  expect(events).toMatchObject([
    { event: "error", data: { message: "먼저 예보를 만들어요" } },
    { event: "done", data: { forecastId: null } },
  ]);
  expect(harness.calls).toHaveLength(0);
});

// 질문을 보류하고 다른 후속 명령을 선택하면 예전 질문의 답으로 오인하지 않는다
it("선택 질문 뒤 저장 요청은 기존 예보를 저장한다", async () => {
  const harness = whatifFixture();
  const { id, forecastId } = await harness.publish();
  await harness.message(id, { text: "요금 바꾸면?" });
  const events = await harness.message(id, { text: "저장해 줘" });
  validFollowup(events, forecastId);
  expect(JSON.stringify(events)).toContain("예보서를 저장했어요");
});

// 여러 종류를 동시에 말하면 한 조건을 조용히 버리지 않고 다시 선택하게 한다
it("복합 조건과 존재하지 않는 날짜는 예보를 호출하지 않는다", async () => {
  const harness = whatifFixture();
  const { id } = await harness.publish();
  for (const text of ["일요일 밤이면?", "2026-02-30이면?"]) {
    const before = harness.calls.length;
    const events = await harness.message(id, { text });
    validSequence(events);
    expect(eventData(events, "ask")).toHaveLength(1);
    expect(harness.calls.slice(before)).toHaveLength(0);
  }
});
