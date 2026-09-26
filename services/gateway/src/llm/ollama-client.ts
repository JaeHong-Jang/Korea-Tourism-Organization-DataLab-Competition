// 모든 Ollama 생성 호출에 스키마·토큰 상한·요청 마감을 강제한다
import { type Message, Ollama } from "ollama/browser";
import { withRequestDeadline } from "../clients/request-deadline.js";
import { replayExtraction } from "./fake-llm.js";
import { readLlmSettings } from "./models.js";

// 전송 성공 뒤 출력이 미완결인 경우를 HTTP 실패와 구분한다
export class LlmSchemaError extends Error {}

export type LlmCompletion = {
  content: string;
  metrics: {
    elapsedMs: number;
    loadMs: number;
    outputTokens: number;
    model: string;
    fake: boolean;
  };
};
export type LlmRequest = {
  schema: Record<string, unknown>;
  messages: Message[];
  recordingKey: string;
  // 짧은 답은 출력 상한을 낮춰 형식 제약 출력 뒤 공백이 이어질 때 시간을 버리지 않는다
  maxTokens?: number;
};
export type LlmOptions = {
  env?: NodeJS.ProcessEnv;
  host?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  recordings?: Readonly<Record<string, string>>;
};

// SDK 인스턴스를 호출마다 만들어 동시 요청의 취소 신호가 섞이지 않게 한다
export function createLlmClient(options: LlmOptions = {}) {
  const settings = readLlmSettings(options.env);
  const model = options.model ?? settings.model;
  const timeoutMs = options.timeoutMs ?? settings.timeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("LLM 시간 예산은 양수여야 합니다");

  // SDK의 본문 읽기까지 마감을 적용하고 HTTP 전송에 취소 신호를 전달한다
  const request = <T>(operation: (ollama: Ollama) => Promise<T>) =>
    withRequestDeadline(timeoutMs, (signal) => {
      const ollama = new Ollama({
        host: options.host ?? settings.host,
        fetch: (input, init) =>
          (options.fetch ?? fetch)(input, { ...init, signal }),
      });
      return operation(ollama);
    });

  return {
    model,
    // 추론 문자열·도구 호출을 쓰지 않고 JSON 스키마로 제한한 본문만 받는다
    async complete(input: LlmRequest): Promise<LlmCompletion> {
      const start = performance.now();
      if (settings.mode === "fake")
        return {
          content: replayExtraction(input.recordingKey, options.recordings),
          metrics: {
            elapsedMs: performance.now() - start,
            loadMs: 0,
            outputTokens: 0,
            model,
            fake: true,
          },
        };
      const response = await request((ollama) =>
        ollama.chat({
          model,
          messages: input.messages,
          format: input.schema,
          stream: false,
          // 5분이면 쉬는 사이 내려가 다음 첫 호출이 로딩(약 6초)만으로 3초 예산을 넘긴다
          keep_alive: "30m",
          options: {
            temperature: 0,
            seed: 42,
            num_predict: input.maxTokens ?? settings.maxTokens,
            num_ctx: 4096,
          },
        }),
      );
      // 상한에서 끊겨도 앞부분이 완결된 JSON이면(뒤에 공백만 이어진 경우) 받아들인다
      const complete =
        response.done_reason !== "length" ||
        (typeof response.message?.content === "string" &&
          isCompleteJson(response.message.content));
      if (
        !response.done ||
        !complete ||
        response.message?.tool_calls?.length ||
        typeof response.message?.content !== "string"
      ) {
        throw new LlmSchemaError("LLM 응답이 완결된 필드 추출이 아닙니다");
      }
      return {
        content: response.message.content.trim(),
        metrics: {
          elapsedMs: performance.now() - start,
          loadMs: response.load_duration / 1e6,
          outputTokens: response.eval_count,
          model,
          fake: false,
        },
      };
    },
    // 평가의 첫 로딩 측정 전에 해당 모델만 내리고 내려간 상태를 확인한다
    async unload(): Promise<void> {
      if (settings.mode === "fake")
        throw new Error("가짜 LLM으로 실제 모델 평가를 할 수 없습니다");
      await request((ollama) =>
        ollama.generate({ model, prompt: "", keep_alive: 0, stream: false }),
      );
      const running = await request((ollama) => ollama.ps());
      if (running.models.some((item) => item.name === model))
        throw new Error("모델 언로드 확인 실패");
    },
  };
}

// 형식 제약 출력 뒤에 공백만 붙은 경우를 가려내려고 앞뒤 공백을 뺀 본문이 JSON으로 읽히는지 본다
function isCompleteJson(content: string) {
  try {
    JSON.parse(content.trim());
    return true;
  } catch {
    return false;
  }
}
