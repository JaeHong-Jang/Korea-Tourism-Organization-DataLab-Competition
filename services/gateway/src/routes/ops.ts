// 실행 목록과 최신성·모델·그래프·평가 결과를 운영 계약으로 조립한다
import { readLatestEval } from "../clients/eval-reader.js";
import { createForecastQueries } from "../clients/forecast-queries.js";
import { createKnowledgeQueries } from "../clients/knowledge-queries.js";
import { readPromotedVerdict } from "../clients/promoted-reader.js";
import { opsStatusSchema, runsSchema } from "../clients/query-schemas.js";
import type { GatewayConfig } from "../config.js";
import { createProxyRoute, proxyJson, proxyOptions } from "./proxy-response.js";

// 운영 상태는 사용자 대기 화면이 아니라 최신성 첫 계산을 기다릴 수 있다
const OPS_STATUS_TIMEOUT_MS = 15_000;

// 필수 상류 실패는 503으로 두고 계약이 허용하는 부분 결측만 유지한다
export function createOpsRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
  readEvals = readLatestEval,
  readVerdict = readPromotedVerdict,
) {
  const route = createProxyRoute();
  route.get("/runs", async (c) => {
    const forecast = createForecastQueries(
      proxyOptions(config, "forecast", fetcher, c.req.raw.signal),
    );
    return proxyJson(runsSchema, await forecast.runs());
  });
  route.get("/status", async (c) => {
    // 자료 최신성은 첫 계산이 5초를 넘을 수 있어(캐시 전 약 5.3초) 운영 상태만 넉넉히 기다린다
    const forecast = createForecastQueries(
      proxyOptions(
        config,
        "forecast",
        fetcher,
        c.req.raw.signal,
        OPS_STATUS_TIMEOUT_MS,
      ),
    );
    const knowledge = createKnowledgeQueries(
      proxyOptions(config, "knowledge", fetcher, c.req.raw.signal),
    );
    const [freshness, card, graph, evals, verdict] = await Promise.all([
      forecast.freshness(),
      forecast.modelCard(),
      knowledge.graphStats(),
      readEvals(),
      readVerdict(),
    ]);
    return proxyJson(opsStatusSchema, {
      generatedAt: new Date().toISOString(),
      freshness,
      model: {
        modelRunId: card.id,
        modelVersion: card.modelVersion,
        trainRange: card.trainRange,
        createdAt: card.createdAt,
        ...(verdict ? { verdict } : {}),
      },
      graph,
      evals,
    });
  });
  return route;
}
