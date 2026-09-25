// 앱 셸 스크린샷 검사를 로컬 Vite 서버와 함께 실행한다.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.WEB_PORT ?? 5184);
// 테스트는 가짜 API만 쓴다 — 실제 서비스가 떠 있어도 프록시가 닫힌 포트로 가게 한다(스펙이 직접 띄우는 Vite도 물려받는다)
process.env.CROWDCAST_GATEWAY_URL ??= "http://127.0.0.1:9";

export default defineConfig({
  testDir: "../../tests/e2e",
  use: { baseURL: `http://127.0.0.1:${port}`, ...devices["Desktop Chrome"] },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
