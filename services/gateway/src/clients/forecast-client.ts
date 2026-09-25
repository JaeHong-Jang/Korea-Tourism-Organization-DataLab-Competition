// 예측 서비스의 행사 예보·유사 행사·지역 평시·날씨를 계약 검증 후 반환한다
import type { Event } from "@crowdcast/contracts/types";
import { contractRegistry } from "../contract/registry.js";
import { responseListSchema, responseSchema } from "../contract/responses.js";
import { geocodeResponseSchema } from "./geocode-schema.js";
import { requestJson, type ServiceClientOptions } from "./request-json.js";
import { geocodeRequestSchema } from "./request-schemas.js";

// 응답 검증기는 클라이언트 생성이나 요청마다 다시 컴파일하지 않는다
const forecastSchema = responseSchema("forecast");
const similarSchema = responseListSchema("similar-event");
const baselineSchema = responseSchema("region-baseline");
const weatherSchema = responseSchema("weather");
const eventSchema = responseSchema("event");
// 503 본문(관측 없음 {code,message}·일시 장애 {detail})을 받아 호출자가 이유를 구분하게 한다
const serviceErrorSchema = contractRegistry.compile({ type: "object" });

// 예측 수치를 직접 만들지 않고 결정적 예측 서비스의 응답만 전달한다
export function createForecastClient(options: ServiceClientOptions) {
  return {
    // 일괄 예보가 보존한 입력을 받아 행사 추출과 장소 재질문을 생략한다
    upcomingEvent(eventId: string) {
      return requestJson(
        options,
        `/v1/festivals/upcoming/${encodeURIComponent(eventId)}/event`,
        eventSchema,
        { method: "GET" },
      );
    },
    // 좌표를 추측하지 않고 장소 후보를 서비스에 요청한다
    geocode(venueText: string, sidoHint?: string | null) {
      return requestJson(options, "/v1/geocode", geocodeResponseSchema, {
        method: "POST",
        body: { venueText, ...(sidoHint === undefined ? {} : { sidoHint }) },
        bodySchema: geocodeRequestSchema,
      });
    },
    // 행사 카드로 예보 전체를 요청한다
    predict(event: Event) {
      return requestJson(options, "/v1/predict", forecastSchema, {
        method: "POST",
        body: event,
        bodySchema: eventSchema,
        errorSchemas: { 503: serviceErrorSchema },
        optionalErrorBody: true,
      });
    },
    // 근거를 포함한 유사 행사 목록을 요청한다
    similar(event: Event) {
      return requestJson(options, "/v1/similar", similarSchema, {
        method: "POST",
        body: event,
        bodySchema: eventSchema,
      });
    },
    // 공개 시점 이전 지역 평시 값을 조회한다
    baseline(sigunguCode: string, before: string) {
      const query = new URLSearchParams({ sigunguCode, before });
      return requestJson(options, `/v1/baseline?${query}`, baselineSchema, {
        method: "GET",
      });
    },
    // 좌표와 시각을 쿼리로 인코딩해 날씨를 조회한다
    weather(lat: number, lng: number, at: string) {
      const query = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        at,
      });
      return requestJson(options, `/v1/weather?${query}`, weatherSchema, {
        method: "GET",
      });
    },
  };
}
