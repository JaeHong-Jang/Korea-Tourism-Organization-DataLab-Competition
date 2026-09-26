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

// 재시작(tsx watch) 때 이전 프로세스가 아직 포트를 잡고 있으면 잠시 뒤 다시 연다(최대 20번, 0.3초 간격)
let retries = 0;
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== "EADDRINUSE" || retries >= 20) throw error;
  retries++;
  setTimeout(() => server.listen(config.port, "127.0.0.1"), 300);
});

// 개발 실행기 종료나 재시작 시 리스너와 연결을 닫고 프로세스를 끝내 포트를 바로 돌려준다
function stopServer() {
  server.close(() => process.exit(0));
  if ("closeAllConnections" in server) server.closeAllConnections();
  setTimeout(() => process.exit(0), 1000).unref();
}
process.once("SIGINT", stopServer);
process.once("SIGTERM", stopServer);
