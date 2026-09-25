// 해설 재작성과 최종 검증을 지휘하고 발행 승인 뒤에만 문장·스냅샷을 보낸다

// @ts-expect-error 계약 카드 투영은 JavaScript로 배포된다
import { projectCard } from "@crowdcast/contracts/rules/card-projection.mjs";
import type {
  Event,
  ForecastReport,
  GateReport,
} from "@crowdcast/contracts/types";
import { createKnowledgeClient } from "../../clients/knowledge-client.js";
import { createRecordsClient } from "../../clients/records-client.js";
import { responseSchema } from "../../contract/responses.js";
import { explanationFailure } from "../../llm/explanation-failure.js";
import { briefer } from "../report/briefer.js";
import { type ReportBundle, reportEvidence } from "../report/bundle.js";
import { cardMaker } from "../report/card-maker.js";
import { type Explanation, explainer } from "../report/explainer.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import type { Deadline } from "./deadline.js";
import {
  ExplanationGateError,
  explanationGate,
  requireGateScope,
} from "./gates.js";

// 실행기가 실제 기록한 해설 단계에 문장을 묶어 모델 사용 이력까지 연결한다
async function explain(
  session: TeamSession,
  bundle: ReportBundle,
  execute: Executor,
  deadline: Deadline,
  templateOnly: boolean,
  violations: string[],
) {
  let explanation: Explanation;
  const input = {
    forecast: bundle.forecast,
    templateOnly:
      templateOnly ||
      deadline.budget(explainer.budgetMs, 2) < explainer.budgetMs,
    violations,
  };
  try {
    explanation = await execute(
      explainer,
      input,
      "근거로 설명 초안을 만들어요.",
      2,
    );
  } catch (error) {
    deadline.check();
    explanation = await execute(
      explainer,
      {
        ...input,
        templateOnly: true,
        fallbackReason: explanationFailure(error),
      },
      "템플릿 설명을 준비해요.",
      2,
    );
  }
  const step = [...session.steps]
    .reverse()
    .find((item) => item.agentId === "explainer");
  if (!step) throw new ExplanationGateError("해설 작성 단계가 없습니다");
  return {
    ...explanation,
    claims: explanation.claims.map((claim) => ({
      ...claim,
      generatedBy: { agentId: "explainer" as const, stepId: step.stepId },
    })),
  };
}

// 남은 요청 시간 안에서 knowledge 쓰기·검사 범위도 취소할 수 있게 한다
function knowledgeClient(settings: TeamSettings, deadline: Deadline) {
  return createKnowledgeClient({
    baseUrl: settings.config.services.knowledge,
    fetch: settings.fetcher,
    signal: deadline.controller.signal,
    timeoutMs: deadline.budget(8_000, 2),
  });
}

// 최대 두 번의 실패 게이트 이후 템플릿 실패는 추가 게이트 없이 오류로 끝낸다
export async function publishForecast(
  session: TeamSession,
  event: Event,
  bundle: ReportBundle,
  analysis: GateReport,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
) {
  let previous = analysis;
  let violations: string[] = [];
  let approved: Awaited<ReturnType<typeof explanationGate>> | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const explanation = await explain(
      session,
      bundle,
      execute,
      deadline,
      attempt === 2,
      violations,
    );
    const result = await explanationGate(
      knowledgeClient(settings, deadline),
      session.id,
      bundle.forecast,
      explanation.claims,
      previous,
      execute,
    );
    deadline.check();
    if (result.gate.passed || attempt < 2)
      await writer.emit("gate", result.gate);
    if (result.gate.passed) {
      approved = result;
      break;
    }
    if (explanation.template) break;
    previous = result.gate;
    violations = result.gate.violations.map(
      (item) => `${item.shapeId ?? item.check}: ${item.message}`,
    );
  }
  if (!approved)
    throw new ExplanationGateError("설명 문장을 검증하지 못했어요");

  // 배치와 브리핑은 승인된 후보를 선택할 뿐 그래프 내용을 바꾸지 않는다
  const arranged = await Promise.allSettled([
    execute(
      cardMaker,
      { claims: approved.claims, evidence: reportEvidence(bundle) },
      "검증된 문장과 카드를 배치해요.",
      2,
    ),
    execute(briefer, approved.claims, "요약과 다음 할 일을 골라요.", 2),
  ]);
  const [layoutResult, briefResult] = arranged;
  if (layoutResult.status === "rejected") throw layoutResult.reason;
  if (briefResult.status === "rejected") throw briefResult.reason;
  const { revision, masterVersion } = approved.gate;
  // 발행 전에 예보서 구조를 확인하고 승인 전까지는 메모리에만 보관한다
  const report = {
    forecastId: bundle.forecast.id,
    sessionId: session.id,
    publishedAt: new Date().toISOString(),
    revision,
    masterVersion,
    event,
    card: projectCard(bundle.forecast),
    forecast: bundle.forecast,
    claims: approved.claims.map((claim) => ({
      ...claim,
      status: "published" as const,
    })),
    evidence: reportEvidence(bundle),
    similar: bundle.similar,
    baseline: bundle.baseline,
    layout: layoutResult.value,
    brief: briefResult.value,
  };
  if (!responseSchema("forecast-report")(report))
    throw new ExplanationGateError("예보서 계약 위반");
  // 성공한 원자적 발행 뒤에만 처음으로 문장과 근거를 전송한다
  const published = await knowledgeClient(settings, deadline).publishSession(
    session.id,
    revision,
    masterVersion,
  );
  requireGateScope(published, "publish", revision, masterVersion);
  await writer.emit("gate", published);
  if (!published.passed)
    throw new ExplanationGateError("설명 문장을 발행하지 못했어요");
  session.completed = true;
  session.forecastId = bundle.forecast.id;
  report.publishedAt = new Date().toISOString();

  for (const claim of report.claims) await writer.emit("claim", claim);
  await writer.emit("evidence", { items: report.evidence });

  // 저장에 최대 5초를 주되 실패 안내와 완료 이벤트를 보낼 잔여 시간을 남긴다
  const actions = [...report.brief.actions];
  try {
    const timeoutMs = deadline.budget(5_000, 2);
    await deadline.run(timeoutMs, async (signal) => {
      const records = createRecordsClient({
        baseUrl: settings.config.services.records,
        fetch: settings.fetcher,
        signal,
        timeoutMs,
      });
      await records.saveEvent(event);
      await records.saveSnapshot(event.id, report as ForecastReport);
    });
  } catch {
    console.warn("발행 예보서 스냅샷 저장 실패");
    actions.push({
      id: "snapshot-unavailable",
      label: "예보서 링크를 만들지 못했어요",
    });
  }
  await writer.emit("suggest", { actions });
}
