// 아홉 섹션의 상태를 보여 주고 현재 섹션으로 이동시킨다.
import type { Plan } from "@crowdcast/contracts/types";

// 제목 버튼은 해당 섹션의 표제로 포커스를 옮긴다.
export function PlanContents({
  sections,
  active,
  onSelect,
}: {
  sections: Plan["sections"];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav className="plan-contents" aria-label="계획 초안 목차">
      <h2>목차</h2>
      <p>섹션을 선택하면 해당 메모로 이동해요.</p>
      <ol>
        {sections.map((section, index) => (
          <li key={section.key}>
            <button
              type="button"
              className={active === section.key ? "is-active" : ""}
              aria-current={active === section.key ? "location" : undefined}
              onClick={() => onSelect(section.key)}
            >
              <span>
                {index + 1}. {section.title}
              </span>
              <span className="plan-status">{section.status}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
