// 하위 서비스 장애와 무관하게 상태 확인 결과를 HTTP 200으로 제공한다
import { Hono } from "hono";
import { checkHealth } from "../clients/health-client.js";
import type { GatewayConfig } from "../config.js";

// 상태 확인 로직은 클라이언트에 두고 라우트는 입출력만 담당한다
export function createHealthRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const route = new Hono();
  route.get("/", async (context) =>
    context.json(await checkHealth(config, fetcher), 200),
  );
  return route;
}
