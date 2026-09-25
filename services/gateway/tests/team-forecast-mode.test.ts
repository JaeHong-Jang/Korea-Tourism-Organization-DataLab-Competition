// 예시 수치가 기본 연결이나 다른 행사로 흘러가지 않는지 검증한다

import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "../src/config.js";
import { fakeForecastFetch } from "../src/team/runtime/fake-forecast.js";
import { teamSettings } from "../src/team/runtime/settings.js";
import { eventFixture } from "./contract-fixture.js";
import { isReplyCall, withoutReplyEvents } from "./reply-fixture.js";
import {
  extracted,
  fullText,
  teamFixture,
  validSequence,
} from "./team-fixture.js";

afterEach(() => vi.restoreAllMocks());

describe("예측 연결 모드", () => {
  // 별도 환경 변수 없이 시작하면 실제 서비스 실패를 오류 카드로 알린다
  it("기본 live 모드는 forecast 미구현 시 숫자 없이 끝난다", async () => {
    expect(teamSettings(readConfig({}), fetch, { env: {} }).mode).toBe("live");
    const harness = teamFixture({
      env: { FORECAST_MODE: undefined },
      override: async ({ url }) => {
        if (url.port === "8010") return new Response(null, { status: 404 });
      },
    });
    const events = await harness.message(await harness.prepare());
    validSequence(events);
    expect(
      harness.calls
        .filter((call) => !isReplyCall(call))
        .some((call) => call.url.port === "8010"),
    ).toBe(true);
    expect(withoutReplyEvents(events).at(-2)).toMatchObject({
      event: "error",
      data: { code: "SERVICE_UNAVAILABLE" },
    });
    expect(events.some((event) => event.event === "forecast")).toBe(false);
  });

  // 명시적 예시 모드 진입은 시작 로그 한 줄로 보인다
  it("fake 모드 시작 시 경고를 남긴다", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    teamSettings(readConfig({}), fetch, { env: { FORECAST_MODE: "fake" } });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0][0]).toContain("실제 예보가 아닙니다");
  });

  // 장소에 같은 부분 문자열이 있어도 다른 지역·유형은 숫자를 받지 못한다
  it.each([
    ["부산 씨사이드파크", "불꽃"],
    ["영종 씨사이드파크", "공연"],
    ["영종 씨사이드파크", "먹거리"],
  ])("fake에서 %s의 %s 행사는 숫자 없이 끝난다", async (venueText, type) => {
    const text = fullText
      .replaceAll("불꽃", type)
      .replace(extracted.venueText, venueText);
    const harness = teamFixture({
      env: { FORECAST_MODE: "fake" },
      recordings: {
        [text]: JSON.stringify({
          ...extracted,
          venueText,
          typeText: type,
          name: `영종 ${type}축제`,
        }),
      },
    });
    const id = await harness.create();
    validSequence(await harness.message(id, { text }));
    const events = await harness.message(id);
    validSequence(events);
    expect(withoutReplyEvents(events).at(-2)).toMatchObject({
      event: "error",
      data: { code: "SERVICE_UNAVAILABLE" },
    });
    expect(events.some((event) => event.event === "forecast")).toBe(false);
  });

  // 두 숫자 경로 모두 지역·유형·장소의 어느 하나라도 다르면 거부한다
  it.each(["/v1/predict", "/v1/similar"])(
    "%s는 픽스처 조건이 다른 행사를 거부한다",
    async (path) => {
      const event = eventFixture();
      for (const changed of [
        { ...event, sigunguCode: "26350" },
        { ...event, type: "먹거리" },
        { ...event, type: "공연" },
        { ...event, venue: { ...event.venue, name: "부산 씨사이드파크" } },
        { ...event, venue: { ...event.venue, name: "부산 영종 씨사이드파크" } },
        { ...event, venue: { ...event.venue, name: "씨사이드파크" } },
        { ...event, venue: { ...event.venue, name: "인천 자유공원" } },
      ]) {
        const response = await fakeForecastFetch(`http://localhost${path}`, {
          method: "POST",
          body: JSON.stringify(changed),
        });
        expect(response.status).toBe(503);
      }
    },
  );

  // 공백과 정확한 인천 중구 표기만 허용하며 잘못된 지명을 앞단부터 거부한다
  it.each([
    [" 영종  씨사이드파크 ", 200],
    ["인천 중구 영종 씨사이드파크", 200],
    ["인천광역시 중구 영종 씨사이드파크", 200],
    ["부산 씨사이드파크", 503],
    ["부산 영종 씨사이드파크", 503],
    ["영종 씨사이드파크 옆 공원", 503],
  ])("지오코딩 %s의 응답은 %s이다", async (venueText, status) => {
    const response = await fakeForecastFetch("http://localhost/v1/geocode", {
      method: "POST",
      body: JSON.stringify({ venueText }),
    });
    expect(response.status).toBe(status);
  });
});
