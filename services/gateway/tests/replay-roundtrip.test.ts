// 실제 예보팀이 기록한 요청의 왕복 일치와 재생 전후 파일 불변을 검증한다

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createTeamReplayRoute } from "../src/routes/team-replay.js";
import { readTrace } from "../src/team/replay/read-trace.js";
import { teamTraceDirectory } from "../src/team/runtime/settings.js";
import { appendTrace } from "../src/team/runtime/trace.js";
import { contractEvents, replayFixture, traceText } from "./replay-fixture.js";
import { isReplyCall, withoutReplyEvents } from "./reply-fixture.js";
import { parseEvents, shortText, teamFixture } from "./team-fixture.js";

describe("실제 세션 trace 왕복", () => {
  // 분석 완료 뒤 범위 밖 요청만 실제 writer로 기록해 오류 종료도 그대로 재생한다
  it("OUT_OF_SCOPE 뒤 예보 id 없이 done인 실제 요청을 재생한다", async () => {
    let recording = false;
    const harness = teamFixture({
      env: { FORECAST_MODE: "fake" },
      // 발행 실패한 분석 세션의 오류 재생은 기존 null 종료 규칙을 유지한다
      override: async ({ url }) =>
        url.pathname.endsWith("/publish")
          ? new Response(null, { status: 503 })
          : undefined,
      traceAppend: async (...args) => {
        if (recording) await appendTrace(...args);
      },
    });
    const id = await harness.prepare();
    await harness.message(id);
    recording = true;
    const original = await harness.message(id, {
      text: "날짜 변경",
      answer: { startsAt: "2026-10-19T19:00:00+09:00" },
    });
    expect(withoutReplyEvents(original)).toMatchObject([
      { event: "error", seq: 0, data: { code: "OUT_OF_SCOPE" } },
      {
        event: "done",
        seq: original.length - 1,
        data: { sessionId: id, forecastId: null },
      },
    ]);
    expect(harness.trace(id)).toHaveLength(original.length);

    // 실제 파일을 사전 검증하고 외부 호출 없이 오류·완료 봉투와 간격을 전달한다
    const wait = vi.fn(async () => {});
    const replay = new Hono().route(
      "/api/team/replay",
      createTeamReplayRoute(harness, { wait }),
    );
    const callsBefore = harness.calls.filter(
      (call) => !isReplyCall(call),
    ).length;
    const response = await replay.request(`/api/team/replay/${id}`);
    expect(response.status).toBe(200);
    expect(parseEvents(await response.text())).toEqual(original);
    expect(harness.calls.filter((call) => !isReplyCall(call))).toHaveLength(
      callsBefore,
    );
    expect(wait).toHaveBeenCalledTimes(original.length - 1);
  });

  // 첫 요청이 되묻기로 끝나도 분석 요청과 함께 기록된 실제 세션에서 그대로 재생한다
  it("필수값 누락으로 ask 뒤 done인 첫 요청을 재생한다", async () => {
    const harness = teamFixture({ env: { FORECAST_MODE: "fake" } });
    const id = await harness.create();
    const original = await harness.message(id, { text: shortText });
    expect(original.some((event) => event.event === "event_card")).toBe(true);
    expect(original.some((event) => event.event === "ask")).toBe(true);
    expect(original.some((event) => event.event === "gate")).toBe(false);
    expect(original.at(-1)).toMatchObject({
      event: "done",
      data: { forecastId: null },
    });
    await harness.message(id, {
      text: shortText,
      answer: {
        startsAt: "2026-10-18T19:00:00+09:00",
        endsAt: "2026-10-18T21:00:00+09:00",
        hostType: "지자체",
        hazards: ["폭죽"],
      },
    });
    expect(new Set(harness.trace(id).map((row) => row.requestId)).size).toBe(2);

    // 재생 과정에서는 추가 서비스 호출 없이 첫 요청의 봉투만 전송한다
    const wait = vi.fn(async () => {});
    const replay = new Hono().route(
      "/api/team/replay",
      createTeamReplayRoute(harness, { wait }),
    );
    const callsBefore = harness.calls.filter(
      (call) => !isReplyCall(call),
    ).length;
    const response = await replay.request(`/api/team/replay/${id}`);
    expect(response.status).toBe(200);
    expect(parseEvents(await response.text())).toEqual(original);
    expect(harness.calls.filter((call) => !isReplyCall(call))).toHaveLength(
      callsBefore,
    );
    expect(wait).toHaveBeenCalledTimes(original.length - 1);
  });

  // 되묻기 준비 뒤 분석 요청 한 건을 실제 writer로 기록해 첫 요청 재생과 비교한다
  it("가짜 LLM·예측을 거친 실제 SSE와 재생 event·seq·data가 완전히 같다", async () => {
    let recording = false;
    const harness = teamFixture({
      env: { FORECAST_MODE: "fake" },
      traceAppend: async (...args) => {
        if (recording) await appendTrace(...args);
      },
    });
    const id = await harness.prepare();
    recording = true;
    const original = await harness.message(id);
    expect(original.some((event) => event.event === "forecast")).toBe(true);
    const path = join(harness.traceDirectory, `${id}.jsonl`);
    const before = readFileSync(path, "utf8");
    const beforeStat = statSync(path);
    const names = readdirSync(harness.traceDirectory);
    const wait = vi.fn(async () => {});
    const replay = new Hono().route(
      "/api/team/replay",
      createTeamReplayRoute(harness, { wait }),
    );
    const callsBefore = harness.calls.filter(
      (call) => !isReplyCall(call),
    ).length;
    const response = await replay.request(`/api/team/replay/${id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(parseEvents(await response.text())).toEqual(original);
    expect(harness.calls.filter((call) => !isReplyCall(call))).toHaveLength(
      callsBefore,
    );

    // 재생은 trace append를 호출하지 않고 바이트·수정 시각·폴더 목록을 그대로 둔다
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(statSync(path).mtimeMs).toBe(beforeStat.mtimeMs);
    expect(readdirSync(harness.traceDirectory)).toEqual(names);
    expect(wait).toHaveBeenCalledTimes(original.length - 1);
    expect(harness.trace(id).every((row) => typeof row.at === "string")).toBe(
      true,
    );
  });

  // 게이트 A가 없는 후속 요청은 done의 예보 id로 계약 문맥을 구성한다
  it("발행된 예보의 후속 요청도 같은 봉투로 재생한다", async () => {
    const harness = replayFixture();
    const events = contractEvents("valid-followup-why");
    expect(
      events
        .filter((event) => event.event === "gate")
        .map((event) => (event.data as { gate: string }).gate),
    ).toEqual(["B", "publish"]);
    expect(events.at(-1)).toMatchObject({
      event: "done",
      data: { forecastId: expect.any(String) },
    });
    harness.save(traceText(events));
    const response = await harness.request();
    expect(response.status).toBe(200);
    expect(parseEvents(await response.text())).toEqual(events);
  });

  // 기본 라이브 폴더와 팀 설정의 명시적 폴더를 같은 선택 함수로 찾는다
  it("팀 설정과 공유 링크가 가리키는 같은 라이브 폴더를 읽는다", async () => {
    const harness = replayFixture();
    const expected = traceText(contractEvents());
    const id = "s-1790290800001-0f472899-abcd-4cde-8abc-abcdef123456";
    harness.save(expected, id);
    expect(teamTraceDirectory({ traceDirectory: harness.directory })).toBe(
      harness.directory,
    );
    expect(
      await readTrace(id, {
        traceDirectory: teamTraceDirectory({
          traceDirectory: harness.directory,
        }),
      }),
    ).toBe(expected);
  });
});
