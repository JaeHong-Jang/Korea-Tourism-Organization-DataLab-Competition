// 문장에 연결된 계약 근거의 번호와 종류를 눌러 열 수 있게 한다.
import type { Evidence } from "@crowdcast/contracts/types";
import {
  BookOpen,
  Database,
  FlaskConical,
  Gavel,
  ListChecks,
  Users,
} from "lucide-react";
import { ComponentState, type ComponentStatus } from "./component-state";
import { evidenceNumber } from "./evidence-number";

export const evidenceKinds = {
  data: { label: "데이터", Icon: Database },
  model: { label: "모델", Icon: FlaskConical },
  rule: { label: "규정", Icon: Gavel },
  case: { label: "사례", Icon: Users },
  assumption: { label: "가정", Icon: BookOpen },
  check: { label: "검증", Icon: ListChecks },
};

// 근거 ID를 클릭 동작에 그대로 넘기고 미리보기는 제목으로 제공한다.
export function EvidenceChip({
  evidence,
  number,
  evidenceOrder,
  onOpen,
  status = "ready",
}: {
  evidence?: Evidence | null;
  number?: number;
  evidenceOrder?: readonly Evidence[];
  onOpen?: (id: string) => void;
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !evidence)
    return (
      <ComponentState
        name="근거"
        status={status === "ready" ? "empty" : status}
      />
    );
  const resolvedNumber = evidenceOrder
    ? evidenceNumber(evidence.id, evidenceOrder)
    : (number ?? 1);
  if (resolvedNumber == null)
    return <ComponentState name="근거 번호" status="error" />;
  const { Icon, label } = evidenceKinds[evidence.kind];
  const content = (
    <>
      <Icon size={14} aria-hidden="true" />[{resolvedNumber}]
    </>
  );
  const props = {
    className: "evidence-chip",
    title: evidence.summary,
    "aria-label": `근거 ${resolvedNumber}, ${label}: ${evidence.title}`,
    "aria-description": evidence.summary,
  };
  return (
    <a
      {...props}
      href={`#evidence-${evidence.id}`}
      // 화면이 여는 방식을 주면 그쪽에 맡기고, 없으면 기본 앵커 이동에 접힌 카드만 펼친다
      onClick={(event) => {
        if (onOpen) {
          event.preventDefault();
          onOpen(evidence.id);
          return;
        }
        const card = document.getElementById(`evidence-${evidence.id}`);
        if (card instanceof HTMLDetailsElement) card.open = true;
      }}
    >
      {content}
    </a>
  );
}
