// 팀원 호출을 예산으로 감싸 상태·입력 요약·근거 id·실제 LLM 사용을 기록한다
import { randomUUID } from "node:crypto";
import type { AgentStep } from "@crowdcast/contracts/types";
import { createForecastClient } from "../../clients/forecast-client.js";
import { createKnowledgeClient } from "../../clients/knowledge-client.js";
import { createLlmClient } from "../../llm/ollama-client.js";
import type { Deadline } from "../lead/deadline.js";
import type { Agent, AgentResult, LlmUsage } from "./agent.js";
import type { EventWriter } from "./events.js";
import { fakeForecastFetch } from "./fake-forecast.js";
import type { TeamSettings } from "./settings.js";

// 서비스 호출은 팀원 범위의 취소 신호를 공유한다
export function createExecutor(
  sessionId: string,
  settings: TeamSettings,
  deadline: Deadline,
  writer: EventWriter,
) {
  return async <Input, Output>(
    agent: Agent<Input, Output>,
    input: Input,
    inputSummary: string,
    stagesLeft = 1,
  ): Promise<Output> => {
    const start = performance.now();
    const stepId = `st-${randomUUID()}`;
    const startedAt = new Date().toISOString();
    const usage: LlmUsage = { usedLlm: false, model: null };
    let result: AgentResult<Output> | undefined;
    let failure: unknown;
    let failed = false;
    await writer.emit("agent_status", {
      agentId: agent.id,
      team: agent.team,
      state: "working",
      note: inputSummary,
      stepId,
      at: startedAt,
    });

    // 도구가 무시한 취소도 바깥 마감에서 종료해 실패 기록을 반드시 남긴다
    try {
      const budgetMs = deadline.budget(agent.budgetMs, stagesLeft);
      result = await deadline.run(budgetMs, async (signal) => {
        const forecast = createForecastClient({
          baseUrl: settings.config.services.forecast,
          fetch:
            settings.mode === "fake" ? fakeForecastFetch : settings.fetcher,
          timeoutMs: budgetMs,
          signal,
        });
        const knowledge = createKnowledgeClient({
          baseUrl: settings.config.services.knowledge,
          fetch: settings.fetcher,
          timeoutMs: budgetMs,
          signal,
        });
        const llm = {
          // 사용 가능 여부와 실제 호출 여부를 분리하고 실패한 호출도 사용 기록에 남긴다
          complete: async (
            ...args: Parameters<ReturnType<typeof createLlmClient>["complete"]>
          ) => {
            if (!agent.usesLlm)
              throw new Error("이 팀원은 LLM을 호출할 수 없습니다");
            signal.throwIfAborted();
            const client = createLlmClient({
              env: settings.env,
              host: settings.config.ollamaHost,
              timeoutMs: budgetMs,
              recordings: settings.recordings,
              fetch: (url, init) =>
                settings.fetcher(url, {
                  ...init,
                  signal: AbortSignal.any([
                    signal,
                    ...(init?.signal ? [init.signal] : []),
                  ]),
                }),
            });
            usage.usedLlm = settings.env.LLM_MODE !== "fake";
            usage.model = usage.usedLlm ? client.model : null;
            return client.complete(...args);
          },
        };
        const output = await agent.run({
          input,
          sessionId,
          signal,
          env: settings.env,
          forecast,
          knowledge,
          llm,
        });
        signal.throwIfAborted();
        return output;
      });
    } catch (error) {
      failed = true;
      failure = error;
    }

    // 원문 메시지·서비스 오류 본문은 작업 기록에 넣지 않는다
    const status = failed ? "error" : (result?.status ?? "done");
    const note = failed
      ? "작업을 마치지 못했어요."
      : (result?.note ?? "작업을 마쳤어요.");
    const finishedAt = new Date().toISOString();
    const step: AgentStep = {
      stepId,
      agentId: agent.id,
      team: agent.team,
      startedAt,
      finishedAt,
      ms: Math.max(0, Math.round(performance.now() - start)),
      status,
      inputSummary,
      outputEvidenceIds: result?.evidenceIds ?? [],
      outputClaimIds: [],
      ...usage,
      note,
    };
    await writer.emit("agent_status", {
      agentId: agent.id,
      team: agent.team,
      state: status,
      note: note.slice(0, 60),
      stepId,
      at: finishedAt,
    });
    await writer.emit("agent_step", step);
    if (failed) throw failure;
    if (!result) throw new Error("팀원 결과가 없습니다");
    return result.value;
  };
}

export type Executor = ReturnType<typeof createExecutor>;
