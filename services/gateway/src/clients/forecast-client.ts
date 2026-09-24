// 예측 서비스의 행사 예보·유사 행사·지역 평시·날씨를 계약 검증 후 반환한다
import type { Event } from "@crowdcast/contracts/types";
import { responseListSchema, responseSchema } from "../contract/responses.js";
import { requestJson, type ServiceClientOptions } from "./request-json.js";

// 응답 검증기는 클라이언트 생성이나 요청마다 다시 컴파일하지 않는다
const forecastSchema = responseSchema("forecast");
const similarSchema = responseListSchema("similar-event");
const baselineSchema = responseSchema("region-baseline");
const weatherSchema = responseSchema("weather");

// 예측 수치를 직접 만들지 않고 결정적 예측 서비스의 응답만 전달한다
export function createForecastClient(options: ServiceClientOptions) {
  return {
    // 행사 카드로 예보 전체를 요청한다
    predict(event: Event) {
      return requestJson(options, "/v1/predict", forecastSchema, event);
    },
    // 근거를 포함한 유사 행사 목록을 요청한다
    similar(event: Event) {
      return requestJson(options, "/v1/similar", similarSchema, event);
    },
    // 공개 시점 이전 지역 평시 값을 조회한다
    baseline(sigunguCode: string, before: string) {
      const query = new URLSearchParams({ sigunguCode, before });
      return requestJson(options, `/v1/baseline?${query}`, baselineSchema);
    },
    // 좌표와 시각을 쿼리로 인코딩해 날씨를 조회한다
    weather(lat: number, lng: number, at: string) {
      const query = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        at,
      });
      return requestJson(options, `/v1/weather?${query}`, weatherSchema);
    },
  };
}
