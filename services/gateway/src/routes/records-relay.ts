// gateway 허용 목록에 있는 records 경로만 본문·응답 검증 후 중계한다
import type { Plan } from "@crowdcast/contracts/types";
import type { ValidateFunction } from "ajv";
import { queryListSchema, querySchema } from "../clients/query-schemas.js";
import { relayRecords } from "../clients/records-relay-client.js";
import { ServiceHttpError } from "../clients/request-json.js";
import type { GatewayConfig } from "../config.js";
import { contractRegistry } from "../contract/registry.js";
import { responseListSchema, responseSchema } from "../contract/responses.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyOptions,
} from "./proxy-response.js";

// records.yaml의 단일·목록 스키마를 원본 참조로 검증한다
const eventSchema = responseSchema("event");
const planSchema = querySchema<Plan>("plan");
const verifySchema = contractRegistry.compile({
  type: "object",
  required: ["valid", "count", "brokenAt"],
  properties: {
    valid: { type: "boolean" },
    count: { type: "integer" },
    brokenAt: { type: ["integer", "null"] },
  },
});
const actualRequestSchema = contractRegistry.compile({
  type: "object",
  required: ["eventId", "actual"],
  properties: {
    eventId: { type: "string" },
    actual: {
      $ref: "https://crowdcast.local/schemas/common.schema.json#/$defs/quantity",
    },
  },
});
const shareRequestSchema = contractRegistry.compile({
  type: "object",
  required: ["forecastId"],
  properties: { forecastId: { type: "string" } },
});
const shareResponseSchema = contractRegistry.compile({
  type: "object",
  required: ["token"],
  properties: { token: { type: "string" } },
});

// 메서드별 목록은 gateway.yaml 설명과 일치하며 records 전체 API를 노출하지 않는다
const allowedPaths: {
  method: "GET" | "POST" | "PUT";
  path: RegExp;
  bodySchema?: ValidateFunction;
  responseSchema?: ValidateFunction;
  docx?: boolean;
}[] = [
  {
    method: "GET",
    path: /^events$/,
    responseSchema: responseListSchema("event"),
  },
  {
    method: "GET",
    path: /^events\/e-[^/]*\/snapshots$/,
    responseSchema: responseListSchema("forecast-report"),
  },
  { method: "GET", path: /^plans\/plan-[^/]*$/, responseSchema: planSchema },
  { method: "GET", path: /^plans\/plan-[^/]*\/export\.docx$/, docx: true },
  {
    method: "GET",
    path: /^ledger$/,
    responseSchema: queryListSchema("ledger-entry"),
  },
  { method: "GET", path: /^ledger\/verify$/, responseSchema: verifySchema },
  {
    method: "GET",
    path: /^snapshots\/f-[^/]*$/,
    responseSchema: responseSchema("forecast-report"),
  },
  {
    method: "POST",
    path: /^events$/,
    bodySchema: eventSchema,
    responseSchema: eventSchema,
  },
  {
    method: "POST",
    path: /^plans$/,
    bodySchema: planSchema,
    responseSchema: planSchema,
  },
  {
    method: "POST",
    path: /^actuals$/,
    bodySchema: actualRequestSchema,
    responseSchema: contractRegistry.compile({ type: "object" }),
  },
  {
    method: "POST",
    path: /^shares$/,
    bodySchema: shareRequestSchema,
    responseSchema: shareResponseSchema,
  },
  {
    method: "PUT",
    path: /^plans\/plan-[^/]*$/,
    bodySchema: planSchema,
    responseSchema: planSchema,
  },
];

// 인코딩된 경로 구분자와 이중 인코딩을 거부해 허용 목록 우회를 막는다
function recordsPath(path: string) {
  try {
    const parts = path
      .slice("/api/records/".length)
      .split("/")
      .map(decodeURIComponent);
    if (
      parts.some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[/\\%]/.test(part) ||
          Array.from(part).some(
            (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
          ),
      )
    )
      return null;
    return parts.join("/");
  } catch {
    return null;
  }
}

// 미등록 경로는 네트워크 전에 막고 변경 본문은 계약을 통과해야 전송한다
export function createRecordsRelayRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  route.all("/*", async (c) => {
    const path = recordsPath(c.req.path);
    const contract = allowedPaths.find(
      (entry) =>
        entry.method === c.req.method && path !== null && entry.path.test(path),
    );
    if (!contract || path === null)
      return c.json(
        { code: "NOT_FOUND", message: "허용된 records 경로가 아닙니다." },
        404,
      );

    // JSON 구문 오류와 스키마 위반은 같은 요청 오류로 반환한다
    let body: unknown;
    if (contract.bodySchema) {
      try {
        body = await c.req.json();
      } catch {
        throw new ProxyInputError();
      }
      if (!contract.bodySchema(body)) throw new ProxyInputError();
    }

    // 계약에 없는 쿼리를 보내지 않고 경로 조각은 다시 안전하게 인코딩한다
    try {
      return await relayRecords(proxyOptions(config, "records", fetcher), {
        ...contract,
        path: `/v1/${path.split("/").map(encodeURIComponent).join("/")}`,
        body,
      });
    } catch (error) {
      if (
        contract.method === "PUT" &&
        error instanceof ServiceHttpError &&
        error.status === 409
      ) {
        return c.json(
          { code: "CONFLICT", message: "다른 수정이 먼저 저장되었습니다." },
          409,
        );
      }
      throw error;
    }
  });
  return route;
}
