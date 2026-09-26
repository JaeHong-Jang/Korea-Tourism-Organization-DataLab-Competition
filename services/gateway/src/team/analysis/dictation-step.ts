// 기존 받아쓰기를 수정하지 않고 팀원 실행 인터페이스와 답변 재개에 연결한다
import type { EventDraft } from "@crowdcast/contracts/types";
import type { Agent } from "../runtime/agent.js";
import { extractEvent } from "./dictation.js";
import { completeDraft, type TeamMessage } from "./draft-answer.js";
import { explicitType } from "./explicit-type.js";
import { hazardCandidates, hazardQuestion } from "./hazard-question.js";

type Input = {
  message: TeamMessage;
  draft?: EventDraft;
  askedFields: string[];
  hazardCandidates: EventDraft["hazards"];
  hazardsConfirmed: boolean;
};
type Output = ReturnType<typeof completeDraft> & {
  hazardCandidates: EventDraft["hazards"];
  hazardsConfirmed: boolean;
};

// 구조화된 답변은 LLM을 다시 부르지 않고 검증된 초안 칸에 직접 병합한다
export const dictation: Agent<Input, Output> = {
  id: "dictation",
  team: "analysis",
  usesLlm: true,
  budgetMs: 10_000,
  // 답변 재개에서는 원문 추출을 반복하지 않고 기존 초안을 이어 쓴다
  async run(ctx) {
    const previous = ctx.input.draft;
    const draft =
      previous ??
      (
        await extractEvent(ctx.input.message.text, {
          env: ctx.env,
          client: ctx.llm,
        })
      ).draft;
    ctx.signal.throwIfAborted();
    if (!previous && !draft.type)
      draft.type = explicitType(ctx.input.message.text);
    const value = completeDraft(
      draft,
      ctx.input.message.answer,
      ctx.input.askedFields,
    );

    // 위험 확인은 첫 원문과 확정 유형에서 찾고 명시적인 빈 배열 답도 기억한다
    const candidates = [
      ...new Set([
        ...ctx.input.hazardCandidates,
        ...hazardCandidates(
          previous ? "" : ctx.input.message.text,
          value.draft.type,
        ),
      ]),
    ];
    const confirmed =
      ctx.input.hazardsConfirmed ||
      (ctx.input.askedFields.includes("hazards") &&
        ctx.input.message.answer?.hazards !== undefined);
    if (candidates.length && !confirmed)
      value.questions.push(hazardQuestion(candidates));
    const note = value.ignoredFields.length
      ? `무시한 답 필드: ${value.ignoredFields.join(",")}`
      : value.questions.length
        ? "행사 정보를 더 확인해 주세요."
        : "행사 정보를 정리했어요.";
    return {
      value: {
        ...value,
        hazardCandidates: candidates,
        hazardsConfirmed: confirmed,
      },
      status: value.questions.length ? "blocked" : "done",
      note,
    };
  },
};
