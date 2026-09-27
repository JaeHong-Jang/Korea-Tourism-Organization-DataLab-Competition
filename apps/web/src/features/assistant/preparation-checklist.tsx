// 행사 예보별 담당자 확인 상태를 브라우저에 저장하고 상세 권고를 펼쳐 보여 준다.
import { useState } from "react";
import {
  type PreparationAction,
  preparationGroups,
} from "./preparation-groups";

// 체크 표시는 안전 판정과 분리해 개인 확인 기록으로만 사용한다.
export function PreparationChecklist({
  forecastId,
  actions,
}: {
  forecastId: string;
  actions: PreparationAction[];
}) {
  const groups = preparationGroups(actions);
  const storageKey = `crowdcast-preparation:${forecastId}`;
  const [checked, setChecked] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? "[]",
      );
      return Array.isArray(saved)
        ? saved.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  });
  // 저장소가 차단돼도 현재 화면에서 확인 표시를 사용할 수 있다.
  const toggle = (id: string) => {
    const next = checked.includes(id)
      ? checked.filter((value) => value !== id)
      : [...checked, id];
    setChecked(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* 저장 실패 시 현재 화면의 표시만 유지한다. */
    }
  };
  if (!groups.length) return null;
  return (
    <section className="assistant-next__section" aria-label="준비 체크리스트">
      <h3>준비 체크리스트</h3>
      <p>
        담당자 확인용 · 체크는 안전 검증 완료를 뜻하지 않아요. 이 브라우저에
        저장됩니다.
      </p>
      <div className="assistant-next__checklist">
        {groups.map((group) => {
          const id = group.items
            .map((item) => item.id)
            .sort()
            .join("|");
          return (
            <div className="assistant-next__check" key={id}>
              <input
                type="checkbox"
                aria-label={`${group.title} 담당자 확인`}
                checked={checked.includes(id)}
                onChange={() => toggle(id)}
              />
              <details open>
                <summary>{group.title}</summary>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>{item.label}</li>
                  ))}
                </ul>
              </details>
            </div>
          );
        })}
      </div>
    </section>
  );
}
