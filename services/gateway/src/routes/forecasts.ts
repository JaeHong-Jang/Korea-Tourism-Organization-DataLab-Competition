// 발행 예보서를 records의 불변 스냅샷에서 조회한다
import { createRecordsClient } from "../clients/records-client.js";
import type { GatewayConfig } from "../config.js";
import { responseSchema } from "../contract/responses.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyJson,
  proxyOptions,
} from "./proxy-response.js";

const reportSchema = responseSchema("forecast-report");

// 아직 없는 스냅샷 API와 발행 전 예보는 프록시 장애 규칙에 따라 503을 반환한다
export function createForecastsRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  const client = createRecordsClient(proxyOptions(config, "records", fetcher));
  route.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!id.startsWith("f-")) throw new ProxyInputError();
    return proxyJson(reportSchema, await client.getSnapshot(id));
  });
  return route;
}
