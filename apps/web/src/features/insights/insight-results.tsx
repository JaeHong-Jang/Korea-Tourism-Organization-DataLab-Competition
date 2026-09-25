// 실제 계산된 인사이트만 중요도 순으로 보여 주고 서식4 문장을 복사한다.
import type { Insight } from "@crowdcast/contracts/types";
import { useState } from "react";
import type { ContractState } from "../../lib/validation/use-contract";
import { ContractMessage } from "../validation/contract-state";

// 인사이트 한 건의 계약 근거와 표본 기간을 함께 읽게 한다.
function InsightResult({ insight }: { insight: Insight }) {
  const [copied, setCopied] = useState(false);
  const source = insight.evidenceIds
    .map((id) => insight.evidence.find((item) => item.id === id))
    .filter((item) => item != null);
  if (source.length !== insight.evidenceIds.length)
    return <p role="alert">인사이트 근거가 연결되지 않았어요.</p>;
  const sentence = `- ${insight.title}: ${insight.headline.value.toLocaleString("ko-KR")}${insight.headline.unit}, 표본 ${insight.sampleSize.toLocaleString("ko-KR")}건, ${insight.period.from}~${insight.period.to}.`;

  // 복사 성공 뒤에만 완료 안내를 띄운다.
  async function copy() {
    try {
      await navigator.clipboard.writeText(sentence);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <article className="insight-result">
      <span>{insight.key}</span>
      <h3>{insight.title}</h3>
      <strong>
        {insight.headline.value.toLocaleString("ko-KR")}
        {insight.headline.unit}
      </strong>
      <p>{insight.headline.text}</p>
      <small>
        표본 {insight.sampleSize.toLocaleString("ko-KR")}건 ·{" "}
        {insight.period.from} ~ {insight.period.to}
        {insight.comparablePairs != null &&
          ` · 비교 ${insight.comparablePairs}쌍`}
      </small>
      <p>근거: {source.map((item) => item.title).join(" · ")}</p>
      <button type="button" onClick={copy}>
        서식4용 문장 복사
      </button>
      {copied && <span role="status">복사됨</span>}
    </article>
  );
}

// 요청 실패 시 숫자 견본과 복사 버튼을 모두 숨긴다.
export function InsightResults({
  first,
  second,
}: {
  first: ContractState<Insight>;
  second: ContractState<Insight>;
}) {
  if (first.status === "loading" || second.status === "loading")
    return <ContractMessage state={{ status: "loading" }} empty="" />;
  if (first.status === "error" || second.status === "error")
    return <ContractMessage state={{ status: "error" }} empty="" />;
  const insights = [first.value, second.value].filter(
    (item): item is Insight => item != null,
  );
  if (!insights.length)
    return (
      <p className="validation-state">
        인사이트는 데이터 수집이 끝나면 채워져요 · 9/27
      </p>
    );
  return (
    <div className="insight-results">
      {insights.map((item) => (
        <InsightResult key={item.key} insight={item} />
      ))}
    </div>
  );
}
