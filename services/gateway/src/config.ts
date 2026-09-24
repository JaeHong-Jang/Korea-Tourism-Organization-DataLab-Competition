// 게이트웨이 포트와 백엔드·Ollama 주소를 실행 환경에서 읽는다
export const HEALTH_TIMEOUT_MS = 2_000;
export const SERVICE_TIMEOUT_MS = 10_000;

// dev.mjs가 넘긴 호스트를 HTTP 주소로 정규화하고 잘못된 설정은 시작 전에 거부한다
function serviceUrl(value: string, name: string): string {
  const url = new URL(value.includes("://") ? value : `http://${value}`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name}에는 인증 정보·쿼리가 없는 HTTP 주소가 필요합니다`);
  }
  return url.href.replace(/\/$/, "");
}

// 환경 변수를 주입할 수 있게 해 테스트에서 실제 서비스 설정을 읽지 않는다
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.GATEWAY_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("GATEWAY_PORT는 1~65535 사이 정수여야 합니다");
  }

  // 로컬 실행 포트는 개발 실행기와 같게 두고 필요할 때만 환경 변수로 바꾼다
  return {
    port,
    services: {
      forecast: serviceUrl(
        env.FORECAST_URL || "http://127.0.0.1:8010",
        "FORECAST_URL",
      ),
      knowledge: serviceUrl(
        env.KNOWLEDGE_URL || "http://127.0.0.1:8020",
        "KNOWLEDGE_URL",
      ),
      records: serviceUrl(
        env.RECORDS_URL || "http://127.0.0.1:8030",
        "RECORDS_URL",
      ),
    },
    ollamaHost: serviceUrl(
      env.OLLAMA_HOST || "http://127.0.0.1:11434",
      "OLLAMA_HOST",
    ),
  };
}

export type GatewayConfig = ReturnType<typeof readConfig>;
