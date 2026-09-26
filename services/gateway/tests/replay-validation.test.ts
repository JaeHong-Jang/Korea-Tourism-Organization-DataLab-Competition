// 손상된 trace는 첫 SSE 프레임 전에 거부하고 첫 요청만 순번대로 재생하는지 검증한다
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  contractEvents,
  replayFixture,
  traceId,
  traceText,
} from "./replay-fixture.js";
import { parseEvents } from "./team-fixture.js";

describe("재생 입력과 파일 경계", () => {
  // 디코딩된 경로와 원래 경로 모두 식별자 규칙 밖이면 읽기 전에 거부한다
  it.each([
    "..",
    "%2e%2e",
    "%252e%252e",
    "../demo-yeongjong",
    "/etc/passwd",
    "%2Fetc%2Fpasswd",
    "demo-../outside",
    "demo-A",
    "demo-",
    `demo-${"a".repeat(41)}`,
    "s-12-abcd",
    "demo-yeongjong%00",
    "demo-yeongjong%0A",
    "",
  ])("경로 조작 %s는 400이다", async (id) => {
    const harness = replayFixture();
    const response = await harness.request(id);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_TRACE_ID" });
    expect(harness.wait).not.toHaveBeenCalled();
  });

  // 올바른 식별자의 누락은 형식 오류와 구별한다
  it.each([traceId, "demo-missing"])("없는 파일 %s는 404이다", async (id) => {
    const response = await replayFixture().request(id);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "TRACE_NOT_FOUND" });
  });

  // 폴더 자체가 공유 링크여도 그 안의 파일은 허용하고 밖을 향한 파일 링크는 거부한다
  it("실제 경로 해석 뒤 폴더 밖 링크를 차단한다", async () => {
    const harness = replayFixture();
    const other = replayFixture();
    const outside = other.save(traceText(contractEvents()));
    symlinkSync(outside, join(harness.directory, `${traceId}.jsonl`));
    const response = await harness.request();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_TRACE_ID" });
  });
});

describe("스트림 시작 전 trace 검증", () => {
  // JSON·봉투·시각·순번·완료가 하나라도 틀리면 SSE 헤더와 대기 모두 없어야 한다
  it.each([
    ["JSON 오류", () => `${traceText(contractEvents())}{잘못된 JSON}\n`],
    ["스키마 위반", () => traceText([{ event: "done", seq: 0, data: {} }])],
    [
      "seq 빈틈",
      () => traceText(contractEvents().filter((event) => event.seq !== 1)),
    ],
    [
      "seq 중복",
      () => traceText([...contractEvents().slice(0, 1), ...contractEvents()]),
    ],
    ["done 없음", () => traceText(contractEvents().slice(0, -1))],
    [
      "done 뒤 이벤트",
      () => {
        const events = contractEvents();
        return traceText([...events, { ...events[0], seq: events.length }]);
      },
    ],
    [
      "게이트 A 전 claim",
      () => {
        const events = contractEvents();
        const claim = events.find((event) => event.event === "claim");
        if (!claim) throw new Error("계약 claim이 필요합니다");
        return traceText(
          [claim, ...events.filter((event) => event !== claim)].map(
            (event, seq) => ({ ...event, seq }),
          ),
        );
      },
    ],
    ["빈 파일", () => ""],
    ["빈 중간 줄", () => traceText(contractEvents()).replace("\n", "\n\n")],
    ["requestId 없음", () => '{"event":"done","seq":0,"data":{}}\n'],
    ["잘못된 시각", () => traceText(contractEvents(), "영종", ["2026-09-25"])],
    [
      "존재하지 않는 날짜",
      () => traceText(contractEvents(), "영종", ["2026-02-30T00:00:00.000Z"]),
    ],
    [
      "기존 예보 id 없이 게이트 B로 시작한 요청",
      () =>
        traceText(
          contractEvents("valid-followup-why").map((event) =>
            event.event === "done"
              ? { ...event, data: { sessionId: traceId, forecastId: null } }
              : event,
          ),
        ),
    ],
  ])("%s는 422이며 스트림을 열지 않는다", async (_name, makeText) => {
    const harness = replayFixture();
    harness.save(makeText());
    const response = await harness.request();
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-accel-buffering")).toBeNull();
    expect(await response.json()).toMatchObject({
      code: "TRACE_INVALID",
      message: expect.stringMatching(/^[^\r\n]+$/),
    });
    expect(harness.wait).not.toHaveBeenCalled();
  });

  // 정본 순서 위반 픽스처를 모두 통과시키지 않는지 R1~R11 검사 연결을 확인한다
  it.each([
    "invalid-gate-a-twice",
    "invalid-gate-after-publish",
    "invalid-missing-evidence",
    "invalid-publish-revision-drift",
    "invalid-gate-revision-decreases",
    "invalid-followup-resend-card",
  ])("계약 위반 %s를 거부한다", async (name) => {
    const harness = replayFixture();
    harness.save(traceText(contractEvents(name)));
    expect((await harness.request()).status).toBe(422);
  });

  // 파일의 첫 requestId를 고르되 실제 전송·간격 순서는 seq를 따른다
  it("여러 요청이 섞여도 첫 요청만 정렬해 done까지 보낸다", async () => {
    const wait = vi.fn(async () => {});
    const harness = replayFixture(wait);
    const first = contractEvents();
    const firstRows = traceText(first).trim().split("\n").reverse();
    const secondRows = traceText(contractEvents(), "두번째-요청")
      .trim()
      .split("\n");
    harness.save(
      `${[firstRows[0], ...secondRows, ...firstRows.slice(1)].join("\n")}\n`,
    );
    const response = await harness.request();
    expect(response.status).toBe(200);
    expect(parseEvents(await response.text())).toEqual(first);
    expect(wait.mock.calls).toHaveLength(first.length - 1);
    expect(
      wait.mock.calls.every((call) => (call as unknown[])[0] === 120),
    ).toBe(true);
  });
});
