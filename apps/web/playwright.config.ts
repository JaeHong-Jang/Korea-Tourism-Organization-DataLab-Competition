// 앱 셸 스크린샷 검사를 로컬 Vite 서버와 함께 실행한다.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.WEB_PORT ?? 5184);

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
