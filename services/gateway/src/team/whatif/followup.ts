// 날씨와 유사 행사 질문은 기존 예보의 근거만으로 게이트 B를 거쳐 답한다
import type { Claim, ForecastReport } from "@crowdcast/contracts/types";
import type { Deadline } from "../lead/deadline.js";
import { explainWhy } from "../lead/followup-why.js";
import { knowledgeClient } from "../lead/publish.js";
import { type DraftText, draftClaims } from "../report/bundle.js";
import type { Agent } from "../runtime/agent.js";
import type { EventWriter } from "../runtime/events.js";
import type { Executor } from "../runtime/executor.js";
import type { TeamSession } from "../runtime/sessions.js";
import type { TeamSettings } from "../runtime/settings.js";
import { reviewEvidence } from "../verification/skeptic.js";
import {
  WEATHER_ASSUMPTION_TEXT,
  WEATHER_RULE_TEXT,
  weatherEvidence,
} from "./weather-evidence.js";

// 사례명에 숫자가 있으면 근거 카드에서 원문을 보게 하고 설명에는 수치를 옮기지 않는다
function similarTexts(report: ForecastReport): DraftText[] {
  const cases = report.evidence.filter((item) => item.kind === "case");
  if (!cases.length) return [];
  const names = report.similar
    .filter((item) => !/\p{N}/u.test(item.name))
    .map((item) => item.name);
  return [
    {
      text: names.length
        ? `발행 예보에서 참고한 유사 행사는 ${[...new Set(names)].join("·")}예요`
        : "발행 예보에서 참고한 유사 행사 기록을 근거 카드에서 볼 수 있어요",
      claimType: "설명",
      evidenceIds: cases.map((item) => item.id),
      placeholders: [],
    },
  ];
}

// 기준 근거도 세션 그래프에 적재해 SHACL과 실제 전송 근거가 일치하게 한다
export async function whatifFollowup(
  kind: "weather" | "similar",
  session: TeamSession,
  execute: Executor,
  writer: EventWriter,
  deadline: Deadline,
  settings: TeamSettings,
) {
  const published = session.published;
  if (!published) throw new Error("발행 예보가 없습니다");
  const report = structuredClone(published.report);
  let texts: DraftText[];
  if (kind === "weather") {
    // 기준 가정의 세션 참조가 없으면 계약을 우회하거나 예보 수치를 보충하지 않는다
    if (
      !report.forecast.assumptions.some(
        (item) => item.id === "as-weather-adjustment",
      )
    ) {
      await writer.emit("error", {
        code: "OUT_OF_SCOPE",
        message:
          "이 예보에는 날씨 근거가 없어요 — 행사일이 10일 넘게 남아 기상청 예보가 아직 없거나 날씨 반영 전에 만든 예보예요. 행사 10일 전부터 내 행사에서 재예보하면 날씨를 반영해요.",
      });
      return;
    }
    const evidence = weatherEvidence();
    const loaded = await knowledgeClient(settings, deadline).addFacts(
      session.id,
      { schema: "evidence", items: evidence },
    );
    published.revision = loaded.revision;
    report.evidence.push(...evidence);
    texts = [
      {
        text: WEATHER_RULE_TEXT,
        claimType: "권고",
        evidenceIds: [
          evidence[0].id,
          ...reviewEvidence(report.forecast).map((item) => item.id),
        ],
        placeholders: [],
      },
      {
        text: WEATHER_ASSUMPTION_TEXT,
        claimType: "설명",
        evidenceIds: [evidence[1].id],
        placeholders: [],
      },
    ];
  } else {
    texts = similarTexts(report);
    if (!texts.length) {
      await writer.emit("error", {
        code: "OUT_OF_SCOPE",
        message:
          "발행 예보에 유사 행사 근거가 없어요. 근거가 있는 예보에서 다시 확인해 주세요.",
      });
      return;
    }
  }
  const explainer: Agent<ForecastReport, Claim[]> = {
    id: "explainer",
    team: "report",
    usesLlm: false,
    budgetMs: 1_000,
    // 새 주장도 기존 발행 문장과 같은 검사·폐기·복구 경로로 보낸다
    async run({ input, sessionId }) {
      return {
        value: draftClaims(texts, sessionId, input.forecastId),
        note: "발행된 근거로 조건 질문의 답을 준비했어요.",
      };
    },
  };
  await explainWhy(
    session,
    execute,
    writer,
    deadline,
    settings,
    explainer,
    report,
  );
}
