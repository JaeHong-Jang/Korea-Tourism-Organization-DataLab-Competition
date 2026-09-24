// 계약의 에이전트 식별자를 펫 그림과 한국어 이름표에 연결한다.
import type { AgentStatus } from "@crowdcast/contracts/types";
import type { ComponentType } from "react";
import { Archivist } from "./archivist";
import { Briefer } from "./briefer";
import { CardMaker } from "./card-maker";
import { Dictation } from "./dictation";
import { Explainer } from "./explainer";
import { Forecaster } from "./forecaster";
import { Lead } from "./lead";
import { LocalGuide } from "./local-guide";
import { NumberCheck } from "./number-check";
import type { PetCharacterProps } from "./pet-body";
import { PlanWriter } from "./plan-writer";
import { RuleCheck } from "./rule-check";
import { Skeptic } from "./skeptic";
import { SourceCheck } from "./source-check";
import "./pets.css";

type AgentId = AgentStatus["agentId"];
type PetState = AgentStatus["state"];
type PetEntry = { name: string; character: ComponentType<PetCharacterProps> };

const PETS = {
  lead: { name: "지휘", character: Lead },
  dictation: { name: "받아쓰기", character: Dictation },
  "local-guide": { name: "동네지기", character: LocalGuide },
  archivist: { name: "기록관", character: Archivist },
  forecaster: { name: "예보관", character: Forecaster },
  "source-check": { name: "출처확인", character: SourceCheck },
  "number-check": { name: "숫자대조", character: NumberCheck },
  "rule-check": { name: "법규담당", character: RuleCheck },
  skeptic: { name: "깐깐이", character: Skeptic },
  explainer: { name: "해설가", character: Explainer },
  "card-maker": { name: "카드장인", character: CardMaker },
  "plan-writer": { name: "계획서", character: PlanWriter },
  briefer: { name: "브리핑", character: Briefer },
} satisfies Record<AgentId, PetEntry>;

const STATE_NAMES: Record<PetState, string> = {
  idle: "대기",
  working: "작업 중",
  done: "완료",
  waiting: "응답 대기",
  blocked: "보류",
  error: "오류",
};

export const PET_AGENT_IDS = Object.keys(PETS) as AgentId[];

export type PetAvatarProps = {
  agentId: AgentId;
  state: PetState;
  size: 32 | 48 | 96;
  label?: string;
};

// 이름표를 항상 남기고 알 수 없는 에이전트는 잘못된 연결로 드러낸다.
export function PetAvatar({ agentId, state, size, label }: PetAvatarProps) {
  if (!Object.hasOwn(PETS, agentId)) {
    throw new Error(`알 수 없는 예보팀원: ${agentId}`);
  }

  // 한국어 이름과 상태를 보조 문구까지 읽기 쉬운 한 문장으로 묶는다.
  const { name, character: Character } = PETS[agentId];
  const description = [name, STATE_NAMES[state], label]
    .filter(Boolean)
    .join(" · ");

  // 그림을 하나의 접근성 이미지로 묶되 이름표는 화면에 남긴다.
  return (
    <figure
      className={`pet-avatar pet-avatar--${size}`}
      role="img"
      aria-label={description}
    >
      <Character state={state} size={size} />
      <figcaption className="pet-avatar__caption">
        <span className="pet-avatar__name">{name}</span>
        {label && <span className="pet-avatar__detail">{label}</span>}
      </figcaption>
    </figure>
  );
}
