// 예보팀의 팀 색과 역할 표식을 오른쪽을 보는 고래 몸통에 그린다.
import type { AgentStatus } from "@crowdcast/contracts/types";

export type PetState = AgentStatus["state"];
export type PetTeam = AgentStatus["team"];

type PetBodyProps = {
  team: PetTeam;
  state: PetState;
  mark?: string;
  baton?: boolean;
  size: 32 | 48 | 96;
};

export type PetCharacterProps = Pick<PetBodyProps, "state" | "size">;

// 계약의 응답 대기·보류 상태는 같은 표정을 쓰고 작업 중에는 물 분수가 움직인다.
export function PetBody({
  team,
  state,
  mark,
  baton = false,
  size,
}: PetBodyProps) {
  return (
    <svg
      aria-hidden="true"
      className={`pet-body pet-body--${team} pet-body--${state}`}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      focusable="false"
    >
      <ellipse className="pet-body__shadow" cx="51" cy="89" rx="32" ry="4" />
      <g className="pet-body__float">
        <path
          className="pet-body__tail"
          d="M36 49 C22 44 15 35 17 21 C22 27 27 30 33 31 C31 24 33 18 39 14 C40 24 45 32 49 39 Z"
        />
        <path
          className="pet-body__wave pet-body__wave--teal"
          d="M17 69 C29 73 38 74 50 72 C64 68 77 69 85 75 C79 83 65 88 47 87 C31 86 22 80 17 69 Z"
        />
        <path
          className="pet-body__wave pet-body__wave--yellow"
          d="M32 79 C45 76 62 72 82 76 C75 84 63 89 49 88 C40 87 35 83 32 79 Z"
        />
        <path
          className="pet-body__wave pet-body__wave--orange"
          d="M57 82 C64 77 73 75 83 77 C77 84 68 88 59 88 Z"
        />
        <path
          className="pet-body__shell"
          d="M25 56 C25 43 36 31 52 29 C67 26 78 32 82 44 C84 50 87 52 90 51 C89 61 81 67 72 68 C68 76 56 80 43 76 C31 73 25 65 25 56 Z"
        />
        <path
          className="pet-body__shell-detail"
          d="M39 39 C46 33 54 32 60 32"
        />
        <path
          className="pet-body__fin pet-body__fin--rest"
          d="M64 59 C71 56 78 60 78 66 C76 72 68 73 62 67 Z"
        />
        <path
          className="pet-body__fin pet-body__fin--raised"
          d="M65 59 C74 54 79 45 80 37 C85 38 87 44 84 52 C82 61 75 68 66 68 Z"
        />
        <path
          className="pet-body__belly"
          d="M35 62 C43 57 56 56 69 61 C69 71 61 78 51 79 C42 77 37 71 35 62 Z"
        />
        {mark && (
          <text className="pet-body__mark" x="51" y="75" textAnchor="middle">
            {mark}
          </text>
        )}
        <ellipse
          className="pet-body__eye-patch"
          cx="70"
          cy="44"
          rx="8"
          ry="9"
        />
        <g className="pet-body__eye pet-body__eye--open">
          <circle cx="71" cy="44" r="3.3" />
        </g>
        <g className="pet-body__eye pet-body__eye--done">
          <path d="M66 47 Q71 39 76 47" />
        </g>
        <g className="pet-body__eye pet-body__eye--waiting">
          <path d="M66 45 H76" />
        </g>
        <g className="pet-body__eye pet-body__eye--error">
          <path d="M67 41 L75 49 M75 41 L67 49" />
        </g>
        <path className="pet-body__smile" d="M79 58 Q84 60 88 56" />
        <g className="pet-body__spout">
          <path d="M59 28 Q55 21 53 18 M62 27 Q63 20 64 16 M65 29 Q70 24 71 20" />
        </g>
        {baton && (
          <g className="pet-body__flag">
            <path className="pet-body__flagpole" d="M79 33 V13" />
            <path
              className="pet-body__pennant"
              d="M79 14 Q86 12 90 16 L85 21 L79 20 Z"
            />
          </g>
        )}
      </g>
    </svg>
  );
}
