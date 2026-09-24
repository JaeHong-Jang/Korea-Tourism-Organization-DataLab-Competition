// 조회 라우트의 오류·입력·최종 응답 검증과 상류 마감을 통일한다
import type { ValidateFunction } from "ajv";
import { Hono } from "hono";
import type { GatewayConfig } from "../config.js";

// 입력 오류를 상류 장애와 구분한다
export class ProxyInputError extends Error {}

// 서비스 본문이나 요청 값이 로그와 오류 응답에 노출되지 않게 한다
export function createProxyRoute() {
  const route = new Hono();
  route.onError((error, c) => {
    if (error instanceof ProxyInputError) {
      return c.json(
        {
          code: "INVALID_REQUEST",
          message: "요청 형식이 계약에 맞지 않습니다.",
        },
        400,
      );
    }
    console.error("게이트웨이 중계 실패", {
      route: c.req.routePath,
      reason: error.message.includes("계약 위반")
        ? "CONTRACT_VIOLATION"
        : error.name,
    });
    return c.json(
      {
        code: "UPSTREAM_UNAVAILABLE",
        message: "상류 서비스 응답을 사용할 수 없습니다.",
      },
      503,
    );
  });
  return route;
}

// 기존 런타임의 예산을 바꾸지 않고 조회 프록시에만 5초를 적용한다
export function proxyOptions(
  config: GatewayConfig,
  service: keyof GatewayConfig["services"],
  fetcher: typeof fetch,
) {
  return {
    baseUrl: config.services[service],
    fetch: fetcher,
    timeoutMs: 5_000,
  };
}

// 변환·조립된 최종 본문도 gateway 응답 계약을 통과해야 발행한다
export function proxyJson<T>(
  validate: ValidateFunction<T>,
  body: unknown,
  headers?: Headers,
) {
  if (!validate(body)) throw new Error("게이트웨이 응답 계약 위반");
  return Response.json(body, { headers });
}

// HTTP 문자열을 검증 가능한 숫자로 바꾸되 빈 문자열을 영으로 만들지 않는다
export function queryNumber(value: string | undefined) {
  if (value === undefined) return undefined;
  return value.trim() === "" ? Number.NaN : Number(value);
}
