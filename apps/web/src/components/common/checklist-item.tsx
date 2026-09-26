// 판정 계약의 준비 항목과 규정·근거 식별자를 한 줄에 둔다.
import type { Evidence, Judgment } from "@crowdcast/contracts/types";
import { ComponentState, type ComponentStatus } from "./component-state";
import { EvidenceChip } from "./evidence-chip";

// 체크 여부는 사용자 행동으로만 바뀌며 계약 판정을 다시 계산하지 않는다.
export function ChecklistItem({
  item,
  evidence = [],
  evidenceOrder,
  checked = false,
  onChange,
  onOpen,
  status = "ready",
}: {
  item?: Judgment["checklist"][number] | null;
  evidence?: Evidence[];
  evidenceOrder?: readonly Evidence[];
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  onOpen?: (id: string) => void;
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !item)
    return (
      <ComponentState
        name="준비 항목"
        status={status === "ready" ? "empty" : status}
      />
    );
  if (item.evidenceIds.some((id) => !evidence.some((entry) => entry.id === id)))
    return <ComponentState name="준비 항목 근거" status="error" />;
  return (
    <label className="checklist-item">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span>
        <strong>{item.text}</strong>
        <small>
          근거{" "}
          {item.evidenceIds.map((id) => {
            const entry = evidence.find((candidate) => candidate.id === id);
            return entry ? (
              <EvidenceChip
                key={id}
                evidence={entry}
                evidenceOrder={evidenceOrder ?? evidence}
                onOpen={onOpen}
              />
            ) : null;
          })}
        </small>
      </span>
    </label>
  );
}
