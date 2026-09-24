// 인사이트와 데이터랩 명세의 근거 수를 계약에 맞춰 중계한다
import { createForecastQueries } from "../clients/forecast-queries.js";
import { createKnowledgeQueries } from "../clients/knowledge-queries.js";
import { datalabSpecSchema, insightSchema } from "../clients/query-schemas.js";
import type { GatewayConfig } from "../config.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyJson,
  proxyOptions,
} from "./proxy-response.js";

// 명세의 데이터셋 순서를 유지하고 같은 datasetId의 근거 수만 붙인다
export function createInsightsRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  const forecast = createForecastQueries(
    proxyOptions(config, "forecast", fetcher),
  );
  const knowledge = createKnowledgeQueries(
    proxyOptions(config, "knowledge", fetcher),
  );
  route.get("/datalab-spec", async () => {
    const [spec, usage] = await Promise.all([
      forecast.datalabSpec(),
      knowledge.datalabUsage(),
    ]);
    const body = {
      ...spec,
      rows: spec.rows.map((row) => ({
        ...row,
        evidenceCount:
          usage.evidenceByDataset.find(
            (entry) => entry.datasetId === row.datasetId,
          )?.count ?? null,
      })),
    };
    return proxyJson(datalabSpecSchema, body);
  });

  // 상류가 허용하는 인사이트 키만 경로 조각으로 보낸다
  route.get("/:key", async (c) => {
    const key = c.req.param("key");
    if (!/^I[1-6]$/.test(key)) throw new ProxyInputError();
    return proxyJson(insightSchema, await forecast.insight(key));
  });
  return route;
}
