// 기록 서비스의 행사와 불변 예보 스냅샷을 응답 계약으로 검증한다
import type { Event, ForecastReport, Plan } from "@crowdcast/contracts/types";
import { contractRegistry } from "../contract/registry.js";
import { responseListSchema, responseSchema } from "../contract/responses.js";
import { querySchema } from "./query-schemas.js";
import { relayRecords } from "./records-relay-client.js";
import { requestJson, type ServiceClientOptions } from "./request-json.js";

// 발행 전 문장이 섞인 스냅샷은 예보서 계약이 거부한다
const eventSchema = responseSchema("event");
const eventsSchema = responseListSchema("event");
const snapshotSchema = responseSchema("forecast-report");
const snapshotsSchema = responseListSchema("forecast-report");
const planSchema = querySchema<Plan>("plan");
// records의 초안 검증 거부 본문만 검사해 로그에 실패 규칙을 남길 수 있게 한다
const planRejectionSchema = contractRegistry.compile({
  type: "object",
  required: ["error", "message"],
  properties: { error: { const: "invalid_plan" }, message: { type: "string" } },
});

// 행사와 스냅샷의 저장 경로를 서비스 내부에 한정한다
export function createRecordsClient(options: ServiceClientOptions) {
  return {
    // 초안 요청과 저장 결과를 같은 계약으로 검사한다
    savePlan(plan: Plan) {
      return requestJson(options, "/v1/plans", planSchema, {
        method: "POST",
        body: plan,
        bodySchema: planSchema,
        errorSchemas: { 422: planRejectionSchema },
      });
    },
    // 중복 저장 충돌 뒤에도 기존 초안을 계약 검증 후 재사용한다
    getPlan(id: string) {
      return requestJson(
        options,
        `/v1/plans/${encodeURIComponent(id)}`,
        planSchema,
        { method: "GET" },
      );
    },
    // 기존 중계의 본문 마감·크기 상한과 다운로드 헤더 보존을 그대로 쓴다
    exportPlan(id: string) {
      return relayRecords(options, {
        method: "GET",
        path: `/v1/plans/${encodeURIComponent(id)}/export.docx`,
        docx: true,
      });
    },
    // 예보 식별자로 불변 스냅샷 한 건을 조회한다
    getSnapshot(forecastId: string) {
      return requestJson(
        options,
        `/v1/snapshots/${encodeURIComponent(forecastId)}`,
        snapshotSchema,
        { method: "GET" },
      );
    },
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
