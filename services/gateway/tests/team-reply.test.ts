// 팀장 생성 답변의 대체 경로·발행 순서·전역 호출 상한을 실제 상담으로 검증한다
// @ts-expect-error 순서 규칙 정본은 JavaScript로 제공된다
import { sequenceProblems } from "@crowdcast/contracts/rules/sse-sequence.mjs";
import type { SseEvent } from "@crowdcast/contracts/types";
import { expect, it } from "vitest";
import { readConfig } from "../src/config.js";
import { Deadline } from "../src/team/lead/deadline.js";
import { emitReply } from "../src/team/lead/reply.js";
import {
  type ReplyFacts,
  speakableName,
} from "../src/team/lead/reply-facts.js";
import { checkedReply } from "../src/team/lead/reply-guard.js";
import type { Agent } from "../src/team/runtime/agent.js";
import { createExecutor } from "../src/team/runtime/executor.js";
import { teamSettings } from "../src/team/runtime/settings.js";
import { followupFixture } from "./followup-fixture.js";
import { festival } from "./proxy-fixture.js";
import { isReplyCall, replyResponse } from "./reply-fixture.js";
import { teamFixture } from "./team-fixture.js";

const summary = {
  ...festival,
  startsAt: "2026-10-03T18:00:00+09:00",
  endsAt: "2026-10-03T21:00:00+09:00",
};

const facts: ReplyFacts = {
  names: ["진천농다리축제"],
  grades: [],
  conditions: ["가까운 순"],
  phrases: [],
  template: "가까운 순으로 축제를 골라 봤어요. 마음에 드는 행사를 골라 주세요.",
};

// 한글 수사·유니코드 숫자·발명한 이름·과장·길이·문장 수를 모두 거부한다
it.each([
  "가까운 축제 3개를 골랐어요.",
  "축제 세 곳을 골랐어요.",
  "축제 ３개를 골랐어요.",
  "청주비밀축제를 골라 봤어요.",
  "진천농다리축제는 안전해요.",
  "위험이 없어요.",
  "마음에 드는 행사를 골라 주세요. 가까운 순으로 골라 봤어요. 함께 살펴보세요.",
  "가".repeat(401),
  "",
  "무료로 예약해 드릴게요.",
  "청주시에서 열리는 행사를 골라 봤어요.",
])("부적합 생성 답변: %s", (text) =>
  expect(checkedReply({ text }, facts)).toBeNull(),
);

// 허용된 이름과 결과 어휘로 만든 친근한 문장은 생성 결과로 사용할 수 있다
it("정상 문장과 행사 이름만 허용한다", () => {
  expect(checkedReply({ text: facts.template }, facts)).toBe(facts.template);
  expect(
    checkedReply(
      { text: "진천농다리축제를 골라 봤어요. 함께 살펴보세요." },
      facts,
    ),
  ).not.toBeNull();
  expect(
    checkedReply({ text: facts.template, extra: "정보" }, facts),
  ).toBeNull();
});

// 출발지를 행사 장소처럼 말하면(진천군에서 열리는 안성 축제) 틀린 사실이라 거절한다
it("출발지를 행사 장소로 바꿔 말하지 않는다", () => {
  const near: ReplyFacts = {
    ...facts,
    names: ["바우덕이축제"],
    places: ["바우덕이축제 — 안성시"],
    origin: "진천군",
  };
  expect(
    checkedReply(
      { text: "진천군에서 열리는 바우덕이축제를 골라 봤어요." },
      near,
    ),
  ).toBeNull();
  expect(
    checkedReply(
      { text: "진천군에서 가까운 안성시의 바우덕이축제를 골라 봤어요." },
      near,
    ),
  ).not.toBeNull();
});

// 완화 뒤에는 사실을 바꾸지 않는 자연스러운 말투를 막지 않는다(9/25 사용자 요청)
it.each([
  "가까운 순으로 추천해 드릴게요. 마음에 드는 행사가 있을 거예요.",
  "가까운 순으로 보았어요. 마음에 드는 축제를 골라보세요.",
  "원하시는 축제를 가까운 곳부터 모아 봤어요. 지도에서 한번 살펴보세요.",
  "진천농다리축제부터 둘러보시면 좋겠어요.",
])("자연스러운 생성 답변: %s", (text) =>
  expect(checkedReply({ text }, facts)).toBe(text),
);

