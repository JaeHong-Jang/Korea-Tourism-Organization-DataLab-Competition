// 상담 세션을 만들고 같은 저장소를 메시지·작업 기록 라우트에 연결한다
import { Hono } from "hono";
import type { GatewayConfig } from "../config.js";
import { createSessionStore } from "../team/runtime/sessions.js";
import { type TeamOptions, teamSettings } from "../team/runtime/settings.js";
import { createTeamMessagesRoute } from "./team-messages.js";
import { createTeamStepsRoute } from "./team-steps.js";

// 앱 인스턴스마다 세션 저장소와 실행 설정을 한 번만 만든다
export function createTeamSessionsRoute(
  config: GatewayConfig,
  fetcher: typeof fetch,
  options?: TeamOptions,
) {
  const store = createSessionStore();
  const settings = teamSettings(config, fetcher, options);
  const route = new Hono();
  route.post("/", (c) => c.json({ sessionId: store.create().id }));
  route.route("/", createTeamMessagesRoute(store, settings));
  route.route("/", createTeamStepsRoute(store));
  return route;
}
