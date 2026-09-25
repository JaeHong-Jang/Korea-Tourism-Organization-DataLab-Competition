// 조건 질문 열 가지의 순서·호출 상한·숫자·근거와 원본 보존을 실제 SSE로 검사한다

import type { Evidence, ForecastCard } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { auditClaimNumbers } from "../evals/scenario-numbers.js";
import { eventData } from "../evals/scenario-score.js";
import {
  claimsIn,
  isClassification,
  validFollowup,
} from "./followup-fixture.js";
import { isReplyCall } from "./reply-fixture.js";
import { validSequence } from "./team-fixture.js";
import { whatifFixture, withWeatherAssumption } from "./whatif-fixture.js";

// 변경값 정답은 제품 파서를 쓰지 않고 날짜·시각을 직접 고정한다
it.each([
  [
    "다음 주 일요일이면?",
    {
      startsAt: "2026-10-04T19:00:00+09:00",
      endsAt: "2026-10-04T21:00:00+09:00",
    },
  ],
  [
    "2026-10-25로 바꾸면?",
    {
      startsAt: "2026-10-25T19:00:00+09:00",
      endsAt: "2026-10-25T21:00:00+09:00",
    },
  ],
  [
    "10월 26일이면?",
    {
      startsAt: "2026-10-26T19:00:00+09:00",
      endsAt: "2026-10-26T21:00:00+09:00",
    },
  ],
  // 픽스처 행사는 이미 야간·무료라 "밤이면?"·"무료면?"은 조건이 같다 — 새 예보 없이 안내(whatif-failures 테스트)
  ["낮이면?", { timeOfDay: "주간" }],
  ["유료면?", { fee: "유료" }],
  ["공연이면?", { type: "공연" }],
] as const)("%s는 new 모드로 새 예보를 발행한다", async (text, changes) => {
  const harness = whatifFixture();
  const { id, forecastId, report } = await harness.publish();
  const original = structuredClone(report);
  const before = harness.calls.filter((call) => !isReplyCall(call)).length;
  const events = await harness.message(id, { text });
  validSequence(events);
  expect(eventData(events, "error")).toEqual([]);
  const calls = harness.calls
    .filter((call) => !isReplyCall(call))
    .slice(before);
  expect(calls.filter(isClassification)).toHaveLength(0);
  expect(
    calls.filter((call) => call.url.pathname === "/api/chat"),
  ).toHaveLength(1);
  expect(
    calls.filter((call) => call.url.pathname === "/v1/predict"),
  ).toHaveLength(0);
  expect(
    calls.find((call) => call.url.pathname === "/v1/whatif")?.body,
  ).toEqual({ event: report.event, changes });
  const card = eventData<ForecastCard>(events, "forecast")[0];
  expect(card.id).not.toBe(forecastId);
  expect(events.at(-1)?.data).toEqual({ sessionId: id, forecastId: card.id });
  expect(eventData(events, "gate")).toMatchObject([
    { gate: "A", passed: true },
    { gate: "B", passed: true },
    { gate: "publish", passed: true },
  ]);
  const claims = claimsIn(events);
  expect(claims[0].text).toContain("로 바꾼 조건의 예보");
  expect(claims[0].text).not.toMatch(/\p{N}/u);
  const evidence = eventData<{ items: Evidence[] }>(events, "evidence").flatMap(
    (item) => item.items,
  );
  for (const claim of claims) {
    expect(claim.evidenceIds.length).toBeGreaterThan(0);
    expect(
      claim.evidenceIds.every((ref) =>
        evidence.some((item) => item.id === ref),
      ),
    ).toBe(true);
    expect(auditClaimNumbers(claim, card, evidence).problems).toEqual([]);
  }
  expect(harness.snapshots.get(forecastId)).toEqual(original);
  expect(harness.storedEvents.get(report.event.id)).toEqual(original.event);
  expect(harness.snapshots.get(card.id)?.event).toEqual({
    ...original.event,
    ...changes,
  });
  const saved = await harness.message(id, { text: "저장해 줘" });
  validFollowup(saved, card.id);
  expect(JSON.stringify(saved)).toContain("예보서를 저장했어요");
  const why = await harness.message(id, { text: "왜 이렇게 많아?" });
  validFollowup(why, card.id);
  expect(claimsIn(why).length).toBeGreaterThan(0);
});

// 날씨·유사 답변은 기존 예보의 문장만 추가하고 숫자 카드와 새 예보 호출은 없다
it.each(["비 오면?", "비슷한 행사는?"])(
  "%s는 followup 모드로 근거만 발행한다",
  async (text) => {
    const harness = whatifFixture({ forecast: withWeatherAssumption });
    const { id, forecastId, report } = await harness.publish();
    const before = harness.calls.filter((call) => !isReplyCall(call)).length;
    const events = await harness.message(id, { text });
    validFollowup(events, forecastId);
    expect(eventData(events, "error")).toEqual([]);
    expect(eventData(events, "gate")).toMatchObject([
      { gate: "B", passed: true },
      { gate: "publish", passed: true },
    ]);
    expect(eventData(events, "forecast")).toEqual([]);
    const calls = harness.calls
      .filter((call) => !isReplyCall(call))
      .slice(before);
    expect(
      calls.filter((call) =>
        ["/api/chat", "/v1/whatif", "/v1/predict"].includes(call.url.pathname),
      ),
    ).toHaveLength(0);
    const evidence = eventData<{ items: Evidence[] }>(
      events,
      "evidence",
    ).flatMap((item) => item.items);
    const claims = claimsIn(events);
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      expect(claim.text).not.toMatch(/\p{N}/u);
      expect(claim.evidenceIds.length).toBeGreaterThan(0);
      expect(
        claim.evidenceIds.every((ref) =>
          evidence.some((item) => item.id === ref),
        ),
      ).toBe(true);
      expect(auditClaimNumbers(claim, report.card, evidence).problems).toEqual(
        [],
      );
    }
    if (text === "비 오면?") {
      expect(
        evidence.some((item) => item.assumptionId === "as-weather-adjustment"),
      ).toBe(true);
      expect(
        evidence.some((item) => item.ruleId === "rule-check-rain-shelter"),
      ).toBe(true);
      expect(
        claims.some((claim) => claim.text.includes("보정은 적용하지 않아요")),
      ).toBe(true);
    } else expect(evidence.some((item) => item.kind === "case")).toBe(true);
    expect(harness.snapshots.get(forecastId)).toEqual(report);
  },
);
