// 예보 한 건의 계산 경로와 연결된 근거를 같은 화면에서 탐색한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { useState } from "react";
import { Link } from "react-router-dom";
import { evidenceTitle, readableOodReason } from "./evidence-labels";
import {
  type EvidenceStage,
  evidenceAtStage,
  evidenceRole,
  publishedLabel,
  roleLabels,
  snapshotEvidence,
} from "./forecast-evidence-data";
import { ForecastPath } from "./forecast-path";
import { SnapshotEvidenceDetail } from "./snapshot-evidence-detail";

// 발행 기록이 바뀔 때 상위 key로 탐색 상태를 초기화한다.
export function SnapshotEvidence({ report }: { report: ForecastReport }) {
  const [stage, setStage] = useState<EvidenceStage>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const evidence = snapshotEvidence(report).sort(
    (a, b) =>
      Number(evidenceRole(report, b) === "model") -
      Number(evidenceRole(report, a) === "model"),
  );
  const items = evidence.filter((item) => evidenceAtStage(report, item, stage));
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const { forecast, event } = report;
  const missingAssumptions = forecast.peakConcurrent.assumptionIds.filter(
    (id) => !forecast.assumptions.some((item) => item.id === id),
  );
  return (
    <article className="snapshot-evidence" aria-label="선택한 발행 예보의 근거">
      <header className="snapshot-evidence__summary">
        <div>
          <span className="snapshot-evidence__eyebrow">발행 당시 기록</span>
          <h2>{event.name}</h2>
          <p>
            {event.startsAt.slice(0, 10)}–{event.endsAt.slice(0, 10)} ·{" "}
            {event.venue.name} · {event.type}
          </p>
          <p>{publishedLabel(report.publishedAt)} 발행 · 수정 불가</p>
        </div>
        <Link to={`/f/${encodeURIComponent(report.forecastId)}`}>
          이 예보서 열기 →
        </Link>
        <dl>
          <div>
            <dt>예측 기준일</dt>
            <dd>{forecast.asOf}</dd>
          </div>
          <div>
            <dt>모델 버전</dt>
            <dd>{forecast.modelVersion}</dd>
          </div>
          <div>
            <dt>학습 기간</dt>
            <dd>
              {forecast.predictionRun.trainRange.from}–
              {forecast.predictionRun.trainRange.to}
            </dd>
          </div>
          <div>
            <dt>모델 검증 상태</dt>
            <dd>
              {forecast.predictionRun.modelVerdict ?? "발행본에 기록 없음"}
            </dd>
          </div>
        </dl>
      </header>
      <ForecastPath
        report={report}
        selected={stage}
        onSelect={(value) => {
          setStage(value);
          setSelectedId(null);
        }}
      />
      {(forecast.ood ||
        forecast.oodReasons.length > 0 ||
        missingAssumptions.length > 0) && (
        <section
          className="snapshot-evidence__notice"
          aria-label="이 예보의 한계"
        >
          <h3>확인할 점</h3>
          {forecast.ood && <p>학습 범위 밖 입력이 포함되어 있어요.</p>}
          {forecast.oodReasons.map((reason) => (
            <p key={reason}>{readableOodReason(reason)}</p>
          ))}
          {missingAssumptions.length > 0 && (
            <p>
              연결된 환산 가정 중 상세 값이 없는 항목이{" "}
              {missingAssumptions.length}개 있어요.
            </p>
          )}
        </section>
      )}
      <div className="snapshot-evidence__heading">
        <h2>
          연결된 근거 <small>{items.length}개</small>
        </h2>
      </div>
      <p>
        ‘환산에 사용’과 ‘판정에 사용’은 저장된 연결을 확인했어요. ‘사용 확인
        필요’는 실제 사용 여부가 기록되지 않은 자료예요.
      </p>
      {items.length ? (
        <div className="snapshot-evidence__explorer">
          <ul aria-label="발행 예보 근거 목록">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={selected?.id === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="snapshot-evidence__role">
                    {roleLabels[evidenceRole(report, item)]}
                  </span>
                  <strong>{evidenceTitle(item)}</strong>
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <SnapshotEvidenceDetail report={report} evidence={selected} />
          )}
        </div>
      ) : (
        <p role="status">이 단계에 연결된 근거 기록이 없어요.</p>
      )}
      <p className="snapshot-evidence__note">
        참고용 — 담당자 검토 필수 · 근거 연결 여부는 예측 정확도를 뜻하지
        않아요.
      </p>
    </article>
  );
}
