// 받아쓰기 후보 모델과 제한된 실행 설정을 한 곳에서 읽는다
import { readConfig, SERVICE_TIMEOUT_MS } from "../config.js";

export const EXTRACTION_MODELS = [
  "qwen3:4b-instruct-2507-q4_K_M",
  "qwen2.5:7b",
] as const;
// 기본은 qwen3 4b — T-302 평가(30건)에서 필드 정확도 99.78%(1칸 차이)로 7b와 같은 수준이고 로딩됨 p95가 30% 짧다(3D와 GPU 공유). 7b는 품질 대안
export const DEFAULT_EXTRACTION_MODEL = EXTRACTION_MODELS[0];
export const MAX_OUTPUT_TOKENS = 768;

// 모델 선택만 환경 변수로 바꾸고 기본 시간 예산은 게이트웨이 설정을 따른다
export function readLlmSettings(env: NodeJS.ProcessEnv = process.env) {
  if (env.LLM_MODE && !["fake", "ollama"].includes(env.LLM_MODE)) {
    throw new Error("LLM_MODE는 fake 또는 ollama여야 합니다");
  }
  return {
    host: readConfig(env).ollamaHost,
    model: env.OLLAMA_MODEL_FAST || DEFAULT_EXTRACTION_MODEL,
    mode: env.LLM_MODE === "fake" ? ("fake" as const) : ("ollama" as const),
    timeoutMs: SERVICE_TIMEOUT_MS,
    maxTokens: MAX_OUTPUT_TOKENS,
  };
}
