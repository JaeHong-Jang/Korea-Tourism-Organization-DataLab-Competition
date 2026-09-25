// 시군구 코드와 행사 기간을 검증해 forecast 관광지 집중률 요약을 중계한다
import { createForecastClient } from "../clients/forecast-client.js";
import type { GatewayConfig } from "../config.js";
import { contractRegistry } from "../contract/registry.js";
import { responseSchema } from "../contract/responses.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyJson,
  proxyOptions,
} from "./proxy-response.js";

// gateway.yaml의 세 쿼리(시군구 다섯 자리·시작일·종료일)를 빠짐없이 검사한다
const querySchema = contractRegistry.compile<{
  sigunguCode: string;
  from: string;
  to: string;
}>({
  type: "object",
  required: ["sigunguCode", "from", "to"],
  properties: {
    sigunguCode: { type: "string", pattern: "^[0-9]{5}$" },
    from: { type: "string", format: "date" },
    to: { type: "string", format: "date" },
  },
});
const concentrationSchema = responseSchema("concentration");

// 상류 수집이 실패하면 값을 지어내지 않고 공통 장애 응답을 반환한다
export function createConcentrationRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  route.get("/", async (c) => {
    const query = {
      sigunguCode: c.req.query("sigunguCode"),
      from: c.req.query("from"),
      to: c.req.query("to"),
    };
    if (!querySchema(query) || query.to < query.from)
      throw new ProxyInputError();
    const client = createForecastClient(
      proxyOptions(config, "forecast", fetcher, c.req.raw.signal),
    );
    return proxyJson(
      concentrationSchema,
      await client.concentration(query.sigunguCode, query.from, query.to),
    );
  });
  return route;
}
