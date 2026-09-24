// 실행 목록과 최신성·모델·그래프·평가 결과를 운영 계약으로 조립한다
import { readLatestEval } from "../clients/eval-reader.js";
import { createForecastQueries } from "../clients/forecast-queries.js";
import { createKnowledgeQueries } from "../clients/knowledge-queries.js";
import { opsStatusSchema, runsSchema } from "../clients/query-schemas.js";
import type { GatewayConfig } from "../config.js";
import { createProxyRoute, proxyJson, proxyOptions } from "./proxy-response.js";

// 필수 상류 실패는 503으로 두고 계약이 허용하는 부분 결측만 유지한다
export function createOpsRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
  readEvals = readLatestEval,
) {
  const route = createProxyRoute();
  const forecast = createForecastQueries(
    proxyOptions(config, "forecast", fetcher),
  );
  const knowledge = createKnowledgeQueries(
    proxyOptions(config, "knowledge", fetcher),
  );
  route.get("/runs", async () => proxyJson(runsSchema, await forecast.runs()));
  route.get("/status", async () => {
    const [freshness, card, graph, evals] = await Promise.all([
      forecast.freshness(),
      forecast.modelCard(),
      knowledge.graphStats(),
      readEvals(),
    ]);
    return proxyJson(opsStatusSchema, {
      generatedAt: new Date().toISOString(),
      freshness,
      model: {
        modelRunId: card.id,
        modelVersion: card.modelVersion,
        trainRange: card.trainRange,
        createdAt: card.createdAt,
      },
      graph,
      evals,
    });
  });
  return route;
}
