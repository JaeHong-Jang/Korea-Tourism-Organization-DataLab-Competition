// 실제 계산된 인사이트만 중요도 순으로 보여 주고 서식4 문장을 복사한다.
import type { Insight } from "@crowdcast/contracts/types";
import { useState } from "react";
import { PetAvatar } from "../../components/pets";
import type { ContractState } from "../../lib/validation/use-contract";

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
    <article className="insight-result" data-insight={insight.key}>
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
      <details className="source-tip">
        <summary>ⓘ 근거</summary>
        <ul>
          {source.map((item) => (
            <li key={item.id}>
              {item.title}
              {item.source?.accessUrl && (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={item.source.accessUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    원문 보기
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
      <button type="button" onClick={copy}>
        서식4용 문장 복사
      </button>
      {copied && <span role="status">복사됨</span>}
    </article>
  );
}

// 각 카드의 대기·빈 값·오류에는 펫과 다시 확인할 행동을 붙인다.
function InsightCard({
  insightKey,
  state,
}: {
  insightKey: "I1" | "I2";
  state: ContractState<Insight>;
}) {
  if (state.status === "ready" && state.value)
    return <InsightResult insight={state.value} />;
  const status = state.status === "ready" ? "empty" : state.status;
  const message =
    status === "loading"
      ? "자료를 불러오는 중이에요."
      : status === "error"
        ? "자료 형식을 확인할 수 없어요."
        : "인사이트는 데이터 수집이 끝나면 채워져요 · 9/27";
  return (
    <article
      className="insight-result insight-result--state"
      data-insight={insightKey}
    >
      <span>{insightKey}</span>
      <h3>{insightKey} 자료 확인</h3>
      <div role={status === "error" ? "alert" : "status"}>
        <PetAvatar
          agentId={status === "error" ? "source-check" : "local-guide"}
          state={
            status === "error"
              ? "error"
              : status === "loading"
                ? "working"
                : "idle"
          }
          size={96}
        />
        <p>{message}</p>
      </div>
      <button type="button" onClick={() => window.location.reload()}>
        자료 다시 확인
      </button>
    </article>
  );
}

// I1과 I2의 요청 상태를 각각 그려 확인된 결과를 계속 보여 준다.
export function InsightResults({
  first,
  second,
}: {
  first: ContractState<Insight>;
  second: ContractState<Insight>;
}) {
  return (
    <div className="insight-results">
      <InsightCard insightKey="I1" state={first} />
      <InsightCard insightKey="I2" state={second} />
    </div>
  );
}
