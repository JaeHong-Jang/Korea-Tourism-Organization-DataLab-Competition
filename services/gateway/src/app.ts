// 네트워크 리스너 없이도 요청을 검증할 수 있는 Hono 앱을 조립한다
import { Hono } from "hono";
import { type GatewayConfig, readConfig } from "./config.js";
import { createEventsRoute } from "./routes/events.js";
import { createEvidenceRoute } from "./routes/evidence.js";
import { createFestivalsRoute } from "./routes/festivals.js";
import { createForecastsRoute } from "./routes/forecasts.js";
import { createHealthRoute } from "./routes/health.js";
import { createImagesRoute } from "./routes/images.js";
import { createInsightsRoute } from "./routes/insights.js";
import { createOpsRoute } from "./routes/ops.js";
import { createPlansRoute } from "./routes/plans.js";
import { createRecordsRelayRoute } from "./routes/records-relay.js";
import { createRegionsRoute } from "./routes/regions.js";
import { createTeamReplayRoute } from "./routes/team-replay.js";
import { createTeamSessionsRoute } from "./routes/team-sessions.js";
import { createValidationRoute } from "./routes/validation.js";
import { createWeatherRoute } from "./routes/weather.js";

// 실행 환경과 fetch를 주입해 가짜 서비스로 상태 확인을 테스트한다
export function createApp(
  config: GatewayConfig = readConfig(),
  fetcher: typeof fetch = fetch,
) {
  const app = new Hono();
  app.route("/api/health", createHealthRoute(config, fetcher));
  app.route("/api/team/sessions", createTeamSessionsRoute(config, fetcher));
  app.route("/api/team/replay", createTeamReplayRoute());
  app.route("/api/images", createImagesRoute(config, fetcher));
  app.route("/api/festivals", createFestivalsRoute(config, fetcher));
  app.route("/api/regions.topojson", createRegionsRoute(config, fetcher));
  app.route("/api/forecasts", createForecastsRoute(config, fetcher));
  app.route("/api/events", createEventsRoute(config, fetcher));
  app.route("/api/plans", createPlansRoute(config, fetcher));
  app.route("/api/evidence", createEvidenceRoute(config, fetcher));
  app.route("/api/weather", createWeatherRoute(config, fetcher));
  app.route("/api/validation", createValidationRoute(config, fetcher));
  app.route("/api/insights", createInsightsRoute(config, fetcher));
  app.route("/api/ops", createOpsRoute(config, fetcher));
  app.route("/api/records", createRecordsRelayRoute(config, fetcher));
  return app;
}
