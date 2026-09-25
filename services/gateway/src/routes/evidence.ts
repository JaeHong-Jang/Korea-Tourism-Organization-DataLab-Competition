// 근거 통계와 근거 한 건을 knowledge의 조회 계약으로 중계한다
import { createKnowledgeClient } from "../clients/knowledge-client.js";
import { createKnowledgeQueries } from "../clients/knowledge-queries.js";
import {
  datalabUsageSchema,
  knowledgeGraphSchema,
} from "../clients/query-schemas.js";
import type { GatewayConfig } from "../config.js";
import { responseSchema } from "../contract/responses.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyJson,
  proxyOptions,
} from "./proxy-response.js";

const evidenceSchema = responseSchema("evidence");

// 고정 통계 경로가 근거 id로 해석되지 않도록 먼저 등록한다
export function createEvidenceRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = createProxyRoute();
  route.get("/stats", async (c) => {
    const queries = createKnowledgeQueries(
      proxyOptions(config, "knowledge", fetcher, c.req.raw.signal),
    );
    return proxyJson(datalabUsageSchema, await queries.datalabUsage());
  });
  // 고정 그래프 경로를 근거 식별자보다 먼저 연결한다
  route.get("/graph", async (c) => {
    const queries = createKnowledgeQueries(
      proxyOptions(config, "knowledge", fetcher, c.req.raw.signal),
    );
    return proxyJson(knowledgeGraphSchema, await queries.graph());
  });
  route.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!id.startsWith("ev-")) throw new ProxyInputError();
    const client = createKnowledgeClient(
      proxyOptions(config, "knowledge", fetcher, c.req.raw.signal),
    );
    return proxyJson(evidenceSchema, await client.getEvidence(id));
  });
  return route;
}