// 예보 결과 답에서 지어낸 행사 이름·다른 지역을 말하면 거절한다(9/26 "서울에서 열리는 코리아 인터내셔널 페스티벌" 회귀)
it("예보한 행사의 이름과 지역만 말한다", () => {
  const published: ReplyFacts = {
    ...facts,
    names: ["운정호수공원 불꽃축제"],
    places: ["운정호수공원 불꽃축제 — 파주시"],
  };
  for (const text of [
    "서울에서 열리는 코리아 인터내셔널 페스티벌 예보를 마쳤어요.",
    "파주시 코리아 인터내셔널 페스티벌 예보를 마쳤어요.",
    "서울에서 열리는 운정호수공원 불꽃축제 예보를 마쳤어요.",
  ])
    expect(checkedReply({ text }, published)).toBeNull();
  const good = "파주시에서 열리는 운정호수공원 불꽃축제 예보를 마쳤어요.";
  expect(checkedReply({ text: good }, published)).toBe(good);
});

// 회차·연도가 붙은 이름은 숫자를 떼고 부를 이름만 남긴다
it.each([
  ["제8회 운정호수공원 불꽃축제", "운정호수공원 불꽃축제"],
  ["2026 진천농다리축제", "진천농다리축제"],
  ["바우덕이축제 2026", "바우덕이축제"],
])("부를 이름: %s", (name, spoken) => expect(speakableName(name)).toBe(spoken));

// 매 응답의 reply는 하나이며 마지막 done 앞에만 있고 계약 순서를 지킨다
function expectReply(events: SseEvent[], mode = "new", forecastId?: string) {
  expect(sequenceProblems(events, { mode, forecastId })).toEqual([]);
  expect(events.filter((event) => event.event === "reply")).toHaveLength(1);
  expect(events.at(-2)).toMatchObject({
    event: "reply",
    data: { text: expect.any(String) },
  });
  expect(
    (events.at(-2)?.data as { text: string } | undefined)?.text,
  ).not.toMatch(/\p{N}/u);
  expect(events.at(-1)?.event).toBe("done");
}

// fake 녹화 응답도 실제 출력 검사 뒤에만 llm으로 표시한다
it.each([
  [
    "말씀하신 조건에 맞는 행사를 찾아봤어요. 마음에 드는 행사를 골라 주세요.",
    "llm",
  ],
  ["축제 5개를 찾았어요.", "template"],
  ["울릉도비밀축제를 찾아봤어요.", "template"],
])("추천 reply 검사: %s", async (text, source) => {
  const harness = teamFixture({
    recordings: { reply: JSON.stringify({ text }) },
    override: async ({ url }) =>
      url.pathname === "/v1/festivals/upcoming"
        ? Response.json([summary])
        : undefined,
  });
  const events = await harness.message(await harness.create(), {
    text: "축제 추천",
  });
  expectReply(events, "recommend");
  expect(events.at(-2)?.data).toMatchObject({ source });
});

// 실제 SDK 경로의 요청에는 조회 결과 이름·등급만 있고 원문·숫자·GPS는 없다
it("빠른 로컬 모델 입력에는 숫자 없는 결과 사실만 전달한다", async () => {
  const harness = teamFixture({
    env: {
      LLM_MODE: "ollama",
      OLLAMA_MODEL_FAST: "qwen3:4b-instruct-2507-q4_K_M",
    },
    override: async (call) => {
      if (call.url.pathname === "/v1/festivals/upcoming")
        return Response.json([{ ...summary, name: "2026 영종 불꽃축제" }]);
      if (isReplyCall(call)) return replyResponse(facts.template);
    },
  });
  const near = {
    lat: festival.lat,
    lng: festival.lng,
    label: "출발 주소 비공개",
  };
  const events = await harness.message(await harness.create(), {
    text: "가까운 축제 12345",
    near,
  });
  expectReply(events, "recommend");
  expect(events.at(-2)?.data).toMatchObject({ source: "llm" });
  const calls = harness.calls.filter(isReplyCall);
  expect(calls).toHaveLength(1);
  const body = calls[0].body as {
    model: string;
    messages: { content: string }[];
  };
  expect(body.model).toBe("qwen3:4b-instruct-2507-q4_K_M");
  expect(body.messages[1].content).not.toMatch(/\p{N}/u);
  expect(body.messages[1].content).not.toContain("출발 주소");
});

