// 예보 한 건의 계산 경로와 연결된 근거를 같은 화면에서 탐색한다.
import type { ForecastReport } from "@crowdcast/contracts/types";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { evidenceTitle } from "./evidence-labels";
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

// 위쪽은 "이 예보의 근거"(왼쪽)와 옆 칸(오른쪽, 이 예보에 연결된 근거)으로 나눈다.
export function EvidenceTop({
  head,
  aside,
  children,
}: {
  head?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={aside ? "evidence-top has-aside" : "evidence-top"}>
      <section
        className="evidence-top__main evidence-col evidence-col--forecast"
        aria-labelledby="forecast-evidence-title"
      >
        <header className="evidence-col__head">
          <span className="evidence-col__tag">선택한 예보</span>
          <h2 id="forecast-evidence-title">이 예보의 근거</h2>
        </header>
        {head}
        {children}
      </section>
      {aside}
    </div>
  );
}

// 발행 기록이 바뀔 때 상위 key로 탐색 상태를 초기화한다.
export function SnapshotEvidence({
  report,
  head,
}: {
  report: ForecastReport;
  head?: ReactNode;
}) {
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
  const linked = (
    <section
      className="evidence-col evidence-col--forecast evidence-linked"
      aria-labelledby="linked-evidence-title"
    >
      <header className="evidence-col__head">
        <span className="evidence-col__tag">선택한 예보</span>
        <h2 id="linked-evidence-title">
          이 예보에 연결된 근거 <small>{items.length}개</small>
        </h2>
      </header>
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
    </section>
  );
  return (
    <article className="snapshot-evidence" aria-label="선택한 발행 예보의 근거">
      <EvidenceTop head={head} aside={linked}>
        <header className="snapshot-evidence__summary">
          <div>
            <span className="snapshot-evidence__eyebrow">발행 당시 기록</span>
            <h3>{event.name}</h3>
            <p>
              {event.startsAt.slice(0, 10)}–{event.endsAt.slice(0, 10)} ·{" "}
              {event.venue.name} · {event.type}
            </p>
            <p className="snapshot-evidence__meta">
              {publishedLabel(report.publishedAt)} 발행 · 기준일 {forecast.asOf}{" "}
              · 모델 {forecast.modelVersion}
            </p>
          </div>
          <nav className="snapshot-evidence__links" aria-label="관련 화면">
            <Link to={`/f/${encodeURIComponent(report.forecastId)}`}>
              예보서 →
            </Link>
          </nav>
        </header>
        <ForecastPath
          report={report}
          selected={stage}
          onSelect={(value) => {
            setStage(value);
            setSelectedId(null);
          }}
        />
      </EvidenceTop>
    </article>
  );
}
