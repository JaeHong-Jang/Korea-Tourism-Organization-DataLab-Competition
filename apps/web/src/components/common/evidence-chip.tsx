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
import { createContext, useContext } from "react";
import { evidenceDisplayTitle } from "../../lib/evidence-feature-labels";
import { stripReviewNotice } from "../../lib/review-notice";
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

// 예보서와 근거 정리에서 같은 번호 버튼의 펼침 상태를 공유한다.
export const EvidenceSelectionContext = createContext<string | null>(null);

// 근거 ID를 클릭 동작에 그대로 넘기고 미리보기는 제목으로 제공한다.
export function EvidenceChip({
  evidence,
  number,
  evidenceOrder,
  onOpen,
  hideProbability = false,
  status = "ready",
}: {
  evidence?: Evidence | null;
  number?: number;
  evidenceOrder?: readonly Evidence[];
  onOpen?: (id: string, origin: HTMLElement) => void;
  hideProbability?: boolean;
  status?: ComponentStatus;
}) {
  const selectedId = useContext(EvidenceSelectionContext);
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
  const { label } = evidenceKinds[evidence.kind];
  const title = evidenceDisplayTitle(evidence);
  const expanded = selectedId === evidence.id;
  const content = <>[{resolvedNumber}]</>;
  const props = {
    className: "evidence-chip",
    title: `${title} 근거 ${expanded ? "접기" : "열기"}`,
    "aria-description":
      hideProbability && evidence.summary.includes("%")
        ? "구간 기준 표시"
        : /^[[{]/.test(evidence.summary.trim())
          ? "선택하면 근거 서랍에서 관측 기록과 출처를 볼 수 있어요."
          : stripReviewNotice(evidence.summary),
  };
  if (onOpen)
    return (
      <button
        {...props}
        type="button"
        aria-label={`근거 ${resolvedNumber} ${expanded ? "접기" : "열기"}, ${label}: ${title}`}
        aria-controls={`evidence-${evidence.id}`}
        aria-expanded={expanded}
        onClick={(event) => onOpen(evidence.id, event.currentTarget)}
      >
        {content}
      </button>
    );
  return (
    <a
      {...props}
      href={`#evidence-${evidence.id}`}
      aria-label={`근거 ${resolvedNumber}, ${label}: ${title}`}
      // 독립 근거 링크는 앵커로 이동하면서 해당 카드를 펼친다.
      onClick={() => {
        const card = document.getElementById(`evidence-${evidence.id}`);
        if (card instanceof HTMLDetailsElement) card.open = true;
      }}
    >
      {content}
    </a>
  );
}
