// 순간 최대 예보를 행안부 매뉴얼의 면적당 수용 권고(1㎡당 4인 이하)와 맞대어 필요한 면적과 ㎡당 인원을 보여 준다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { useId, useState } from "react";
import { reportNumber } from "./report-content";

// 행정안전부 지역축제장 안전관리 매뉴얼(2024) — 순수점유면적 1㎡당 4인 이하 권고.
export const PER_SQUARE_METER = 4;
// 국제 규격 축구장(105m × 68m) 넓이 — 면적을 떠올리기 쉽게 비교만 한다.
const PITCH = 7140;

// 넣은 면적으로 ㎡당 인원을 소수 한 자리로 계산한다(면적이 없거나 0 이하면 계산하지 않음).
export function density(people: number | null, area: number) {
  if (people === null || !(area > 0)) return null;
  return Math.round((people / area) * 10) / 10;
}

export function ReportDensity({ report }: { report: ForecastReport }) {
  const peak = report.forecast.peakConcurrent;
  const [area, setArea] = useState("");
  const field = useId();
  if (peak.p90 === null) return null;
  const need = Math.ceil(peak.p90 / PER_SQUARE_METER);
  const entered = Number(area.replaceAll(",", ""));
  const high = density(peak.p90, entered);
  const middle = density(peak.p50, entered);
  return (
    <section
      className="report-section report-density"
      aria-labelledby={`${field}-title`}
    >
      <h3 id={`${field}-title`}>면적당 인원 확인</h3>
      <p>
        순간 최대 p90 {reportNumber(peak.p90)}명을 1㎡당 {PER_SQUARE_METER}인
        이하로 받으려면 사람이 다닐 수 있는 순수점유면적이 최소{" "}
        <strong>{need.toLocaleString("ko-KR")}㎡</strong>(축구장 약{" "}
        {Math.max(0.1, Math.round((need / PITCH) * 10) / 10).toLocaleString(
          "ko-KR",
        )}
        개) 필요해요.
      </p>
      <label className="report-density__field" htmlFor={field}>
        행사장 순수점유면적(㎡)
        <input
          id={field}
          inputMode="numeric"
          placeholder="예: 45380"
          value={area}
          onChange={(event) => setArea(event.target.value)}
        />
      </label>
      <p className="report-density__hint">
        화단·연못·무대·부스 자리는 빼고 넣어 주세요. 면적당 상한은
        병목·계단·경사를 보고 지자체가 정해요.
      </p>
      {high !== null && middle !== null && (
        <p
          className={`report-density__result${high > PER_SQUARE_METER ? " report-density__result--over" : ""}`}
          role={high > PER_SQUARE_METER ? "alert" : "status"}
        >
          ㎡당 p50 {middle}명 · p90 {high}명 —{" "}
          {high > PER_SQUARE_METER
            ? `권고(${PER_SQUARE_METER}인/㎡)를 넘어요. 동선 분리·입장 조절·면적 확대를 검토해 주세요.`
            : `권고(${PER_SQUARE_METER}인/㎡) 안이에요. 병목 구간은 따로 확인해 주세요.`}
        </p>
      )}
      <small>
        근거: 행정안전부 지역축제장 안전관리 매뉴얼(2024) — 동시 최대 수용인원 =
        순수점유면적 × 면적당 최대 수용인원
      </small>
    </section>
  );
}
