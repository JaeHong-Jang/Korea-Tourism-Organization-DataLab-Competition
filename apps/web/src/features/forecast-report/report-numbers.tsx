// 순간 최대와 일평균을 예보 JSON의 원래 자릿수로 표시한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { EvidenceChip } from "../../components/common/evidence-chip";
import { evidenceForQuantity } from "../../lib/evidence-for-quantity";
import type { OpenEvidence } from "./report-claims";
import { reportNumber } from "./report-content";
import { SIZE_BIAS_NOTICE, UNVERIFIED_NOTICE } from "./report-judgment";

// 대표값과 p10·p50·p90을 직접 표시하고 근거를 숫자 옆에 둔다.
export function ReportNumbers({
  report,
  onOpen,
}: {
  report: ForecastReport;
  onOpen: OpenEvidence;
}) {
  const peak = report.forecast.peakConcurrent;
  const daily = report.forecast.dailyMean;
  const interval = report.forecast.judgment.basis === "구간";
  const quantities = [peak, daily];
  return (
    <section className="report-section" aria-labelledby="report-numbers-title">
      <h3 id="report-numbers-title">핵심 수치</h3>
      {report.forecast.predictionRun.modelVerdict === "미검증" && (
        <div className="report-notices" role="note">
          <p>{UNVERIFIED_NOTICE}</p>
          <p>{SIZE_BIAS_NOTICE}</p>
        </div>
      )}
      <div className="report-number-grid">
        {quantities.map((quantity) => {
          const cited = evidenceForQuantity(
            report.claims,
            report.evidence,
            quantity.id,
          );
          const source = [
            ...cited,
            ...report.evidence.filter(
              (item) =>
                item.quantityIds.includes(quantity.id) &&
                !cited.some((entry) => entry.id === item.id),
            ),
          ];
          return (
            <div className="report-number" key={quantity.id}>
              <span>{quantity.name}</span>
              <strong>
                {reportNumber(quantity.value ?? quantity.p50)}{" "}
                <small>{quantity.unit}</small>
              </strong>
              <p>
                p10 {reportNumber(quantity.p10)} ~ p90{" "}
                {reportNumber(quantity.p90)} {quantity.unit}
              </p>
              <small>
                p50 {reportNumber(quantity.p50)} {quantity.unit} ·{" "}
                {quantity.spatialScope}
                {quantity.estimated ? " · 추정 산식 기반" : ""}
              </small>
              {source.map((item) => (
                <EvidenceChip
                  key={item.id}
                  evidence={item}
                  evidenceOrder={report.evidence}
                  onOpen={onOpen}
                  hideProbability={interval}
                />
              ))}
            </div>
          );
        })}
        <div className="report-number report-number--time">
          <span>피크 시간</span>
          <strong>
            {report.forecast.peakHours
              ? `${report.forecast.peakHours.from} ~ ${report.forecast.peakHours.to}`
              : "자료 없음"}
          </strong>
        </div>
      </div>
      {!interval &&
        report.forecast.probabilities.map((entry) => (
          <p className="report-probability" key={entry.threshold}>
            순간 최대 {reportNumber(entry.threshold)}명 이상일 확률{" "}
            {entry.display}
          </p>
        ))}
      {interval && <p>확률 대신 예측 구간을 표시해요.</p>}
    </section>
  );
}
