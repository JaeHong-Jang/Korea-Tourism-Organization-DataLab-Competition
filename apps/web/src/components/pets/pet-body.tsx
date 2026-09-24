// 예보팀 펫의 공통 몸통과 상태별 표정을 SVG로 그린다.
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

// 여섯 계약 상태를 다섯 표정으로 묶고 역할 표식을 가슴에 둔다.
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
      <ellipse className="pet-body__shadow" cx="48" cy="88" rx="30" ry="4" />
      <g className="pet-body__float">
        <path
          className="pet-body__hand pet-body__hand--left"
          d="M19 56 Q8 50 8 57 Q8 64 21 65"
        />
        <path
          className="pet-body__hand pet-body__hand--right"
          d="M77 56 Q88 50 88 57 Q88 64 75 65"
        />
        <path
          className="pet-body__hand pet-body__hand--raised"
          d="M76 56 Q82 47 83 35 L83 29 Q82 25 87 24 Q92 24 91 30 L90 35 Q89 49 80 61 Z"
        />
        <path
          className="pet-body__shell"
          d="M24 79 Q16 76 15 67 Q7 62 9 52 Q7 43 15 38 Q16 27 27 25 Q33 15 46 18 Q58 15 66 25 Q78 26 80 38 Q89 44 86 54 Q89 64 80 68 Q78 78 68 80 Q48 86 24 79 Z"
        />
        <path className="pet-body__shell-detail" d="M20 44 Q22 30 34 27" />
        <rect
          className="pet-body__visor"
          x="20"
          y="32"
          width="56"
          height="29"
          rx="12"
        />
        <g className="pet-body__eyes pet-body__eyes--open">
          <rect x="34" y="43" width="5" height="7" rx="1" />
          <rect x="57" y="43" width="5" height="7" rx="1" />
        </g>
        <g className="pet-body__eyes pet-body__eyes--done">
          <path d="M32 50 L36 45 L40 50 M56 50 L60 45 L64 50" />
        </g>
        <g className="pet-body__eyes pet-body__eyes--waiting">
          <path d="M33 47 H40 M56 47 H63" />
        </g>
        <g className="pet-body__eyes pet-body__eyes--error">
          <path d="M33 43 L40 50 M40 43 L33 50 M56 43 L63 50 M63 43 L56 50" />
        </g>
        <rect
          className="pet-body__badge"
          x="36"
          y="64"
          width="24"
          height="17"
          rx="7"
        />
        {mark && (
          <text className="pet-body__mark" x="48" y="77" textAnchor="middle">
            {mark}
          </text>
        )}
        {baton && (
          <g className="pet-body__baton">
            <path d="M77 51 L88 34" />
            <circle cx="89" cy="32" r="3" />
          </g>
        )}
      </g>
    </svg>
  );
}
