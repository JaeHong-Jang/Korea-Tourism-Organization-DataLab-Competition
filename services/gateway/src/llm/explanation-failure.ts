// 생성 실패의 원문을 노출하지 않고 템플릿 전환 이유만 분류한다
import { RequestTimeoutError } from "../clients/request-deadline.js";
import { LlmSchemaError } from "./ollama-client.js";

export type ExplanationFailure =
  | "context"
  | "timeout"
  | "schema"
  | "http"
  | "parse";

// SDK 오류의 본문은 분류에만 쓰고 작업 기록에는 고정 코드만 전달한다
export function explanationFailure(error: unknown): ExplanationFailure {
  if (
    error instanceof RequestTimeoutError ||
    (error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name))
  )
    return "timeout";
  if (error instanceof SyntaxError) return "parse";
  if (error instanceof LlmSchemaError) return "schema";
  if (
    error instanceof Error &&
    /exceed_context_size|context (?:length|size)|input.*context/i.test(
      error.message,
    )
  )
    return "context";
  return "http";
}
