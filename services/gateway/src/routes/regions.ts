// 시군구 경계와 출처·캐시 헤더를 웹에 중계한다
import { regionsSchema } from "../clients/query-schemas.js";
import { readRegions } from "../clients/regions-client.js";
import type { GatewayConfig } from "../config.js";
import { createProxyRoute, proxyJson, proxyOptions } from "./proxy-response.js";

// 헤더는 상류 JSON 계약 검증이 끝난 정상 응답에만 붙인다
export function createRegionsRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  route.get("/", async (c) => {
    const result = await readRegions(
      proxyOptions(config, "forecast", fetcher, c.req.raw.signal),
    );
    return proxyJson(regionsSchema, result.body, result.headers);
  });
  return route;
}
