// 실제 상담 라우트에 가짜 분류와 불변 records 스냅샷을 연결한다
// @ts-expect-error 계약 순서 규칙은 JavaScript로 배포된다
import { sequenceProblems } from "@crowdcast/contracts/rules/sse-sequence.mjs";
import type {
  Claim,
  Event,
  ForecastReport,
  SseEvent,
} from "@crowdcast/contracts/types";
import { expect } from "vitest";
import { explanationFixture } from "./report-fixture.js";
import { validSequence } from "./team-fixture.js";

// 저장 응답은 최초 예보서 그대로이며 why 재발행이 덮어쓸 수 없다
export function followupFixture(
  options: Parameters<typeof explanationFixture>[0] = {},
) {
  const storedEvents = new Map<string, Event>();
  const snapshots = new Map<string, ForecastReport>();
  const harness = explanationFixture({
    ...options,
    override: async (call) => {
      const override = await options.override?.(call);
      if (override) return override;
      const { url, body } = call;
      // 실제 records처럼 중복 행사 id는 거부하고 기존 행사는 조회로만 돌려준다
      if (url.pathname === "/v1/events" && body) {
        const event = body as Event;
        if (storedEvents.has(event.id))
          return new Response(null, { status: 409 });
        storedEvents.set(event.id, structuredClone(event));
        return Response.json(event);
      }
      if (/^\/v1\/events\/[^/]+$/.test(url.pathname) && !body) {
        const event = storedEvents.get(url.pathname.split("/").at(-1) ?? "");
        return event
          ? Response.json(event)
          : new Response(null, { status: 404 });
      }
      if (url.pathname.endsWith("/snapshots") && body) {
        const report = body as ForecastReport;
        snapshots.set(report.forecastId, structuredClone(report));
      }
      if (url.pathname.startsWith("/v1/snapshots/")) {
        const snapshot = snapshots.get(url.pathname.split("/").at(-1) ?? "");
        return snapshot
          ? Response.json(snapshot)
          : new Response(null, { status: 404 });
      }
      if (isClassification(call)) return classificationResponse("out_of_scope");
    },
  });
  return {
    ...harness,
    storedEvents,
    snapshots,
    // 발행 성공과 최초 보고서까지 확인하고 각 테스트의 후속 요청을 시작한다
    async publish() {
      const id = await harness.prepare();
      const events = await harness.message(id);
      validSequence(events);
      const forecastId = (
        events.at(-1)?.data as { forecastId: string } | undefined
      )?.forecastId;
      expect(forecastId).toEqual(expect.any(String));
      if (!forecastId) throw new Error("발행된 예보 id가 없습니다");
      const report = harness.calls.find((call) =>
        call.url.pathname.endsWith("/snapshots"),
      )?.body as ForecastReport;
      expect(report.forecastId).toBe(forecastId);
      return { id, forecastId, report };
    },
  };
}

// 분류 프롬프트 원문 대신 강제 출력 스키마로 분류 호출을 구분한다
export function isClassification(call: { url: URL; body: unknown }) {
  return (
    call.url.pathname === "/api/chat" &&
    !!(call.body as { format?: { properties?: { intent?: unknown } } })?.format
      ?.properties?.intent
  );
}

// Ollama SDK의 정상 완결 응답을 같은 JSON 형식으로 돌려준다
export function classificationResponse(intent: string) {
  return Response.json({
    message: { role: "assistant", content: JSON.stringify({ intent }) },
    done: true,
    done_reason: "stop",
    load_duration: 0,
    eval_count: 5,
  });
}

// 모든 후속 시나리오는 실제 스트림에 정본 followup 문맥을 적용한다
export function validFollowup(events: SseEvent[], forecastId: string) {
  expect(sequenceProblems(events, { mode: "followup", forecastId })).toEqual(
    [],
  );
  expect(events.at(-1)).toMatchObject({ event: "done", data: { forecastId } });
}

// 발행 문장을 꺼내 숫자와 근거를 시나리오마다 확인한다
export function claimsIn(events: SseEvent[]) {
  return events
    .filter((event) => event.event === "claim")
    .map((event) => event.data as Claim);
}
