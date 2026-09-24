// 저장된 요청을 전부 검증한 뒤 새 예보와 같은 SSE 헤더·봉투로 재생한다
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { playTrace } from "../team/replay/play-trace.js";
import { readTrace } from "../team/replay/read-trace.js";
import { ReplayError } from "../team/replay/replay-error.js";
import type { ReplayWait } from "../team/replay/timing.js";
import { validateTrace } from "../team/replay/validate-trace.js";
import {
  type TeamSettings,
  teamTraceDirectory,
} from "../team/runtime/settings.js";

// 라이브 경로는 팀 설정과 공유하고 대기·발표 폴더는 테스트에서만 주입한다
export function createTeamReplayRoute(
  settings: Pick<TeamSettings, "traceDirectory"> = {
    traceDirectory: teamTraceDirectory(),
  },
  options: { wait?: ReplayWait; demoDirectory?: string } = {},
) {
  const route = new Hono();
  // 재생 입력·파일 오류를 스트림 시작 전 계약의 JSON 오류 응답으로 돌려준다
  route.onError((error, c) => {
    if (error instanceof ReplayError)
      return c.json({ code: error.code, message: error.message }, error.status);
    return c.json(
      { code: "TRACE_INVALID", message: "재생 파일을 처리할 수 없습니다." },
      422,
    );
  });
  // 요청 전체를 검증한 뒤 연결이 유지되는 동안에만 저장된 이벤트를 보낸다
  route.get("/:traceId", async (c) => {
    const text = await readTrace(
      c.req.param("traceId"),
      settings,
      options.demoDirectory,
    );
    const events = validateTrace(text);
    c.header("Cache-Control", "no-cache");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      const disconnected = new AbortController();
      const cancel = () => {
        disconnected.abort();
        stream.abort();
      };
      stream.onAbort(() => disconnected.abort());
      c.req.raw.signal.addEventListener("abort", cancel, { once: true });
      if (c.req.raw.signal.aborted) cancel();

      // 응답 소비 취소와 HTTP 연결 종료 모두 대기 및 막힌 쓰기를 해제한다
      try {
        await playTrace(
          events,
          async (event) => {
            await stream.writeSSE({
              event: event.event,
              id: String(event.seq),
              data: JSON.stringify(event),
            });
          },
          disconnected.signal,
          options.wait,
        );
      } finally {
        c.req.raw.signal.removeEventListener("abort", cancel);
      }
    });
  });
  // 슬래시를 포함한 경로 조작과 빈 식별자도 JSON 400으로 통일한다
  route.get("/*", () => {
    throw new ReplayError(
      "BAD_TRACE_ID",
      400,
      "재생 식별자 형식이 맞지 않습니다.",
    );
  });
  return route;
}
