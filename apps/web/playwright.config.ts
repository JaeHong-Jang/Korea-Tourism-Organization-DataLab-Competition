// 앱 셸 스크린샷 검사를 로컬 Vite 서버와 함께 실행한다.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../../tests/e2e",
  use: { baseURL: "http://127.0.0.1:5173", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
