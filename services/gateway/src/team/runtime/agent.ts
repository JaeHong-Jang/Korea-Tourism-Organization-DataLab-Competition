// 팀원이 공통 실행기에 제공하는 입력·결과·예산 인터페이스를 정의한다
import type { AgentStatus, AgentStep } from "@crowdcast/contracts/types";
import type { createForecastClient } from "../../clients/forecast-client.js";
import type { createKnowledgeClient } from "../../clients/knowledge-client.js";
import type { createLlmClient } from "../../llm/ollama-client.js";

export type AgentContext<Input> = {
  input: Input;
  sessionId: string;
  signal: AbortSignal;
  env: NodeJS.ProcessEnv;
  forecast: ReturnType<typeof createForecastClient>;
  knowledge: ReturnType<typeof createKnowledgeClient>;
  llm: Pick<ReturnType<typeof createLlmClient>, "complete">;
};
export type AgentResult<Output> = {
  value: Output;
  evidenceIds?: string[];
  status?: "done" | "blocked";
  note: string;
};
export type Agent<Input, Output> = {
  id: AgentStatus["agentId"];
  team: AgentStatus["team"];
  usesLlm: boolean;
  budgetMs: number;
  run(ctx: AgentContext<Input>): Promise<AgentResult<Output>>;
};
export type LlmUsage = Pick<AgentStep, "usedLlm" | "model">;
