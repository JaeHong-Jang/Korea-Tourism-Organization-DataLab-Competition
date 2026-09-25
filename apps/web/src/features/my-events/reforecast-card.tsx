// 재예보 응답의 이전·새 발행값과 날씨 근거를 변화 카드에 표시한다.
import type { ReforecastResult } from "@crowdcast/contracts/types";
import { LevelBadge } from "../../components/common/level-badge";
import { formatSnapshotNumber } from "../../lib/format";

const labels = ["소규모", "수립 권고", "수립 대상", "대규모"] as const;

// 판정 등급은 색 외에 아이콘과 글자를 함께 사용한다.
function Level({ value }: { value: number | null }) {
  return value === null ? (
    <span>이전 예보 없음</span>
  ) : (
    <LevelBadge
      judgment={{ level: value, label: labels[value - 1] ?? "소규모" }}
    />
  );
}

// 두 발행 스냅샷의 p50만 그대로 보여 주고 계산 수치를 만들지 않는다.
function QuantityChange({
  title,
  value,
}: {
  title: string;
  value: ReforecastResult["peakConcurrent"] | ReforecastResult["dailyMean"];
}) {
  return (
    <div className="my-events-change-row">
      <dt>{title} 중앙값 전후 비교</dt>
      <dd>
        <span>
          {value.before
            ? formatSnapshotNumber(value.before.p50)
            : "이전 예보 없음"}{" "}
          {value.before ? value.unit : ""}
        </span>
        <span aria-hidden="true">→</span>
        <strong>
          {formatSnapshotNumber(value.after.p50)} {value.unit}
        </strong>
      </dd>
    </div>
  );
}

// 근거 ID는 새 발행 예보서의 해당 근거 카드 앵커로 연결한다.
export function ReforecastCard({ result }: { result: ReforecastResult }) {
  return (
    <div className="my-events-reforecast-card" role="status">
      <h3>재예보 변화</h3>
      <dl>
        <div className="my-events-change-row">
          <dt>안전관리 등급</dt>
          <dd>
            <Level value={result.level.before} />
            <span aria-hidden="true">→</span>
            <Level value={result.level.after} />
          </dd>
        </div>
        <QuantityChange title="순간 최대" value={result.peakConcurrent} />
        <QuantityChange title="일평균" value={result.dailyMean} />
      </dl>
      <p>
        날씨 보정 {result.weather.applied ? "적용" : "미적용"} ·{" "}
        {result.weather.note}
      </p>
      <div className="my-events-evidence-links">
        <span>변화 이유 근거</span>
        {result.weather.evidenceIds.map((id) => (
          <a
            key={id}
            href={`/f/${encodeURIComponent(result.forecastId)}#evidence-${encodeURIComponent(id)}`}
          >
            근거 {id}
          </a>
        ))}
      </div>
      <a href={`/f/${encodeURIComponent(result.forecastId)}`}>새 예보서 보기</a>
    </div>
  );
}
