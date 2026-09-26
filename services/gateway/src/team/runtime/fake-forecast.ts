// 계약 픽스처를 로컬 forecast 응답으로 재생하며 예측 수치는 계산하지 않는다

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Event, Forecast } from "@crowdcast/contracts/types";
import { asOfDate } from "../analysis/as-of.js";

// 원본 계약에서 복사한 픽스처는 요청마다 복제해 세션 사이 변형을 막는다
function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/services/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
}

// 공백·유니코드와 명시적인 인천 중구 접두어만 정리하고 다른 지역명은 보존한다
function venueName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/^인천(?:광역시)?중구/, "");
}

// 가짜 모드는 픽스처와 다른 장소를 영종으로 바꾸지 않고 서비스 오류로 거부한다
export const fakeForecastFetch: typeof fetch = async (input, init) => {
  init?.signal?.throwIfAborted();
  const url = new URL(String(input));
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const example = fixture("event") as Event;
  if (url.pathname === "/v1/geocode") {
    if (venueName(body.venueText) !== venueName(example.venue.name))
      return new Response(null, { status: 503 });
    return Response.json(fixture("geocode"));
  }
  if (url.pathname === "/v1/baseline") {
    if (url.searchParams.get("sigunguCode") !== example.sigunguCode)
      return new Response(null, { status: 503 });
    return Response.json(fixture("baseline"));
  }
  // 픽스처와 장소·시군구·유형이 다른 행사에는 예시 수치를 붙이지 않는다
  if (["/v1/similar", "/v1/predict"].includes(url.pathname)) {
    const event = body as Event;
    if (
      event.sigunguCode !== example.sigunguCode ||
      event.type !== example.type ||
      venueName(event.venue.name) !== venueName(example.venue.name)
    )
      return new Response(null, { status: 503 });
  }
  if (url.pathname === "/v1/similar")
    return Response.json([fixture("similar")]);
  if (url.pathname === "/v1/predict" || url.pathname === "/v1/whatif") {
    // 수치는 예시 그대로 두고 식별자와 D-14 메타데이터만 요청 행사에 연결한다
    const event = (
      url.pathname === "/v1/whatif" ? { ...body.event, ...body.changes } : body
    ) as Event;
    if (
      event.sigunguCode !== example.sigunguCode ||
      venueName(event.venue.name) !== venueName(example.venue.name)
    )
      return new Response(null, { status: 503 });
    const forecast = JSON.parse(
      JSON.stringify(fixture("forecast")).replaceAll(
        "f-yeongjong-2025",
        url.pathname === "/v1/whatif"
          ? `f-whatif-${randomUUID()}`
          : `f-${event.id.slice(2)}`,
      ),
    ) as Forecast;
    forecast.eventId = event.id;
    forecast.asOf = asOfDate(event.startsAt);
    forecast.predictionRun.asOf = forecast.asOf;
    return Response.json(forecast);
  }
  return new Response(null, { status: 404 });
};
