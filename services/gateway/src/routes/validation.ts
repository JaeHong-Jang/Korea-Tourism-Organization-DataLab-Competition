// 백테스트·사전 등록·모델 카드 조회를 검증 화면에 연결한다
import { createForecastQueries } from "../clients/forecast-queries.js";
import {
  backtestSchema,
  modelCardSchema,
  preregistrationSchema,
} from "../clients/query-schemas.js";
import type { GatewayConfig } from "../config.js";
import { createProxyRoute, proxyJson, proxyOptions } from "./proxy-response.js";

// 각 경로가 gateway.yaml에 지정된 서로 다른 응답 계약을 적용한다
export function createValidationRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  route.get("/backtest", async (c) => {
    const client = createForecastQueries(
      proxyOptions(config, "forecast", fetcher, c.req.raw.signal),
    );
    return proxyJson(backtestSchema, await client.backtest());
  });
  route.get("/preregistration", async (c) => {
    const client = createForecastQueries(
      proxyOptions(config, "forecast", fetcher, c.req.raw.signal),
    );
    return proxyJson(preregistrationSchema, await client.preregistration());
  });
  route.get("/model-card", async (c) => {
    const client = createForecastQueries(
      proxyOptions(config, "forecast", fetcher, c.req.raw.signal),
    );
    return proxyJson(modelCardSchema, await client.modelCard());
  });
  return route;
}
