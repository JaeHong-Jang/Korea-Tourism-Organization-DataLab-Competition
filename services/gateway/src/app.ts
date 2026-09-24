// 네트워크 리스너 없이도 요청을 검증할 수 있는 Hono 앱을 조립한다
import { Hono } from "hono";
import { type GatewayConfig, readConfig } from "./config.js";
import { createHealthRoute } from "./routes/health.js";
import { createTeamSessionsRoute } from "./routes/team-sessions.js";

// 실행 환경과 fetch를 주입해 가짜 서비스로 상태 확인을 테스트한다
export function createApp(
  config: GatewayConfig = readConfig(),
  fetcher: typeof fetch = fetch,
) {
  const app = new Hono();
  app.route("/api/health", createHealthRoute(config, fetcher));
  app.route("/api/team/sessions", createTeamSessionsRoute(config, fetcher));
  return app;
}
