// 저장 행사·스냅샷·재예보·실측·공유 응답을 계약에 맞춰 읽는다.
import type {
  Event,
  ForecastReport,
  ReforecastResult,
} from "@crowdcast/contracts/types";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const schemas = import.meta.glob(
  "../../../../packages/contracts/schemas/*.schema.json",
  { eager: true, import: "default" },
);
for (const schema of Object.values(schemas)) ajv.addSchema(schema as object);
const ref = (name: string) => ({
  $ref: `https://crowdcast.local/schemas/${name}.schema.json`,
});
const eventList = ajv.compile({ type: "array", items: ref("event") });
const reportList = ajv.compile({
  type: "array",
  items: ref("forecast-report"),
});
const report = ajv.compile(ref("forecast-report"));
const reforecast = ajv.compile(ref("reforecast-result"));
const actualRequest = ajv.compile({
  type: "object",
  additionalProperties: false,
  required: ["eventId", "actual"],
  properties: {
    eventId: { type: "string", pattern: "^e-" },
    actual: {
      $ref: "https://crowdcast.local/schemas/common.schema.json#/$defs/quantity",
    },
  },
});
const shareResponse = ajv.compile({
  type: "object",
  required: ["token"],
  properties: {
    token: { type: "string", pattern: "^sh-[A-Za-z0-9_-]{16,64}$" },
  },
});

// HTTP 상태를 보존해 재예보 실패 원인을 화면에서 구별한다.
export class MyEventsApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// 오류 본문의 게이트 이름을 보존해 발행 실패 이유를 화면에 전달한다.
async function request<T>(
  path: string,
  validator: typeof eventList,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let reason = "";
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object") {
        const value = body as Record<string, unknown>;
        reason = [value.code, value.message]
          .filter((part): part is string => typeof part === "string")
          .join(" · ");
      }
    } catch {
      /* 오류 본문이 비어 있어도 상태 코드는 유지한다. */
    }
    throw new MyEventsApiError(
      response.status,
      reason || `API 요청 실패: ${response.status}`,
    );
  }
  const data: unknown = await response.json();
  if (!validator(data))
    throw new Error(`API 계약 불일치: ${ajv.errorsText(validator.errors)}`);
  return data as T;
}

// 저장 행사 목록은 records 계약 배열로 검사한다.
export const getSavedEvents = (signal?: AbortSignal) =>
  request<Event[]>("/api/records/events", eventList, { signal });
// 불변 스냅샷 배열은 행사별 허용 경로에서 가져온다.
export const getEventSnapshots = (eventId: string, signal?: AbortSignal) =>
  request<ForecastReport[]>(
    `/api/records/events/${encodeURIComponent(eventId)}/snapshots`,
    reportList,
    { signal },
  );
// 공유 토큰의 발행 문서도 예보서 스키마를 통과시킨다.
export const getSharedReport = (token: string, signal?: AbortSignal) =>
  request<ForecastReport>(
    `/api/records/shares/${encodeURIComponent(token)}`,
    report,
    { signal },
  );

// 재예보의 비교 수치를 스키마로 검사하고 게이트 오류를 구별한다.
export const postReforecast = (eventId: string) =>
  request<ReforecastResult>(
    `/api/events/${encodeURIComponent(eventId)}/reforecast`,
    reforecast,
    { method: "POST" },
  );

// 실측은 공통 quantity 스키마를 통과한 요청만 저장한다.
export async function postActual(
  eventId: string,
  actual: Event["expectedByHost"],
): Promise<void> {
  const body = { eventId, actual };
  if (!actualRequest(body))
    throw new Error(
      `실측 입력 형식이 맞지 않아요: ${ajv.errorsText(actualRequest.errors)}`,
    );
  const response = await fetch("/api/records/actuals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new MyEventsApiError(
      response.status,
      `실측을 저장하지 못했어요 (${response.status}).`,
    );
}

// 공유 토큰은 응답 형식을 확인한 뒤 화면 주소로만 사용한다.
export const postShare = (forecastId: string) =>
  request<{ token: string }>("/api/records/shares", shareResponse, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ forecastId }),
  });
