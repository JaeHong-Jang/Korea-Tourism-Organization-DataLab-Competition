// 계획서 담당이 새 문장 없이 최초 발행 예보서로 안전관리계획 초안을 구성한다
import type { ForecastReport, Plan } from "@crowdcast/contracts/types";
import type { Agent } from "../runtime/agent.js";
import { planSections } from "./plan-templates.js";

export const planWriter: Agent<ForecastReport, Plan> = {
  id: "plan-writer",
  team: "report",
  usesLlm: false,
  budgetMs: 1_000,
  // 같은 예보는 같은 계획 id를 사용하고 최초 스냅샷의 문장만 배치한다
  async run({ input }) {
    const sections = planSections(input);
    const written = sections.filter(
      (section) => section.status === "작성됨",
    ).length;
    const at = new Date().toISOString();
    return {
      value: {
        id: `plan-${input.forecastId.replace(/^f-/, "")}`,
        forecastId: input.forecastId,
        eventId: input.event.id,
        sessionId: input.sessionId,
        title: `${input.event.name} 안전관리계획 초안`,
        createdAt: at,
        updatedAt: at,
        sections,
        watermark: "참고용 초안 — 담당자 검토 필수",
      },
      note: `초안 9섹션 중 ${written}섹션을 발행 문장으로 채웠어요, ${sections.length - written}섹션은 검토 필요`,
    };
  },
};
