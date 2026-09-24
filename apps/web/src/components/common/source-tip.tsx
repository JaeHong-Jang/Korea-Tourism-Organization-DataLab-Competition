// 계약 근거와 운영 평가의 확인 정보를 짧게 펼쳐 볼 수 있게 한다.
import type { Evidence, OpsStatus } from "@crowdcast/contracts/types";
import { Info } from "lucide-react";
import { formatDate } from "../../lib/format";
import { ComponentState, type ComponentStatus } from "./component-state";

// 정보가 없으면 빈 상태를 알리고 링크는 계약이 제공한 것만 연다.
export function SourceTip({
  evidence,
  evaluation,
  status = "ready",
}: {
  evidence?: Evidence | null;
  evaluation?: OpsStatus["evals"];
  status?: ComponentStatus;
}) {
  if (status !== "ready" || (!evidence && !evaluation))
    return (
      <ComponentState
        name="출처"
        status={status === "ready" ? "empty" : status}
      />
    );
  // 평가 수치는 근거 카드 대신 계약의 평가 묶음과 실행 시각을 펼친다.
  if (evaluation)
    return (
      <details className="source-tip">
        <summary aria-label="평가 출처 확인">
          <Info size={16} aria-hidden="true" /> 출처
        </summary>
        <p>평가 묶음 {evaluation.suite}</p>
        <p>실행 시각 {formatDate(evaluation.runAt)}</p>
      </details>
    );
  if (!evidence) return null;

  // 출처 노드가 없는 모델·가정은 해당 근거 제목과 요약을 직접 보여 준다.
  if (!evidence.source)
    return (
      <details className="source-tip">
        <summary aria-label={`근거: ${evidence.title}`}>
          <Info size={16} aria-hidden="true" /> 근거
        </summary>
        <p>{evidence.summary}</p>
      </details>
    );
  return (
    <details className="source-tip">
      <summary aria-label={`출처: ${evidence.source.title}`}>
        <Info size={16} aria-hidden="true" /> 출처
      </summary>
      <p>
        {evidence.source.publisher} · {evidence.source.title}
      </p>
      {evidence.period && (
        <p>
          {evidence.period.from} ~ {evidence.period.to}
        </p>
      )}
      {evidence.source.accessUrl && (
        <a href={evidence.source.accessUrl} target="_blank" rel="noreferrer">
          원문 보기
        </a>
      )}
    </details>
  );
}
