// 계약의 열세 팀원과 여섯 상태가 이름표와 접근성 설명을 유지하는지 검증한다.

import statusSchema from "@crowdcast/contracts/schemas/agent-status.schema.json";
import commonSchema from "@crowdcast/contracts/schemas/common.schema.json";
import type { AgentStatus } from "@crowdcast/contracts/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PET_AGENT_IDS, PetAvatar } from "../pet-avatar";

const NAMES: Record<AgentStatus["agentId"], string> = {
  lead: "지휘",
  dictation: "받아쓰기",
  "local-guide": "동네지기",
  archivist: "기록관",
  forecaster: "예보관",
  "source-check": "출처확인",
  "number-check": "숫자대조",
  "rule-check": "법규담당",
  skeptic: "깐깐이",
  explainer: "해설가",
  "card-maker": "카드장인",
  "plan-writer": "계획서",
  briefer: "브리핑",
};

describe("PetAvatar", () => {
  // 그림 수와 식별자가 계약을 빠짐없이 따라가게 한다.
  it("계약의 열세 팀원을 모두 제공한다", () => {
    expect(PET_AGENT_IDS).toEqual(commonSchema.$defs.agentId.enum);
  });

  // 각 팀원과 상태 조합에 고유 그림, 이름표, 접근성 설명을 둔다.
  it.each(commonSchema.$defs.agentId.enum)(
    "%s의 모든 계약 상태를 그린다",
    (agentId) => {
      for (const state of statusSchema.properties.state.enum) {
        const markup = renderToStaticMarkup(
          <PetAvatar
            agentId={agentId as AgentStatus["agentId"]}
            state={state as AgentStatus["state"]}
            size={48}
          />,
        );
        expect(markup).toContain(
          `aria-label="${NAMES[agentId as AgentStatus["agentId"]]} · `,
        );
        expect(markup).toContain(`pet-body--${state}`);
        expect(markup).toContain(`<figcaption`);
        expect(markup).toContain(NAMES[agentId as AgentStatus["agentId"]]);
        expect(markup).toContain("<svg");
      }
    },
  );

  // 추가 설명을 붙여도 본래의 한국어 이름표는 사라지지 않는다.
  it("추가 문구와 세 크기를 지원한다", () => {
    for (const size of [32, 48, 96] as const) {
      const markup = renderToStaticMarkup(
        <PetAvatar
          agentId="lead"
          state="working"
          size={size}
          label="확인 중"
        />,
      );
      expect(markup).toContain(`width="${size}"`);
      expect(markup).toContain("지휘 · 작업 중 · 확인 중");
      expect(markup).toContain('pet-avatar__name">지휘');
    }
  });

  // 잘못된 식별자는 조용히 다른 캐릭터로 대체하지 않는다.
  it("알 수 없는 agentId를 거부한다", () => {
    expect(() =>
      renderToStaticMarkup(
        <PetAvatar
          agentId={"unknown" as AgentStatus["agentId"]}
          state="idle"
          size={48}
        />,
      ),
    ).toThrow("알 수 없는 예보팀원: unknown");
  });
});
