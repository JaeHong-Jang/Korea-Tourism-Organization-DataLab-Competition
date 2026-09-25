// 계획 초안 조회와 docx 다운로드를 records의 계약 검증 중계로 연결한다
import { createRecordsClient } from "../clients/records-client.js";
import type { GatewayConfig } from "../config.js";
import {
  createProxyRoute,
  ProxyInputError,
  proxyOptions,
} from "./proxy-response.js";

// 경로 조각은 계약의 계획 id 형식만 허용하고 쿼리는 상류에 전달하지 않는다
function planId(id: string) {
  if (!/^plan-[a-z0-9][a-z0-9_.:-]{1,120}$/.test(id))
    throw new ProxyInputError();
  return id;
}

// JSON은 클라이언트에서 plan으로 검증하고 docx는 바이트와 두 헤더를 보존한다
export function createPlansRoute(config: GatewayConfig, fetcher: typeof fetch) {
  const route = createProxyRoute();
  route.get("/:id", async (c) => {
    const id = planId(c.req.param("id"));
    const records = createRecordsClient(
      proxyOptions(config, "records", fetcher, c.req.raw.signal),
    );
    const plan = await records.getPlan(id);
    if (plan.id !== id) throw new Error("계획 조회 응답 계약 위반: id");
    return c.json(plan);
  });
  route.get("/:id/export.docx", async (c) => {
    const id = planId(c.req.param("id"));
    const records = createRecordsClient(
      proxyOptions(config, "records", fetcher, c.req.raw.signal),
    );
    return records.exportPlan(id);
  });
  return route;
}
