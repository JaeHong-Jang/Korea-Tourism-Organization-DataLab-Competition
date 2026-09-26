// 앱 서비스와 Ollama의 상태를 독립된 요청으로 동시에 확인한다
import { type GatewayConfig, HEALTH_TIMEOUT_MS } from "../config.js";
import { serviceHealthSchema } from "../contract/responses.js";
import { withRequestDeadline } from "./request-deadline.js";
import { requestJson } from "./request-json.js";

// 연결·본문·계약 오류는 해당 서비스 상태만 실패로 바꾸고 지연은 정수로 기록한다
async function checkService(baseUrl: string, fetcher: typeof fetch) {
  const started = performance.now();
  try {
    await requestJson(
      { baseUrl, fetch: fetcher, timeoutMs: HEALTH_TIMEOUT_MS },
      "/health",
      serviceHealthSchema,
      { method: "GET" },
    );
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - started) };
  }
}

// Ollama는 모델 생성 없이 버전 엔드포인트의 접속 상태만 확인한다
export async function checkOllama(host: string, fetcher: typeof fetch) {
  try {
    const ok = await withRequestDeadline(HEALTH_TIMEOUT_MS, async (signal) => {
      const response = await fetcher(`${host}/api/version`, { signal });
      await response.body?.cancel();
      return response.ok;
    });
    return { ok, host };
  } catch {
    return { ok: false, host };
  }
}

// 모든 요청을 병렬로 시작해 전체 대기가 각 서비스의 제한을 더한 시간이 되지 않게 한다
export async function checkHealth(
  config: GatewayConfig,
  fetcher: typeof fetch,
) {
  const [forecast, knowledge, records, ollama] = await Promise.all([
    checkService(config.services.forecast, fetcher),
    checkService(config.services.knowledge, fetcher),
    checkService(config.services.records, fetcher),
    checkOllama(config.ollamaHost, fetcher),
  ]);
  return { services: { forecast, knowledge, records }, ollama };
}
