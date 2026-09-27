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

// 해석할 수 없는 원문은 접어서 보존하고 출처 없는 근거에는 링크를 만들지 않는다.
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
        <p>
          발행 예보에 첨부된 자료예요. 계산에 직접 사용했는지는 이 기록만으로
          확인할 수 없어요.
        </p>
      )}
      {role === "factor" && (
        <p>
          모델이 남긴 요인 설명에 연결되어 있어요. 영향의 크기는 이 연결만으로
          판단하지 않아요.
        </p>
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
        <dt>자료 기간</dt>
        <dd>
          {evidence.period
            ? `${evidence.period.from}–${evidence.period.to}`
            : "기간 기록 없음"}
        </dd>
        <dt>이용 가능일</dt>
        <dd>
          {observation?.availableAt ?? evidence.availableAt ?? "시점 기록 없음"}
        </dd>
        <dt>예측 기준일</dt>
        <dd>{report.forecast.asOf}</dd>
        <dt>출처</dt>
        <dd>
          {evidence.source
            ? `${evidence.source.title} · ${evidence.source.publisher}`
            : "외부 출처 기록 없음"}
        </dd>
      </dl>
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          출처 원문 열기 ↗
        </a>
      )}
      <details>
        <summary>발행 당시 근거 원문</summary>
        <pre>
          {payload ? JSON.stringify(payload, null, 2) : evidence.summary}
        </pre>
      </details>
    </aside>
  );
}
