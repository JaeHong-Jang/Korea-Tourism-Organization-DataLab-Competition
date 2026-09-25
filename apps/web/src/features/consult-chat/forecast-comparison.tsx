// 세션의 첫 예보와 새 what-if 예보를 조건과 수치로 비교한다.
import { Link } from "react-router-dom";
import { LevelBadge } from "../../components/common/level-badge";
import { Button } from "../../components/ui/button";
import { formatSnapshotNumber } from "../../lib/format";
import { ComparisonRange } from "./comparison-range";
import { formatDraftDate } from "./event-draft-card";
import type { ForecastSnapshot } from "./use-consult-session";

// 원본 초안과 what-if 초안에 실제로 다른 조건만 강조한다.
function conditionRows(original: ForecastSnapshot, changed: ForecastSnapshot) {
  const entries = [
    {
      label: "일정",
      before: original.draft?.startsAt,
      after: changed.draft?.startsAt,
      date: true,
    },
    {
      label: "시간대",
      before: original.draft?.timeOfDay,
      after: changed.draft?.timeOfDay,
      date: false,
    },
    {
      label: "요금",
      before: original.draft?.fee,
      after: changed.draft?.fee,
      date: false,
    },
  ];
  return entries.map((entry) => ({
    label: entry.label,
    before: entry.before
      ? entry.date
        ? formatDraftDate(entry.before)
        : entry.before
      : "확인 필요",
    after: entry.after
      ? entry.date
        ? formatDraftDate(entry.after)
        : entry.after
      : "확인 필요",
    changed: entry.before !== entry.after,
  }));
}

// 원본 JSON의 중앙값과 범위는 단위와 함께 축약 없이 표시한다.
function Metric({
  quantity,
}: {
  quantity:
    | ForecastSnapshot["card"]["peakConcurrent"]
    | ForecastSnapshot["card"]["dailyMean"];
}) {
  return (
    <div className="consult-compare__metric">
      <span>{quantity.name}</span>
      <strong>
        {formatSnapshotNumber(quantity.p50)}
        {quantity.unit}
      </strong>
      <small>
        p10 {formatSnapshotNumber(quantity.p10)} · p90{" "}
        {formatSnapshotNumber(quantity.p90)}
        {quantity.unit}
        {quantity.estimated ? " · 추정 산식 기반" : ""}
      </small>
    </div>
  );
}

// 예보 ID가 다른 두 카드만 비교하고 발행된 바뀐 예보서로 이동한다.
export function ForecastComparison({
  original,
  changed,
  forecastId,
}: {
  original: ForecastSnapshot;
  changed: ForecastSnapshot;
  forecastId: string | null;
}) {
  const rows = conditionRows(original, changed);
  const hasChangedCondition = rows.some((row) => row.changed);
  return (
    <section
      className="consult-compare"
      aria-label="원래 예보와 바뀐 예보 비교"
    >
      <div className="consult-compare__columns">
        {[original, changed].map((snapshot, index) => (
          <section
            className={`consult-compare__card${index === 1 ? " consult-compare__card--changed" : ""}`}
            key={snapshot.card.id}
            aria-label={index === 0 ? "원래 예보" : "바뀐 예보"}
          >
            <h3>{index === 0 ? "원래 예보" : "바뀐 예보"}</h3>
            <dl className="consult-compare__conditions">
              {rows.map((row) => (
                <div
                  className={
                    index === 1 && row.changed
                      ? "consult-compare__condition--changed"
                      : undefined
                  }
                  key={row.label}
                >
                  <dt>{row.label}</dt>
                  <dd>{index === 0 ? row.before : row.after}</dd>
                </div>
              ))}
            </dl>
            {index === 1 && !hasChangedCondition && (
              <p className="consult-compare__request">
                변경 요청 · {changed.request}
              </p>
            )}
            <LevelBadge
              judgment={snapshot.card.judgment}
              provisional={index === 1 && forecastId !== changed.card.id}
            />
            <Metric quantity={snapshot.card.peakConcurrent} />
            <Metric quantity={snapshot.card.dailyMean} />
            <p className="consult-muted">
              예보 모델 {snapshot.card.modelVersion} · 기준일{" "}
              {snapshot.card.asOf}
            </p>
          </section>
        ))}
      </div>
      <ComparisonRange
        title="순간 최대"
        original={original.card.peakConcurrent}
        changed={changed.card.peakConcurrent}
      />
      <ComparisonRange
        title="일평균 방문객"
        original={original.card.dailyMean}
        changed={changed.card.dailyMean}
      />
      <p className="consult-muted">
        참고용 — 담당자 검토 필수 · 추정 산식 기반
      </p>
      {forecastId === changed.card.id ? (
        <Button asChild variant="outline">
          <Link to={`/f/${encodeURIComponent(changed.card.id)}`}>
            바뀐 예보서 열기
          </Link>
        </Button>
      ) : (
        <Button variant="outline" disabled>
          바뀐 예보서 열기
        </Button>
      )}
    </section>
  );
}
