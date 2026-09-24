// 계약 근거의 출처와 수집 시점을 짧게 펼쳐 볼 수 있게 한다.
import type { Evidence } from "@crowdcast/contracts/types";
import { Info } from "lucide-react";
import { ComponentState, type ComponentStatus } from "./component-state";

// 출처가 없으면 비어 있음을 알리고 링크는 계약이 제공한 것만 연다.
export function SourceTip({
  evidence,
  status = "ready",
}: {
  evidence?: Evidence | null;
  status?: ComponentStatus;
}) {
  if (status !== "ready" || !evidence?.source)
    return (
      <ComponentState
        name="출처"
        status={status === "ready" ? "empty" : status}
      />
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
