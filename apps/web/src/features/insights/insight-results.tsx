// I1의 안전 검토 사례와 I2의 하루 평균 방문객을 핵심 내용만 보여 준다.
import type { Insight } from "@crowdcast/contracts/types";
import type { ContractState } from "../../lib/validation/use-contract";
import { InsightComparison } from "./insight-comparison";
import { InsightLevels } from "./insight-levels";

export { headlineValue } from "./insight-data";

const TITLES = {
  I1: "과거 행사 주최측 발표·관측값 비교",
  I2: "행사별 하루 평균 방문객",
};

// 연결된 근거가 있는 응답만 표시하고 수집 진단과 등급 합계는 본문에서 제외한다.
function InsightResult({ insight }: { insight: Insight }) {
  const sources = insight.evidenceIds.map((id) =>
    insight.evidence.find((item) => item.id === id),
  );
  if (!sources.length || sources.some((item) => !item))
    return <p role="alert">인사이트 근거를 확인할 수 없습니다.</p>;
  const first = insight.key === "I1";
  return (
    <article
      className="insight-result insights-card insights-focused"
      data-insight={insight.key}
      id={`insight-${insight.key.toLowerCase()}`}
      aria-labelledby={`insight-${insight.key}-title`}
    >
      <header className="insights-focused-heading">
        <div>
          <h2 id={`insight-${insight.key}-title`}>
            {first ? TITLES.I1 : TITLES.I2}
          </h2>
          {!first && (
            <p
              className="insights-model-summary"
              data-evidence-ids={insight.evidenceIds.join(" ")}
            >
              과거 방문객의 행사 유형·규모별 중앙값과 이전 개최 기록으로
              일평균을 추정합니다.
            </p>
          )}
        </div>
        <span className="insights-caption">
          {first
            ? "2020–2026"
            : `${insight.period.from} — ${insight.period.to}`}
        </span>
      </header>
      {first ? (
        <InsightComparison insight={insight} />
      ) : (
        <InsightLevels insight={insight} />
      )}
    </article>
  );
}

// 오류와 빈 자료를 구분하고 실패한 지표만 다시 요청한다.
function InsightCard({
  insightKey,
  state,
  retry,
}: {
  insightKey: "I1" | "I2";
  state: ContractState<Insight>;
  retry?: () => void;
}) {
  if (state.status === "ready" && state.value)
    return <InsightResult insight={state.value} />;
  const loading = state.status === "loading";
  return (
    <article
      className="insight-result insights-card insight-result--state"
      data-insight={insightKey}
    >
      <h2>{TITLES[insightKey]}</h2>
      <p role={state.status === "error" ? "alert" : "status"}>
        {loading
          ? "자료를 불러오는 중입니다."
          : state.status === "error"
            ? "자료를 불러오지 못했어요. 다시 시도해 주세요."
            : "아직 발행된 자료가 없습니다."}
      </p>
      {!loading && (
        <button
          type="button"
          onClick={retry ?? (() => window.location.reload())}
        >
          자료 다시 확인
        </button>
      )}
    </article>
  );
}

// 선택한 지표만 표시하고 다른 지표의 오류를 전파하지 않는다.
export function InsightResults({
  first,
  second,
  activeKey,
  retryFirst,
  retrySecond,
}: {
  first: ContractState<Insight>;
  second: ContractState<Insight>;
  activeKey?: "I1" | "I2";
  retryFirst?: () => void;
  retrySecond?: () => void;
}) {
  return (
    <div
      className={`insight-results${activeKey ? " insights-results-single" : ""}`}
    >
      {(!activeKey || activeKey === "I1") && (
        <InsightCard insightKey="I1" state={first} retry={retryFirst} />
      )}
      {(!activeKey || activeKey === "I2") && (
        <InsightCard insightKey="I2" state={second} retry={retrySecond} />
      )}
    </div>
  );
}
