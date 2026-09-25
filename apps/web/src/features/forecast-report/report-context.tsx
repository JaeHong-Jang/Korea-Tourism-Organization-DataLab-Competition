// 유사 행사와 평시, 구성·시간대 자료를 있을 때만 보여 준다.
// biome-ignore-all lint/a11y/noNoninteractiveTabindex: 표의 가로 스크롤 영역에 키보드 초점을 준다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { EvidenceChip } from "../../components/common/evidence-chip";
import { formatSnapshotQuantity } from "../../lib/format";
import type { OpenEvidence } from "./report-claims";
import { reportNumber } from "./report-content";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

// 비교 단위와 정성 비교 성격을 명시해 예측값과 직접 빼지 않는다.
export function ReportContext({
  report,
  onOpen,
}: {
  report: ForecastReport;
  onOpen: OpenEvidence;
}) {
  const evidence = new Map(report.evidence.map((item) => [item.id, item]));
  return (
    <section className="report-section report-context" aria-label="비교와 가정">
      <div>
        <h3>유사 행사</h3>
        {!report.similar.length && <p>유사 행사 자료 없음</p>}
        {report.similar.map((item) => (
          <article className="report-context-card" key={item.eventId}>
            <h4>
              {item.name} · {item.year}
            </h4>
            <p>
              정성 비교 ·{" "}
              {item.unitsComparable
                ? "동일 단위"
                : "단위가 달라 직접 비교하지 않음"}
            </p>
            <p>
              실측{" "}
              {item.measured
                ? formatSnapshotQuantity(item.measured)
                : "자료 없음"}
            </p>
            <p>
              발표{" "}
              {item.announced
                ? formatSnapshotQuantity(item.announced)
                : "자료 없음"}
            </p>
            {evidence.get(item.evidenceId) && (
              <EvidenceChip
                evidence={evidence.get(item.evidenceId)}
                evidenceOrder={report.evidence}
                onOpen={onOpen}
                hideProbability={report.forecast.judgment.basis === "구간"}
              />
            )}
          </article>
        ))}
      </div>
      <div>
        <h3>개최지 평시</h3>
        {!report.baseline && <p>평시 자료 없음</p>}
        {report.baseline && (
          <>
            <p>
              {report.baseline.sigunguName} · {report.baseline.period.from} ~{" "}
              {report.baseline.period.to}
            </p>
            {/* 좁은 화면에서도 요일별 표를 키보드로 끝까지 읽게 한다. */}
            <section
              className="report-table-scroll"
              aria-label="요일별 평시 방문객 표, 좌우로 스크롤"
              tabIndex={0}
            >
              <table>
                <caption>요일별 평시 방문객 · 명/일</caption>
                <thead>
                  <tr>
                    <th scope="col">요일</th>
                    <th scope="col">지역</th>
                    <th scope="col">외지</th>
                    <th scope="col">외국</th>
                  </tr>
                </thead>
                <tbody>
                  {report.baseline.weekdayMean.map((day) => (
                    <tr key={day.weekday}>
                      <th scope="row">{weekdays[day.weekday]}</th>
                      <td>{reportNumber(day.local)}</td>
                      <td>{reportNumber(day.nonlocal)}</td>
                      <td>{reportNumber(day.foreign)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            {evidence.get(report.baseline.evidenceId) && (
              <EvidenceChip
                evidence={evidence.get(report.baseline.evidenceId)}
                evidenceOrder={report.evidence}
                onOpen={onOpen}
                hideProbability={report.forecast.judgment.basis === "구간"}
              />
            )}
          </>
        )}
      </div>
      {report.forecast.composition && (
        <div>
          <h3>
            방문객 구성 <small>가정</small>
          </h3>
          <p>
            지역 {reportNumber(report.forecast.composition.local)} · 외지{" "}
            {reportNumber(report.forecast.composition.nonlocal)} · 외국{" "}
            {reportNumber(report.forecast.composition.foreign)}
          </p>
          {evidence.get(report.forecast.composition.evidenceId) && (
            <EvidenceChip
              evidence={evidence.get(report.forecast.composition.evidenceId)}
              evidenceOrder={report.evidence}
              onOpen={onOpen}
              hideProbability={report.forecast.judgment.basis === "구간"}
            />
          )}
        </div>
      )}
      {report.forecast.hourlyProfile.length > 0 && (
        <div>
          <h3>
            시간대 곡선 <small>가정</small>
          </h3>
          <div className="report-hourly">
            {report.forecast.hourlyProfile.map((point) => (
              <div key={point.hour}>
                <span>{reportNumber(point.hour)}시</span>
                <div className="report-hourly__track">
                  <span style={{ width: `${point.share * 100}%` }} />
                </div>
                <span>{reportNumber(point.share)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
