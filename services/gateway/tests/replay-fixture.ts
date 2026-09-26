// 재생 테스트에서 계약 스트림과 임시 trace 폴더를 공유한다
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SseEvent } from "@crowdcast/contracts/types";
import { Hono } from "hono";
import { afterEach, vi } from "vitest";
import { createTeamReplayRoute } from "../src/routes/team-replay.js";
import type { ReplayWait } from "../src/team/replay/timing.js";

export const traceId = "s-1790290800000-0f472899-abcd-4cde-8abc-abcdef123456";
export const at = (ms: number) =>
  new Date(Date.UTC(2026, 8, 25) + ms).toISOString();
const directories: string[] = [];

// 테스트의 trace와 타이머는 다음 시나리오에 남기지 않는다
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

// 게이트 순서 사례는 계약의 정본 픽스처에서 읽는다
export function contractEvents(name = "valid-new-forecast"): SseEvent[] {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        `../../../packages/contracts/fixtures-sse/${name}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return Array.isArray(fixture) ? fixture : fixture.events;
}

// 실제 예보 수치를 만들지 않고 이미 검증된 이벤트에 trace 메타데이터만 붙인다
export function traceText(
  events: SseEvent[],
  requestId = "영종-요청",
  times?: (string | undefined)[],
) {
  return `${events
    .map((event, index) =>
      JSON.stringify({
        requestId,
        at: times ? times[index] : at(index * 120),
        ...event,
      }),
    )
    .join("\n")}\n`;
}

// 파일 읽기는 실제 파일 시스템을 거치고 대기만 주입한다
export function replayFixture(wait: ReplayWait = vi.fn(async () => {})) {
  const directory = mkdtempSync(join(tmpdir(), "crowdcast-replay-"));
  directories.push(directory);
  const app = new Hono().route(
    "/api/team/replay",
    createTeamReplayRoute(
      { traceDirectory: directory },
      { demoDirectory: directory, wait },
    ),
  );
  return {
    app,
    directory,
    wait,
    save(text: string, id = traceId) {
      const path = join(directory, `${id}.jsonl`);
      writeFileSync(path, text);
      return path;
    },
    // WHATWG URL이 지워 버리는 점 경로도 서버가 받은 원래 URL로 전달한다
    request(id = traceId, signal?: AbortSignal) {
      const request = new Request(
        "http://localhost/api/team/replay/placeholder",
        { signal },
      );
      Object.defineProperty(request, "url", {
        value: `http://localhost/api/team/replay/${id}`,
      });
      return app.request(request);
    },
  };
}