// 새 예보와 질문·후속 설명·저장·범위 밖·what-if도 같은 종료 규칙을 따른다
it("모든 상담 모드가 reply를 한 번 보낸다", async () => {
  const harness = followupFixture();
  const { id, forecastId } = await harness.publish();
  const published = harness.trace(id);
  const requestId = published.at(-1).requestId;
  const events = published.filter((event) => event.requestId === requestId);
  expectReply(events);
  const replyIndex = events.findIndex((event) => event.event === "reply");
  expect(replyIndex).toBeGreaterThan(
    events.findIndex(
      (event) => event.event === "gate" && event.data.gate === "publish",
    ),
  );
  for (const text of ["왜 이런 결과야", "저장해 줘", "김치찌개 조리법 알려 줘"])
    expectReply(await harness.message(id, { text }), "followup", forecastId);
  expectReply(await harness.message(id, { text: "요일 바꾸면?" }));
  expectReply(
    await harness.message(await harness.create(), { text: "행사를 열어요" }),
  );
  expectReply(
    await harness.message(await harness.create(), {
      text: "계획 초안 만들어 줘",
    }),
  );
});

// 게이트 A 실패와 마감 취소에도 숫자 없는 template 안내를 남긴다
it.each(["gate", "deadline"])("실패 안내: %s", async (kind) => {
  const harness = teamFixture({
    deadlineMs: kind === "deadline" ? 150 : 20000,
    override: async ({ url }) => {
      if (kind === "deadline" && url.pathname === "/v1/predict")
        return new Promise(() => {});
      if (kind === "gate" && url.pathname.endsWith("/validate"))
        return Response.json({
          gate: "A",
          passed: false,
          revision: Number(url.searchParams.get("revision")),
          masterVersion: 7,
          violations: [],
        });
    },
  });
  const events = await harness.message(await harness.prepare());
  expectReply(events);
  expect(events.some((event) => event.event === "error")).toBe(true);
  expect(events.at(-2)?.data).toMatchObject({ source: "template" });
});

// 서로 다른 실행기와 반복 호출도 요청 마감을 공유하므로 최종 안내가 상한을 넘지 않는다
it("세 번의 LLM 호출 뒤 reply는 템플릿이며 다음 요청은 새 예산이다", async () => {
  let calls = 0;
  const settings = teamSettings(
    readConfig({}),
    async () => {
      calls++;
      return replyResponse(facts.template);
    },
    { env: { LLM_MODE: "ollama" } },
  );
  const deadline = new Deadline();
  const sent: { event: string; data: unknown }[] = [];
  const writer = {
    emit: async (event: string, data: unknown) => {
      sent.push({ event, data });
    },
  };
  const agent: Agent<null, null> = {
    id: "lead",
    team: "lead",
    usesLlm: true,
    budgetMs: 1000,
    async run(ctx) {
      await ctx.llm.complete({
        schema: {},
        messages: [],
        recordingKey: "budget",
      });
      return { value: null, note: "호출 완료" };
    },
  };
  try {
    for (let index = 0; index < 3; index++)
      await createExecutor(
        `s-budget-${index}`,
        settings,
        deadline,
        writer,
      )(agent, null, "호출 예산 확인");
    await expect(
      createExecutor(
        "s-budget-extra",
        settings,
        deadline,
        writer,
      )(agent, null, "상한 확인"),
    ).rejects.toThrow("상한");
    await emitReply(
      facts,
      createExecutor("s-budget-reply", settings, deadline, writer),
      writer,
      deadline,
    );
    expect(calls).toBe(3);
    expect(sent.at(-1)).toMatchObject({
      event: "reply",
      data: { source: "template" },
    });
  } finally {
    deadline.dispose();
  }
  const next = new Deadline();
  try {
    await emitReply(
      facts,
      createExecutor("s-budget-next", settings, next, writer),
      writer,
      next,
    );
    expect(calls).toBe(4);
    expect(sent.at(-1)).toMatchObject({
      event: "reply",
      data: { source: "llm" },
    });
  } finally {
    next.dispose();
  }
});
