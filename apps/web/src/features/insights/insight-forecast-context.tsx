// 저장 예보의 기준일·학습 기간·검증 상태를 행사 개최 일정과 분리한다.
import type { Insight } from "@crowdcast/contracts/types";
import { forecastObservationPeriod, insightEvidence } from "./insight-data";

// 근거에 없는 날짜는 임의로 계산하지 않고 확인 필요로 남긴다.
function period(value: unknown): string {
  if (!value || typeof value !== "object") return "확인 필요";
  const row = value as Record<string, unknown>;
  return typeof row.from === "string" &&
    typeof row.to === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.to) &&
    row.from <= row.to
    ? `${row.from} ~ ${row.to}`
    : "확인 필요";
}

// 상태별 예보 건수의 합이 분석 표본과 맞을 때만 검증 상태를 공개한다.
export function InsightForecastContext({ insight }: { insight: Insight }) {
  const data = insightEvidence(insight).find((row) => row.modelVerdictCounts);
  if (!data?.modelVerdictCounts || typeof data.modelVerdictCounts !== "object")
    return null;
  const entries = Object.entries(data.modelVerdictCounts);
  if (
    !entries.length ||
    entries.some(([, count]) => !Number.isInteger(count) || count < 0) ||
    entries.reduce((sum, [, count]) => sum + count, 0) !== insight.sampleSize
  )
    return null;
  return (
    <section className="insights-section-stack">
      <h4>
        모델 검증 상태:{" "}
        {entries.map(([label, count]) => `${label} ${count}건`).join(" · ")}
      </h4>
      <dl className="insights-meta">
        <div>
          <dt>모델 학습 자료 기간</dt>
          <dd>{period(data.modelTrainingPeriod)}</dd>
        </div>
        <div>
          <dt>예보에 인용된 지역 방문 자료</dt>
          <dd>{forecastObservationPeriod(insight) ?? "확인 필요"}</dd>
        </div>
        <div>
          <dt>개별 예보의 기준일 범위</dt>
          <dd>{period(data.forecastAsOfPeriod)}</dd>
        </div>
      </dl>
      <p>
        미래 날짜는 예보할 행사의 개최 일정이에요. 미검증 모델의 결과는 정확도가
        확인된 예보로 해석할 수 없어요.
      </p>
    </section>
  );
}
