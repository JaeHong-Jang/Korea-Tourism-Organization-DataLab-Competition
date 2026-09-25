// 잘못된 입력·동시 요청·지역 모호성이 세션과 그래프를 오염시키지 않는지 확인한다

import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { isReplyCall, withoutReplyEvents } from "./reply-fixture.js";
import { fullText, teamFixture, validSequence } from "./team-fixture.js";

describe("상담 요청 경계", () => {
  // JSON 파싱·메시지·초안 답변 오류는 작업 시작 전에 돌려준다
  it.each([
    "{",
    "{}",
    JSON.stringify({ text: 3 }),
    JSON.stringify({ text: fullText, answer: { startsAt: "내일" } }),
    JSON.stringify({ text: fullText, answer: { missing: [] } }),
  ])("잘못된 본문 %s는 400이다", async (body) => {
    const harness = teamFixture();
    const id = await harness.create();
    const response = await harness.app.request(
      `/api/team/sessions/${id}/messages`,
      { method: "POST", headers: { "content-type": "application/json" }, body },
    );
    expect(response.status).toBe(400);
    expect(harness.calls.filter((call) => !isReplyCall(call))).toEqual([]);
  });

  // 외부가 만든 식별자를 파일 경로로 사용하지 않는다
  it("없는 세션의 메시지와 기록은 404이다", async () => {
    const harness = teamFixture();
    expect(
      (
        await harness.app.request("/api/team/sessions/s-unknown/messages", {
          method: "POST",
          body: JSON.stringify({ text: fullText }),
        })
      ).status,
    ).toBe(404);
    expect(
      (await harness.app.request("/api/team/sessions/s-unknown/steps")).status,
    ).toBe(404);
    expect(harness.calls.filter((call) => !isReplyCall(call))).toEqual([]);
  });

  // 첫 스트림이 끝나기 전에는 동일 세션 작업을 추가하지 않는다
  it("동일 세션의 동시 메시지를 409로 차단한다", async () => {
    let entered: () => void = () => {};
    let release: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const harness = teamFixture({
      override: async ({ url }) => {
        if (url.pathname === "/v1/geocode") {
          entered();
          await blocked;
        }
        return undefined;
      },
    });
    const id = await harness.prepare();
    const first = harness.message(id);
    await started;
    const second = await harness.app.request(
      `/api/team/sessions/${id}/messages`,
      { method: "POST", body: JSON.stringify({ text: fullText }) },
    );
    expect(second.status).toBe(409);
    release();
    validSequence(await first);
  });

  // 브라우저가 스트림을 닫으면 미완료 호출을 끊고 뒤늦은 facts 쓰기를 막는다
  it("SSE 연결 종료가 진행 중인 서비스 호출을 취소한다", async () => {
    let entered: () => void = () => {};
    let release: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const stalled = new Promise<void>((resolve) => {
      release = resolve;
    });
    const harness = teamFixture({
      override: async ({ url }) => {
        if (url.pathname === "/v1/geocode") {
          entered();
          await stalled;
        }
        return undefined;
      },
    });
    const id = await harness.prepare();
    const response = await harness.app.request(
      `/api/team/sessions/${id}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          text: "위험요소 확인",
          answer: { hazards: ["폭죽"] },
        }),
      },
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("SSE 본문이 없습니다");
    const reading = (async () => {
      while (!(await reader.read()).done) {
        /* 연결 종료까지 프레임을 소비한다 */
      }
    })();
    await started;
    await reader.cancel();
    await reading;
    await delay(25);
    expect(
      harness.calls
        .filter((call) => !isReplyCall(call))
        .find((call) => call.url.pathname === "/v1/geocode")?.signal?.aborted,
    ).toBe(true);
    release();
    await delay(25);
    expect(
      harness.calls
        .filter((call) => !isReplyCall(call))
        .some((call) => call.url.pathname.endsWith("/facts")),
    ).toBe(false);
  });

  // 모호한 후보의 최고 점수를 임의 선택하지 않고 명시적 지역 답을 기다린다
  it("지오코딩 후보를 되묻고 선택한 지역으로 분석을 재개한다", async () => {
    const harness = teamFixture({
      override: async ({ url }) => {
        if (url.pathname === "/v1/geocode")
          return Response.json({
            candidates: [
              {
                sigunguCode: "28110",
                sigunguName: "인천 중구",
                lat: 37.49,
                lng: 126.58,
                score: 0.9,
              },
              {
                sigunguCode: "11140",
                sigunguName: "서울 중구",
                lat: 37.56,
                lng: 126.98,
                score: 0.8,
              },
            ],
          });
      },
    });
    const id = await harness.prepare();
    const initial = await harness.message(id);
    validSequence(initial);
    expect(initial.find((event) => event.event === "ask")?.data).toMatchObject({
      field: "sigunguCode",
      options: [{ value: "28110" }, { value: "11140" }],
    });
    expect(
      harness.calls
        .filter((call) => !isReplyCall(call))
        .some((call) => call.url.pathname.endsWith("/facts")),
    ).toBe(false);
    const resumed = await harness.message(id, {
      text: "인천 중구",
      answer: { sigunguCode: "28110" },
    });
    validSequence(resumed);
    expect(resumed.some((event) => event.event === "forecast")).toBe(true);
  });

  // 빈 후보를 좌표나 지역 추정으로 메우지 않는다
  it("장소 후보가 없으면 ask 뒤 done으로 끝난다", async () => {
    const harness = teamFixture({
      override: async ({ url }) =>
        url.pathname === "/v1/geocode"
          ? Response.json({ candidates: [] })
          : undefined,
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(withoutReplyEvents(events).at(-2)).toMatchObject({
      event: "ask",
      data: { field: "venueText", options: [] },
    });
    expect(
      harness.calls
        .filter((call) => !isReplyCall(call))
        .some((call) => call.url.pathname.endsWith("/facts")),
    ).toBe(false);
  });
});
