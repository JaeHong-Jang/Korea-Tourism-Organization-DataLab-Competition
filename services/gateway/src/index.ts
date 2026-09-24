// 개발 실행기에서 사용할 게이트웨이 HTTP 서버를 시작한다
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { readStartupConfig } from "./startup-config.js";

// 로컬 앱의 유일한 API 창구를 설정된 포트에서 연다
const config = await readStartupConfig();
const server = serve({
  fetch: createApp(config).fetch,
  hostname: "127.0.0.1",
  port: config.port,
});

// 개발 실행기 종료나 재시작 시 리스너와 유휴 연결을 닫는다
function stopServer() {
  server.close();
  if ("closeAllConnections" in server) server.closeAllConnections();
}
process.once("SIGINT", stopServer);
process.once("SIGTERM", stopServer);
