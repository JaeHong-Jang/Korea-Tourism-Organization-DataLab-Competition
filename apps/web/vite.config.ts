// 웹 개발 서버와 API 프록시, Tailwind 빌드 설정을 둔다.
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre 6 워커(ES 모듈)를 빌드에서도 모듈 워커로 묶는다
  worker: { format: "es" },
  server: {
    proxy: {
      // e2e는 CROWDCAST_GATEWAY_URL로 닫힌 포트를 넘겨 떠 있는 실제 게이트웨이에 붙지 않는다
      "/api": process.env.CROWDCAST_GATEWAY_URL ?? "http://127.0.0.1:8787",
    },
  },
});
