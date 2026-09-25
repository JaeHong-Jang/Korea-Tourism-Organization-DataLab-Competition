// 계약 픽스처로 what-if 칩, 두 예보 비교와 후속 스트림 분기를 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  Claim,
  EventDraft,
  ForecastCard,
  SseEvent,
} from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ConsultMessages } from "./consult-messages";
import { whatIfChips } from "./followup-chips";
import { ForecastComparison } from "./forecast-comparison";
import { postConsultMessage } from "./post-consult-message";

const contract = (name: string): SseEvent[] =>
  JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "../../packages/contracts/fixtures-sse",
        `${name}.json`,
      ),
      "utf8",
    ),
  );
const original = contract("valid-new-forecast");
const draft = original.find((event) => event.event === "event_card")
  ?.data as EventDraft;
const card = original.find((event) => event.event === "forecast")
  ?.data as ForecastCard;
const frames = (events: SseEvent[]) =>
  events
    .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
afterEach(() => vi.unstubAllGlobals());

// 날짜·시간대·요금의 현재값을 뒤집고 비·사례 질문은 유지한다.
it("행사 조건에 맞는 다섯 칩을 고른다", () => {
  expect(whatIfChips(draft)).toEqual([
    "일요일이면?",
    "낮이면?",
    "유료면?",
    "비 오면?",
    "비슷한 행사는?",
  ]);
  expect(
    whatIfChips({
      ...draft,
      startsAt: "2025-10-19T19:00:00+09:00",
      timeOfDay: "주간",
      fee: "유료",
    }),
  ).toEqual([
    "토요일이면?",
    "밤이면?",
    "무료면?",
    "비 오면?",
    "비슷한 행사는?",
  ]);
});

// 비교 화면의 네 중앙값과 양 끝은 각각의 forecast-card JSON을 그대로 표시한다.
it("두 번째 카드의 조건·수치·예보서 링크를 비교한다", () => {
  const changed = structuredClone(card);
  changed.id = "f-yeongjong-sunday-2025";
  changed.peakConcurrent.p50 = 31_500;
  changed.dailyMean.p50 = 16_250;
  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <ForecastComparison
        original={{
          card,
          draft,
          request: "영종 씨사이드파크 불꽃축제",
          messageId: "m-1",
        }}
        changed={{
          card: changed,
          draft: { ...draft, startsAt: "2025-10-19T19:00:00+09:00" },
          request: "일요일이면?",
          messageId: "m-2",
        }}
        forecastId={changed.id}
      />
    </MemoryRouter>,
  );
  expect(markup).toContain("21,000명");
  expect(markup).toContain("31,500명");
  expect(markup).toContain("13,000명/일");
  expect(markup).toContain("16,250명/일");
  expect(markup).toContain("consult-compare__condition--changed");
  expect(markup).toContain(`/f/${changed.id}`);
  expect(markup.match(/같은 로그 눈금/g)).toHaveLength(2);
});

// 첫 예보와 후속 설명이 각각의 사용자 질문 바로 뒤에 나타난다.
it("후속 문장을 질문 순서에 맞춰 근거 칩 없이 표시한다", () => {
  const first = original.find((event) => event.event === "claim")?.data;
  const followup = (
    JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "../../packages/contracts/fixtures-sse/valid-followup-why.json",
        ),
        "utf8",
      ),
    ).events as SseEvent[]
  ).find((event) => event.event === "claim")?.data;
  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <ConsultMessages
        sent={[
          { id: "first", text: "영종 씨사이드파크 불꽃축제" },
          { id: "second", text: "왜 이렇게 많아?" },
        ]}
        claims={[
          { messageId: "first", claim: first as Claim },
          { messageId: "second", claim: followup as Claim },
        ]}
        forecasts={[]}
        replies={[]}
        work={[]}
        gateReplies={[]}
        completed={["first", "second"]}
        busy={false}
      />
    </MemoryRouter>,
  );
  expect(markup.indexOf("영종 씨사이드파크 불꽃축제")).toBeLessThan(
    markup.indexOf("왜 이렇게 많아?"),
  );
  expect(markup.indexOf("왜 이렇게 많아?")).toBeLessThan(
    markup.indexOf("토요일 저녁에 열려서"),
  );
  expect(markup).not.toContain("근거 ·");
});

// 발행된 예보 뒤에는 새 예보 A→B와 설명 후속 B→발행을 모두 계약대로 통과시킨다.
it.each(["valid-new-forecast", "valid-followup-why"])(
  "%s 후속 응답을 받는다",
  async (name) => {
    const document = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "../../packages/contracts/fixtures-sse",
          `${name}.json`,
        ),
        "utf8",
      ),
    );
    const events = (
      Array.isArray(document) ? document : document.events
    ) as SseEvent[];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(frames(events), {
            headers: { "Content-Type": "text/event-stream" },
          }),
      ),
    );
    const received: SseEvent[] = [];
    await postConsultMessage(
      "s-demo-0001",
      { text: "일요일이면?" },
      new AbortController().signal,
      card.id,
      (event) => received.push(event),
    );
    expect(received).toEqual(events);
    expect(received.some((event) => event.event === "forecast")).toBe(
      name === "valid-new-forecast",
    );
  },
);
