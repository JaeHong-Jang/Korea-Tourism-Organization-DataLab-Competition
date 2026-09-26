// 계약 추천과 입력칸 되묻기, 움직임 줄이기 표시를 독립적으로 확인한다.
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FestivalSummary, SseEvent } from "@crowdcast/contracts/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import festival from "../../../../../packages/contracts/fixtures/festival-summary/valid-card.json";
import { useAssistantStore } from "../../lib/consult-store";
import { AskReply } from "../consult-chat/ask-reply";
import { postConsultMessage } from "../consult-chat/post-consult-message";
import { FloatingWhale } from "./floating-whale";
import { RecommendationCards } from "./recommendation-cards";

const fixtureDocument = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../../packages/contracts/fixtures-sse/valid-recommend.json",
    ),
    "utf8",
  ),
) as { events: SseEvent[] };
const recommend = fixtureDocument.events.find(
  (event) => event.event === "recommend",
)?.data;
const frames = fixtureDocument.events
  .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
  .join("");

afterEach(() => vi.unstubAllGlobals());
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 행사 고르기는 전역 요청을 남기고 패널을 열며 SSE 본문에 eventId가 유지된다.
it("선택 행사와 추천 스트림을 계약대로 전달한다", async () => {
  useAssistantStore.getState().chooseFestival(festival as FestivalSummary);
  expect(useAssistantStore.getState().open).toBe(true);
  expect(useAssistantStore.getState().requestedFestival?.eventId).toBe(
    festival.eventId,
  );
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(frames, {
        headers: { "Content-Type": "text/event-stream" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const received: SseEvent[] = [];
  await postConsultMessage(
    "s-demo-0001",
    { text: `${festival.name} 예보해 줘`, eventId: festival.eventId },
    new AbortController().signal,
    null,
    (event) => received.push(event),
  );
  expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string).eventId).toBe(
    festival.eventId,
  );
  expect(received).toEqual(fixtureDocument.events);
});

// 위치는 요청 본문에만 담고 팀장의 자연스러운 답은 계약 검사 뒤 받는다.
it("위치 추천 요청과 reply 이벤트를 전달한다", async () => {
  const done = fixtureDocument.events.at(-1);
  if (!done) throw new Error("추천 픽스처에 완료 이벤트가 없어요.");
  const events = [
    ...fixtureDocument.events.slice(0, -1),
    {
      event: "reply",
      seq: fixtureDocument.events.length - 1,
      data: { text: "가까운 행사를 골라 봤어요.", source: "template" },
    },
    { ...done, seq: fixtureDocument.events.length },
  ] as SseEvent[];
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        events
          .map(
            (event) =>
              `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`,
          )
          .join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const received: SseEvent[] = [];
  await postConsultMessage(
    "s-demo-0001",
    {
      text: "내 위치에서 가까운 축제 찾아줘",
      near: { lat: 37.4563, lng: 126.7052 },
    },
    new AbortController().signal,
    null,
    (event) => received.push(event),
  );
  expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string).near).toEqual({
    lat: 37.4563,
    lng: 126.7052,
  });
  expect(received.some((event) => event.event === "reply")).toBe(true);
});

// 추천은 계약의 인원 구간·이유를 그대로 보여 주고 빈 목록이면 조건 변경을 제안한다.
it("추천 카드가 근거 문구와 구간을 표시한다", () => {
  const markup = renderToStaticMarkup(
    <MemoryRouter>
      <RecommendationCards
        recommendation={
          recommend as Parameters<
            typeof RecommendationCards
          >[0]["recommendation"]
        }
        onChangeConditions={() => {}}
      />
    </MemoryRouter>,
  );
  expect(markup).toContain("영종 씨사이드파크 불꽃축제");
  expect(markup).toContain("불꽃 · 다가오는 30일 안");
  expect(markup).toContain("1.2만 명");
  expect(markup).toContain("지도에서 보기");
});

// 자유 답은 질문 밑의 별도 칸 없이 공용 보내기 입력에서 전송한다.
it("되묻기 자유 답을 공용 입력칸에서 보낸다", async () => {
  const node = document.createElement("div");
  const root = createRoot(node);
  const reply = vi.fn();
  await act(async () =>
    root.render(
      <AskReply
        asks={[
          { field: "venueText", question: "장소를 알려 주세요.", options: [] },
        ]}
        draft={null}
        text="영종 씨사이드파크"
        onText={() => {}}
        onStop={() => {}}
        disabled={false}
        replyError=""
        onReply={reply}
      />,
    ),
  );
  expect(node.querySelectorAll("textarea")).toHaveLength(1);
  expect(node.textContent).not.toContain("직접 입력");
  await act(async () =>
    node
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(reply).toHaveBeenCalledWith({
    text: "영종 씨사이드파크",
    answer: { venueText: "영종 씨사이드파크" },
  });
  await act(async () => root.unmount());
});

// 정지 설정은 WebGL 캔버스를 만들지 않고 접근 가능한 버튼의 펫 그림을 남긴다.
it("움직임 줄이기에서도 사용자 고래 그림을 쓴다", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const markup = renderToStaticMarkup(
    <FloatingWhale
      working={false}
      published={false}
      panelOpen={false}
      onClick={() => {}}
    />,
  );
  expect(markup).toContain("/assistant/whale.png");
  expect(markup).not.toContain("<canvas");
});
