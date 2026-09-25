// 계약 기반 가짜 서비스와 실제 SSE 라우트를 묶어 새 예보 시나리오를 재현한다
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error 계약의 SSE 순서 실행기는 JavaScript로 배포된다
import { sequenceProblems } from "@crowdcast/contracts/rules/sse-sequence.mjs";
import type { SseEvent } from "@crowdcast/contracts/types";
import { Hono } from "hono";
import { afterEach, expect, vi } from "vitest";
import { readConfig } from "../src/config.js";
import { contractRegistry } from "../src/contract/registry.js";
import type { SessionFacts } from "../src/contract/session-facts.js";
import { createTeamSessionsRoute } from "../src/routes/team-sessions.js";
import type {
  DraftAnswer,
  TeamMessage,
} from "../src/team/analysis/draft-answer.js";
import { fakeForecastFetch } from "../src/team/runtime/fake-forecast.js";
import type { TeamOptions } from "../src/team/runtime/settings.js";
import { knowledgeFixture } from "./knowledge-fixture.js";

export const fullText =
  "2026년 10월 18일 19~21시 인천 중구 영종 씨사이드파크에서 영종 불꽃축제를 열어요. 무료이고 주최는 인천 중구청입니다. 예산 2억원, 폭죽을 사용해요.";
export const shortText = "10월 18일 영종 씨사이드파크에서 불꽃축제를 해요";
export const extracted = {
  name: "영종 불꽃축제",
  typeText: "불꽃",
  dateText: "2026년 10월 18일",
  timeText: "19~21시",
  venueText: "인천 중구 영종 씨사이드파크",
  feeText: "무료",
  hostText: "인천 중구청",
  budgetText: "2억원",
  promo: [],
  hazards: ["폭죽"],
};
export const answer: DraftAnswer = {
  name: "영종 불꽃축제",
  type: "불꽃",
  startsAt: "2026-10-18T19:00:00+09:00",
  endsAt: "2026-10-18T21:00:00+09:00",
  timeOfDay: "야간",
  venueText: "인천 중구 영종 씨사이드파크",
  fee: "무료",
  hostType: "지자체",
  budgetKrw: null,
  hazards: ["폭죽"],
};
const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

export type Call = { url: URL; body: unknown; signal?: AbortSignal | null };
type Options = TeamOptions & {
  override?: (call: Call) => Promise<Response | undefined>;
  // 가짜 서비스가 처리한 뒤의 응답을 바꿔 "처리됐지만 응답 유실"을 흉내 낸다
  afterResponse?: (
    call: Call,
    response: Response,
  ) => Promise<Response | undefined>;
};

// 실제 계약 참조 검사로 가짜 knowledge의 잘못된 적재 순서도 실패시킨다
export function teamFixture(options: Options = {}) {
  vi.setSystemTime(new Date("2026-09-25T03:00:00Z"));
  const traceDirectory = mkdtempSync(join(tmpdir(), "crowdcast-team-"));
  directories.push(traceDirectory);
  const calls: Call[] = [];
  const knowledge = knowledgeFixture();
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call = { url, body, signal: init?.signal };
    calls.push(call);
    const override = await options.override?.(call);
    if (override) return override;
    const response =
      knowledge(url, body as SessionFacts | undefined) ??
      (await fakeForecastFetch(input, init));
    return (await options.afterResponse?.(call, response)) ?? response;
  };
  const app = new Hono().route(
    "/api/team/sessions",
    createTeamSessionsRoute(readConfig({}), fetcher, {
      ...options,
      traceDirectory,
      env: {
        LLM_MODE: "fake",
        FORECAST_MODE: "live",
        CROWDCAST_TODAY: "2026-09-25",
        ...options.env,
      },
      recordings: {
        [fullText]: JSON.stringify(extracted),
        [shortText]: JSON.stringify({
          ...extracted,
          name: "불꽃축제",
          typeText: null,
          dateText: "10월 18일",
          timeText: null,
          venueText: "영종 씨사이드파크",
          feeText: null,
          hostText: null,
          budgetText: null,
          hazards: [],
        }),
        ...options.recordings,
      },
    }),
  );
  return {
    app,
    fetcher,
    calls,
    knowledgeClaims: knowledge.claims,
    traceDirectory,
    // HTTP로 세션을 생성해 식별자 규칙과 저장소 연결도 함께 검사한다
    async create() {
      const response = await app.request("/api/team/sessions", {
        method: "POST",
      });
      expect(response.status).toBe(200);
      const { sessionId } = await response.json();
      expect(sessionId).toMatch(/^s-\d+-[a-f0-9-]+$/);
      return sessionId as string;
    },
    // SSE 전체를 실제 응답 스트림에서 읽고 각 봉투를 검증한다
    async message(
      id: string,
      message: TeamMessage = {
        text: "위험요소 확인",
        answer: { hazards: ["폭죽"] },
      },
    ) {
      const response = await app.request(`/api/team/sessions/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      return parseEvents(await response.text());
    },
    // 분석 시나리오는 실제 첫 요청의 위험 질문까지 받은 세션에서 시작한다
    async prepare() {
      const id = await this.create();
      const events = await this.message(id, { text: fullText });
      validSequence(events);
      expect(events.filter((event) => event.event === "ask")).toMatchObject([
        { data: { field: "hazards" } },
      ]);
      return id;
    },
    trace(id: string) {
      return readFileSync(join(traceDirectory, `${id}.jsonl`), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    },
  };
}

// SSE 프레임 이름·id와 계약 봉투가 일치하는지 확인한다
export function parseEvents(text: string): SseEvent[] {
  const validate = contractRegistry.getSchema(
    "https://crowdcast.local/schemas/sse-event.schema.json",
  );
  return text
    .trim()
    .split("\n\n")
    .map((frame) => {
      const data = JSON.parse(
        frame
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6) ?? "null",
      );
      expect(validate?.(data), JSON.stringify(validate?.errors)).toBe(true);
      expect(frame).toContain(`event: ${data.event}\n`);
      expect(frame).toContain(`id: ${data.seq}`);
      return data;
    });
}

// 성공·오류·되묻기 모두 같은 정본 순서 검사기를 통과해야 한다
export function validSequence(events: SseEvent[]) {
  expect(sequenceProblems(events, { mode: "new" })).toEqual([]);
  expect(events.at(-1)).toMatchObject({
    event: "done",
  });
}
