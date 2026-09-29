// 규모 등급의 고정 경계와 적용 표본을 출처 탭에 표시한다.
import type { Insight } from "@crowdcast/contracts/types";
import { dailyScale, scaleName, scaleRange } from "./daily-scale-data";
import { forecastPeople } from "./forecast-people-data";

// 표시 구간의 목적과 실제 적용 건수를 함께 기록한다.
export function DailyScaleSource({ insight }: { insight: Insight }) {
  if (insight.key !== "I2") return null;
  const rows = forecastPeople(insight);
  const scale = rows && dailyScale(insight, rows);
  if (!scale) return null;
  return (
    <section aria-label="규모 등급 산정 근거">
      <h4>일평균 규모 등급 · 1만·2만 명 고정 기준</h4>
      <p>
        대상: {insight.period.from} ~ {insight.period.to} · {scale.sampleSize}개
        예보의 일평균 중앙값(명/일).
      </p>
      <p>
        방문 규모를 쉽게 읽고 기간별로 같은 기준을 적용하기 위한 표시
        구간입니다. 1만 명은 2등급, 2만 명은 3등급에 포함하며 검색이나 표본 수에
        따라 경계를 바꾸지 않습니다.
      </p>
      <ul>
        {scale.bands.map((band) => (
          <li key={band.grade}>
            {scaleName(band.grade)} · {band.grade}등급: {scaleRange(band)} ·{" "}
            {band.count}개 행사
          </li>
        ))}
      </ul>
      <p>규모 등급은 안전·위험 판정이나 예측 정확도를 뜻하지 않습니다.</p>
    </section>
  );
}
