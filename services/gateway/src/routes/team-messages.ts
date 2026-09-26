// 상담 메시지 본문과 세션 잠금을 확인한 뒤 예보팀 SSE를 연다
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { validateMessage } from "../team/analysis/draft-answer.js";
import { Deadline } from "../team/lead/deadline.js";
import { createEventWriter } from "../team/runtime/events.js";
import { runRequest } from "../team/runtime/run-request.js";
import type { SessionStore } from "../team/runtime/sessions.js";
import type { TeamSettings } from "../team/runtime/settings.js";

// 존재하지 않는 세션이나 잘못된 답변은 스트림을 시작하기 전에 거부한다
export function createTeamMessagesRoute(
  store: SessionStore,
  settings: TeamSettings,
) {
  const route = new Hono();
  route.post("/:id/messages", async (c) => {
    const session = store.get(c.req.param("id"));
    if (!session) return c.json({ message: "상담 세션이 없습니다." }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "JSON 본문이 필요합니다." }, 400);
    }
    if (!validateMessage(body))
      return c.json({ message: "메시지 또는 답변 형식이 맞지 않습니다." }, 400);
    if (session.busy)
      return c.json({ message: "이 상담의 분석이 진행 중입니다." }, 409);
    session.busy = true;

    // SSE data에는 seq를 포함한 계약 봉투를 넣고 event·id도 함께 전송한다
    c.header("Cache-Control", "no-cache");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      const disconnected = new AbortController();
      const deadline = new Deadline(settings.deadlineMs);
      stream.onAbort(() => disconnected.abort(new Error("상담 연결 종료")));
      const writer = createEventWriter(
        session,
        settings,
        randomUUID(),
        async (event, signal) => {
          // Hono의 대기 중인 쓰기도 끊어 마감 뒤 프레임이 뒤늦게 나가지 않게 한다
          const cancel = () => stream.abort();
          signal.addEventListener("abort", cancel, { once: true });
          try {
            signal.throwIfAborted();
            await stream.writeSSE({
              event: event.event,
              id: String(event.seq),
              data: JSON.stringify(event),
            });
          } finally {
            signal.removeEventListener("abort", cancel);
          }
        },
        deadline,
        disconnected.signal,
      );
      await runRequest(
        session,
        body,
        writer,
        settings,
        disconnected.signal,
        deadline,
      );
    });
  });
  return route;
}
