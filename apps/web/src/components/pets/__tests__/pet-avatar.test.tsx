// 계약의 열세 팀원과 여섯 상태가 이름표와 접근성 설명을 유지하는지 검증한다.

import { readFileSync } from "node:fs";
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

const CHARACTER_DETAILS: Record<
  AgentStatus["agentId"],
  { team: AgentStatus["team"]; mark: string }
> = {
  lead: { team: "lead", mark: "↗" },
  dictation: { team: "analysis", mark: "✎" },
  "local-guide": { team: "analysis", mark: "⌂" },
  archivist: { team: "analysis", mark: "▤" },
  forecaster: { team: "analysis", mark: "∿" },
  "source-check": { team: "verification", mark: "⌕" },
  "number-check": { team: "verification", mark: "#" },
  "rule-check": { team: "verification", mark: "§" },
  skeptic: { team: "verification", mark: "?" },
  explainer: { team: "report", mark: "“" },
  "card-maker": { team: "report", mark: "▦" },
  "plan-writer": { team: "report", mark: "☰" },
  briefer: { team: "report", mark: "≡" },
};

const DISPLAY_STATES = ["idle", "working", "done", "waiting", "error"] as const;

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

  // 열세 역할의 다섯 화면 상태에서 팀 색 연결과 가슴 표식이 유지되는지 확인한다.
  it.each(commonSchema.$defs.agentId.enum)(
    "%s의 고래 색과 표식이 다섯 상태에서 유지된다",
    (agentId) => {
      const { team, mark } =
        CHARACTER_DETAILS[agentId as AgentStatus["agentId"]];
      for (const state of DISPLAY_STATES) {
        const markup = renderToStaticMarkup(
          <PetAvatar
            agentId={agentId as AgentStatus["agentId"]}
            state={state}
            size={32}
          />,
        );
        expect(markup).toContain(`pet-body--${team} pet-body--${state}`);
        expect(markup).toContain('viewBox="0 0 96 96"');
        expect(markup).toContain('class="pet-body__tail"');
        expect(markup).toContain('class="pet-body__spout"');
        expect(markup).toContain('class="pet-body__wave pet-body__wave--teal"');
        expect(markup).toContain(
          `class="pet-body__mark" x="51" y="75" text-anchor="middle">${mark}</text>`,
        );
        expect(markup.includes('class="pet-body__flag"')).toBe(
          agentId === "lead",
        );
      }
    },
  );

  // 팀별 몸통과 세 물결은 계약의 색 토큰만 참조한다.
  it("팀 색과 물결 색에 기존 토큰을 쓴다", () => {
    const styles = readFileSync(
      new URL("../pets.css", import.meta.url),
      "utf8",
    );
    for (const team of ["lead", "analysis", "verification", "report"]) {
      expect(styles).toContain(
        `.pet-body--${team} { --pet-shell: var(--team-${team}); }`,
      );
    }
    expect(styles).toContain(
      ".pet-body__wave--teal { fill: var(--scene-sea); }",
    );
    expect(styles).toContain(
      ".pet-body__wave--yellow { fill: var(--scene-window-glow); }",
    );
    expect(styles).toContain(
      ".pet-body__wave--orange { fill: var(--scene-doll-8); }",
    );
  });

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
