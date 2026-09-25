// 모델 적재 상태를 생성 호출 없이 관찰하고 확인 불가도 실행 조건에 남긴다
import { hostname, release } from "node:os";

// 평가 대상은 로컬 환경 주소만 허용하고 인증 정보가 산출물에 들어가지 않게 한다
export function localBase(value: string): string {
  const url = new URL(value);
  const host = url.hostname;
  const local =
    ["localhost", "127.0.0.1", "[::1]"].includes(host) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (
    !local ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("인증 정보 없는 로컬 서비스 기본 주소가 필요합니다");
  return url.origin;
}

// 게이트웨이 health가 알려 준 Ollama의 적재 목록만 읽고 모델을 싣거나 내리지 않는다
export async function observeConditions(
  fetcher: typeof fetch,
  base: string,
  fake: boolean,
) {
  const location = {
    hostname: hostname(),
    platform: process.platform,
    release: release(),
    arch: process.arch,
    node: process.version,
    cwd: process.cwd(),
  };
  if (fake)
    return {
      location,
      ollama: {
        status: "가짜: 호출하지 않음",
        host: null,
        loadedModels: [] as string[],
      },
    };
  try {
    const health = await fetcher(`${base}/api/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!health.ok) throw new Error("health 실패");
    const body = (await health.json()) as { ollama?: { host?: string } };
    const host = localBase(body.ollama?.host ?? "");
    const response = await fetcher(`${host}/api/ps`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("Ollama ps 실패");
    const ps = (await response.json()) as {
      models?: { name?: string; model?: string }[];
    };
    if (!Array.isArray(ps.models)) throw new Error("Ollama ps 형식 오류");
    const loadedModels = ps.models
      .map((item) => item.name ?? item.model)
      .filter((value): value is string => typeof value === "string");
    return {
      location,
      ollama: {
        status: loadedModels.length ? "적재됨" : "미적재",
        host,
        loadedModels,
      },
    };
  } catch {
    return {
      location,
      ollama: { status: "확인 불가", host: null, loadedModels: [] as string[] },
    };
  }
}
