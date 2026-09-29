// 선택한 근거의 값·단위·관측 시점·출처를 발행 당시 기록으로 보여 준다.
import type { Evidence, ForecastReport } from "@crowdcast/contracts/types";
import { formatSnapshotNumber } from "../../lib/format";
import { evidenceTitle, readableAssumption } from "./evidence-labels";
import {
  evidenceObservation,
  evidencePayload,
  evidenceRole,
  roleLabels,
} from "./forecast-evidence-data";
import { sourceUrl } from "./graph-data";

// 기록된 값만 보여 주고 출처 없는 근거에는 링크를 만들지 않는다.
export function SnapshotEvidenceDetail({
  report,
  evidence,
}: {
  report: ForecastReport;
  evidence: Evidence;
}) {
  const observation = evidenceObservation(report, evidence);
  const assumption = report.forecast.assumptions.find(
    (item) => item.id === evidence.assumptionId,
  );
  const role = evidenceRole(report, evidence);
  const payload = evidencePayload(evidence);
  const url = sourceUrl(evidence.source?.accessUrl ?? undefined);
  const available = observation?.availableAt ?? evidence.availableAt;
  const reasons = report.forecast.judgment.reasons.flatMap((item) =>
    (item.evidenceId === evidence.id ||
      (evidence.ruleId && item.ruleId === evidence.ruleId)) &&
    typeof item.text === "string" &&
    typeof item.kind === "string" &&
    typeof item.ruleId === "string"
      ? [{ ruleId: item.ruleId, text: item.text, kind: item.kind }]
      : [],
  );
  const primary =
    payload?.primaryModel === "simple"
      ? "단순 모형"
      : payload?.primaryModel === "lightgbm"
        ? "LightGBM"
        : null;
  return (
    <aside
      className="snapshot-evidence__detail"
      aria-label="선택한 근거 상세"
      aria-live="polite"
    >
      <span className="snapshot-evidence__role">{roleLabels[role]}</span>
      <h3>{evidenceTitle(evidence)}</h3>
      {role === "unconfirmed" && (
        <p className="snapshot-evidence__hint">계산에 쓰였는지 기록 없음</p>
      )}
      {reasons.map((reason) => (
        <p key={reason.ruleId}>
          {reason.kind} 기준 · {reason.text}
        </p>
      ))}
      <dl>
        {observation && (
          <>
            <dt>관측값</dt>
            <dd>
              {formatSnapshotNumber(observation.value)} {observation.unit}
            </dd>
            <dt>관측 지역</dt>
            <dd>시군구 코드 {observation.sigunguCode}</dd>
            <dt>관측일</dt>
            <dd>{observation.observedAt}</dd>
          </>
        )}
        {assumption && (
          <>
            <dt>가정값</dt>
            <dd>
              {formatSnapshotNumber(assumption.value)} {assumption.unit} ·{" "}
              {assumption.basis}
            </dd>
            <dt>가정 범위</dt>
            <dd>
              {formatSnapshotNumber(assumption.low)}–
              {formatSnapshotNumber(assumption.high)} {assumption.unit}
            </dd>
            <dt>설명</dt>
            <dd>{readableAssumption(assumption.note)}</dd>
          </>
        )}
        {role === "model" && (
          <>
            <dt>모델</dt>
            <dd>
              {primary ? `${primary} · ` : ""}
              {evidence.modelVersion}
            </dd>
            <dt>학습 기간</dt>
            <dd>
              {report.forecast.predictionRun.trainRange.from}–
              {report.forecast.predictionRun.trainRange.to}
            </dd>
          </>
        )}
        {evidence.period && (
          <>
            <dt>자료 기간</dt>
            <dd>
              {evidence.period.from}–{evidence.period.to}
            </dd>
          </>
        )}
        {available && (
          <>
            <dt>이용 가능일</dt>
            <dd>{available}</dd>
          </>
        )}
        {evidence.source && (
          <>
            <dt>출처</dt>
            <dd>
              {evidence.source.title} · {evidence.source.publisher}
            </dd>
          </>
        )}
      </dl>
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          출처 원문 열기 ↗
        </a>
      )}
    </aside>
  );
}
