// 기록 서비스의 행사와 불변 예보 스냅샷을 응답 계약으로 검증한다
import type { Event, ForecastReport } from "@crowdcast/contracts/types";
import { responseListSchema, responseSchema } from "../contract/responses.js";
import { requestJson, type ServiceClientOptions } from "./request-json.js";

// 발행 전 문장이 섞인 스냅샷은 예보서 계약이 거부한다
const eventSchema = responseSchema("event");
const eventsSchema = responseListSchema("event");
const snapshotSchema = responseSchema("forecast-report");
const snapshotsSchema = responseListSchema("forecast-report");

// 행사와 스냅샷의 저장 경로를 서비스 내부에 한정한다
export function createRecordsClient(options: ServiceClientOptions) {
  return {
    // 저장한 행사 목록을 항목별로 검증한다
    listEvents() {
      return requestJson(options, "/v1/events", eventsSchema, {
        method: "GET",
      });
    },
    // 행사 식별자로 저장된 행사 정보를 조회한다
    getEvent(id: string) {
      return requestJson(
        options,
        `/v1/events/${encodeURIComponent(id)}`,
        eventSchema,
        { method: "GET" },
      );
    },
    // 저장 결과가 행사 계약을 만족하는지 확인한다
    saveEvent(event: Event) {
      return requestJson(options, "/v1/events", eventSchema, {
        method: "POST",
        body: event,
        bodySchema: eventSchema,
      });
    },
    // 행사에 남긴 발행 예보서 스냅샷 목록을 읽는다
    getSnapshots(eventId: string) {
      return requestJson(
        options,
        `/v1/events/${encodeURIComponent(eventId)}/snapshots`,
        snapshotsSchema,
        { method: "GET" },
      );
    },
    // 스냅샷을 추가하고 반환된 발행 예보서 전체를 검증한다
    saveSnapshot(eventId: string, report: ForecastReport) {
      return requestJson(
        options,
        `/v1/events/${encodeURIComponent(eventId)}/snapshots`,
        snapshotSchema,
        { method: "POST", body: report, bodySchema: snapshotSchema },
      );
    },
  };
}
