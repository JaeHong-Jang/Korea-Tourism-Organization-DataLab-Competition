// 단독 실행에서도 루트 .env와 개발 실행기 순서로 Ollama 주소를 선택한다
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { checkOllama } from "./clients/health-client.js";
import { readConfig } from "./config.js";

// workspace 명령의 작업 디렉터리와 무관하게 레포 루트 .env를 읽는다
function loadEnvironment(inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...inherited };
  let contents: string;
  try {
    contents = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return env;
    throw error;
  }

  // 실행기가 이미 넘긴 값은 유지하고 따옴표·주석은 Node의 .env 파서로 처리한다
  for (const [key, value] of Object.entries(parseEnv(contents))) {
    if (env[key] === undefined) env[key] = value;
  }
  return env;
}

// WSL 기본 경로를 짧게 조회하고 ip 명령이 없으면 로컬 후보만 사용한다
function defaultGateway(): string | undefined {
  try {
    const route = execFileSync("ip", ["route", "show", "default"], {
      encoding: "utf8",
      timeout: 1_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return route.match(/\bvia\s+(\S+)/)?.[1];
  } catch {
    return undefined;
  }
}

// 환경 설정·WSL 게이트웨이·루프백 순서로 연결 가능한 첫 후보를 고른다
export async function readStartupConfig(
  inherited: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const env = loadEnvironment(inherited);
  const config = readConfig(env);
  const gateway = defaultGateway();
  const candidates = new Set([
    ...(env.OLLAMA_HOST ? [config.ollamaHost] : []),
    ...(gateway ? [`http://${gateway}:11434`] : []),
    "http://127.0.0.1:11434",
  ]);

  // 생성 호출 없이 후보마다 2초 상태 확인을 하고 전부 꺼져 있어도 앱은 시작한다
  for (const host of candidates) {
    if ((await checkOllama(host, fetcher)).ok)
      return { ...config, ollamaHost: host };
  }
  return config;
}
