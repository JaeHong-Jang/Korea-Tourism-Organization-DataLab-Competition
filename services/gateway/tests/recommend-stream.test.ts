// 실제 상담 SSE에서 방문객 분류·목록·빈 결과와 목적 선택 재개를 검사한다

// @ts-expect-error 정본 순서 판정기는 JavaScript로 제공된다
import { sequenceProblems } from "@crowdcast/contracts/rules/sse-sequence.mjs";
import { expect, it } from "vitest";
import type { Recommendation } from "../src/team/recommend/conditions.js";
import { festival } from "./proxy-fixture.js";
import { isReplyCall, withoutReplyEvents } from "./reply-fixture.js";
import { teamFixture } from "./team-fixture.js";

const summary = {
  ...festival,
  type: "불꽃",
  startsAt: "2026-10-03T18:00:00+09:00",
  endsAt: "2026-10-03T21:00:00+09:00",
};

// 분류가 명확한 방문객은 LLM·근거 적재·행사 카드 없이 원본 요약을 받는다
it("방문객에게 최대 열 개와 원래 전체 수를 보내며 recommend 순서를 지킨다", async () => {
  const summaries = Array.from({ length: 12 }, (_, i) => ({
    ...summary,
    eventId: `e-seoul-fireworks-${i}`,
  }));
  const harness = teamFixture({
    override: async ({ url }) =>
      url.pathname === "/v1/festivals/upcoming"
        ? Response.json(summaries)
        : undefined,
  });
  const events = await harness.message(await harness.create(), {
    text: "불꽃놀이 행사에 가고 싶어",
  });
  expect(sequenceProblems(events, { mode: "recommend" })).toEqual([]);
  const data = events.find((event) => event.event === "recommend")
    ?.data as Recommendation;
  expect(data.items).toHaveLength(10);
  expect(data.total).toBe(12);
  expect(data.items[0].summary).toEqual(summaries[0]);
  expect(
    harness.calls
      .filter((call) => !isReplyCall(call))
      .map((call) => call.url.pathname),
  ).toEqual(["/v1/festivals/upcoming"]);
});

// 빈 결과는 한 번만 넓히며 넓힌 뒤에도 없는 경우 정상 빈 목록과 안내를 보낸다
it.each([false, true])("기간 확장 뒤 결과 존재=%s", async (found) => {
  let reads = 0;
  const harness = teamFixture({
    override: async ({ url }) => {
      if (url.pathname !== "/v1/festivals/upcoming") return undefined;
      reads++;
      return Response.json(reads === 2 && found ? [summary] : []);
    },
  });
  const events = await harness.message(await harness.create(), {
    text: "이번 주말 불꽃 구경",
  });
  expect(sequenceProblems(events, { mode: "recommend" })).toEqual([]);
  expect(reads).toBe(2);
  const data = events.find((event) => event.event === "recommend")
    ?.data as Recommendation;
  expect(data.total).toBe(found ? 1 : 0);
  expect(data.note).toContain("기간을 넓혀");
  if (!found) expect(data.note).toContain("조건에 맞는 행사가 없어요");
  expect(
    harness.calls
      .filter((call) => !isReplyCall(call))[1]
      .url.searchParams.get("to"),
  ).toBe("2026-11-25");
});

// LLM이 없을 때도 목적 질문 하나만 하고 원래 검색어를 보존한 채 선택으로 재개한다
it("애매한 목적은 두 버튼으로 묻고 방문객 선택 뒤 원문으로 검색한다", async () => {
  const harness = teamFixture({
    override: async ({ url }) =>
      url.pathname === "/v1/festivals/upcoming"
        ? Response.json([summary])
        : undefined,
  });
  const id = await harness.create();
  const first = await harness.message(id, { text: "영종 불꽃축제" });
  expect(first.filter((event) => event.event === "ask")).toMatchObject([
    {
      data: {
        field: "intent",
        options: [
          { label: "행사를 여는 쪽이에요" },
          { label: "가 볼 행사를 찾아요" },
        ],
      },
    },
  ]);
  expect(first.some((event) => event.event === "event_card")).toBe(false);
  expect(
    withoutReplyEvents(first).filter((event) => event.event === "agent_step"),
  ).toHaveLength(1);
  const selected = await harness.message(id, { text: "가 볼 행사를 찾아요" });
  expect(sequenceProblems(selected, { mode: "recommend" })).toEqual([]);
  expect(
    (
      selected.find((event) => event.event === "recommend")
        ?.data as Recommendation
    )?.query.text,
  ).toBe("영종 불꽃축제");
});

// 스키마에 맞는 단 한 번의 분류 응답만 플레이북을 고를 수 있다
it("모호한 문장의 LLM 분류를 한 번 사용한다", async () => {
  const harness = teamFixture({
    recordings: {
      "purpose:축제 찾아줘": JSON.stringify({ purpose: "recommend" }),
    },
    override: async ({ url }) =>
      url.pathname === "/v1/festivals/upcoming"
        ? Response.json([summary])
        : undefined,
  });
  const events = await harness.message(await harness.create(), {
    text: "축제 찾아줘",
  });
  expect(sequenceProblems(events, { mode: "recommend" })).toEqual([]);
  expect(
    events.filter(
      (event) =>
        event.event === "agent_step" &&
        (event.data as { note: string }).note.includes("(LLM)"),
    ),
  ).toHaveLength(1);
});

// 서비스 장애를 정상적인 빈 검색 결과로 감추지 않는다
it("상류 장애는 recommend 오류 순서로 끝난다", async () => {
  const harness = teamFixture({
    override: async () => new Response(null, { status: 503 }),
  });
  const events = await harness.message(await harness.create(), {
    text: "축제 추천",
  });
  expect(sequenceProblems(events, { mode: "recommend" })).toEqual([]);
  expect(events.some((event) => event.event === "error")).toBe(true);
  expect(events.some((event) => event.event === "recommend")).toBe(false);
});

// 주최자 선택 뒤 받아쓰기에는 버튼 문구 대신 처음 말한 행사 원문을 넘긴다
it("주최자 선택으로 원래 행사 입력을 이어 간다", async () => {
  const harness = teamFixture();
  const id = await harness.create();
  await harness.message(id, { text: "영종 불꽃축제" });
  const events = await harness.message(id, { text: "행사를 여는 쪽이에요" });
  expect(events.some((event) => event.event === "event_card")).toBe(true);
  expect(events.some((event) => event.event === "recommend")).toBe(false);
  expect(
    events
      .filter((event) => event.event === "ask")
      .some((event) => (event.data as { field: string }).field === "intent"),
  ).toBe(false);
});
