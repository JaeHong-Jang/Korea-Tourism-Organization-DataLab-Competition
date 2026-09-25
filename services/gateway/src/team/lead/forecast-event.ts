// 확정된 행사의 예보와 게이트 A를 상담·재예보가 함께 실행한다
// @ts-expect-error 계약 카드 투영은 JavaScript로 배포된다
import { projectCard } from "@crowdcast/contracts/rules/card-projection.mjs";
import type { Event, ForecastCard } from "@crowdcast/contracts/types";
import { createKnowledgeClient } from "../../clients/knowledge-client.js";
import { forecaster } from "../analysis/forecaster.js";
import type { ReportBundle } from "../report/bundle.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { Deadline } from "./deadline.js";
import { AnalysisGateError, analysisGate } from "./gates.js";

// 수치 카드는 같은 revision의 분석 검증이 끝난 뒤에만 내보낸다
export async function forecastEvent(
  sessionId: string,
  event: Event,
  context: Omit<ReportBundle, "forecast">,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
  today: string,
) {
  const { forecast, revision } = await execute(
    forecaster,
    { event, today },
    "행사 예측과 판정을 요청해요.",
    2,
  );
  const bundle = { forecast, ...context };
  const budgetMs = deadline.budget(8_000);
  const gate = await deadline.run(budgetMs, (signal) =>
    analysisGate(
      createKnowledgeClient({
        baseUrl: settings.config.services.knowledge,
        fetch: settings.fetcher,
        signal,
        timeoutMs: budgetMs,
      }),
      sessionId,
      revision,
      bundle,
      execute,
    ),
  );
  deadline.check();
  await writer.emit("gate", gate);
  if (!gate.passed)
    throw new AnalysisGateError("분석 게이트를 통과하지 못했습니다");
  deadline.check();
  await writer.emit("forecast", projectCard(forecast) as ForecastCard);
  return { bundle, gate };
}
