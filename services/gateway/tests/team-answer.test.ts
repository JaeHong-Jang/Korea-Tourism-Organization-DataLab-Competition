// 직전 질문 외 답변이 확정값을 덮지 않고 작업 기록으로 남는지 검증한다
import { expect, it } from "vitest";
import { shortText, teamFixture, validSequence } from "./team-fixture.js";

// 시각 묶음은 시작·종료만 받으며 임의 이름·유형·지역·시간대는 무시한다
it("묻지 않은 답변 키를 무시하고 작업 기록에 남긴다", async () => {
  const harness = teamFixture();
  const id = await harness.create();
  validSequence(await harness.message(id, { text: shortText }));
  const events = await harness.message(id, {
    text: "필수 정보 확인",
    answer: {
      startsAt: "2026-10-18T19:00:00+09:00",
      endsAt: "2026-10-19T02:00:00+09:00",
      hostType: "지자체",
      hazards: ["폭죽"],
      name: "부산 공연 행사",
      type: "공연",
      venueText: "부산 씨사이드파크",
      sigunguCode: "26350",
      timeOfDay: "주간",
      fee: "유료",
      budgetKrw: 50000,
      promo: ["유튜브"],
    },
  });
  validSequence(events);
  expect(
    events.find((event) => event.event === "event_card")?.data,
  ).toMatchObject({
    name: "불꽃축제",
    type: "불꽃",
    venueText: "영종 씨사이드파크",
    sigunguCode: null,
    timeOfDay: "야간",
    fee: "미상",
    budgetKrw: null,
    promo: [],
    hazards: ["폭죽"],
    hostType: "지자체",
  });
  expect(events.some((event) => event.event === "forecast")).toBe(true);
  const steps = await (
    await harness.app.request(`/api/team/sessions/${id}/steps`)
  ).json();
  const dictation = steps
    .filter((step: { agentId: string }) => step.agentId === "dictation")
    .at(-1);
  expect(dictation.note).toBe(
    "무시한 답 필드: name,type,venueText,sigunguCode,timeOfDay,fee,budgetKrw,promo",
  );
});

// 부분 답변 뒤에는 남은 질문만 허용하고 빈 위험 답변도 확정값으로 보호한다
it("직전 질문에서 빠진 주최·위험요소 답은 다시 병합하지 않는다", async () => {
  const harness = teamFixture();
  const id = await harness.create();
  await harness.message(id, { text: shortText });
  const partial = await harness.message(id, {
    text: "주최와 위험 확인",
    answer: { hostType: "지자체", hazards: [] },
  });
  validSequence(partial);
  expect(partial.filter((event) => event.event === "ask")).toMatchObject([
    { data: { field: "time" } },
  ]);
  const resumed = await harness.message(id, {
    text: "시각 확인",
    answer: {
      startsAt: "2026-10-18T10:00:00+09:00",
      endsAt: "2026-10-19T01:00:00+09:00",
      hostType: "민간",
      hazards: ["불"],
    },
  });
  validSequence(resumed);
  expect(resumed.some((event) => event.event === "ask")).toBe(false);
  expect(
    resumed.find((event) => event.event === "event_card")?.data,
  ).toMatchObject({
    hostType: "지자체",
    hazards: [],
    timeOfDay: "종일",
  });
  expect(resumed.filter((event) => event.event === "agent_step")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        data: expect.objectContaining({
          agentId: "dictation",
          note: "무시한 답 필드: hostType,hazards",
        }),
      }),
    ]),
  );
});

// 첫 요청에는 직전 질문이 없으므로 함께 보낸 answer가 원문 추출을 덮지 않는다
it("첫 메시지에 끼운 answer도 질문 전에는 무시한다", async () => {
  const harness = teamFixture();
  const events = await harness.message(await harness.create(), {
    text: shortText,
    answer: { name: "부산 공연 행사", type: "공연", hazards: [] },
  });
  validSequence(events);
  expect(
    events.find((event) => event.event === "event_card")?.data,
  ).toMatchObject({ name: "불꽃축제", type: "불꽃" });
  expect(events.filter((event) => event.event === "ask")).toHaveLength(3);
});
