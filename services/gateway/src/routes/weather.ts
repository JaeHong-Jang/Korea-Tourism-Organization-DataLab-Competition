// 좌표와 기준 시각을 검증해 forecast 날씨 응답을 중계한다
import { createForecastClient } from "../clients/forecast-client.js";
import type { GatewayConfig } from "../config.js";
import { contractRegistry } from "../contract/registry.js";
import { responseSchema } from "../contract/responses.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyJson,
  proxyOptions,
  queryNumber,
} from "./proxy-response.js";

// gateway.yaml에서 요구하는 세 쿼리를 빠짐없이 검사한다
const querySchema = contractRegistry.compile<{
  lat: number;
  lng: number;
  at: string;
}>({
  type: "object",
  required: ["lat", "lng", "at"],
  properties: {
    lat: { type: "number" },
    lng: { type: "number" },
    at: { type: "string", format: "date-time" },
  },
});
const weatherSchema = responseSchema("weather");

// 상류가 없으면 맑음이나 영을 생성하지 않고 공통 장애 응답을 반환한다
export function createWeatherRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  const client = createForecastClient(
    proxyOptions(config, "forecast", fetcher),
  );
  route.get("/", async (c) => {
    const query = {
      lat: queryNumber(c.req.query("lat")),
      lng: queryNumber(c.req.query("lng")),
      at: c.req.query("at"),
    };
    if (!querySchema(query)) throw new ProxyInputError();
    return proxyJson(
      weatherSchema,
      await client.weather(query.lat, query.lng, query.at),
    );
  });
  return route;
}
