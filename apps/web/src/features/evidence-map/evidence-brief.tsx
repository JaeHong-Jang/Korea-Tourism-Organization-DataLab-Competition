// 발행 예보서의 근거를 판정 → 받치는 근거·주의할 점 → 문장별 근거 → 출처 순으로 읽게 정리한다.
import masterLabels from "@crowdcast/contracts/jsonld/master-labels.json";
import type { ForecastReport } from "@crowdcast/contracts/types";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  EvidenceChip,
  evidenceKinds,
} from "../../components/common/evidence-chip";
import { evidenceNumber } from "../../components/common/evidence-number";
import { formatPeople, formatRange } from "../../lib/format";
import type { OpenEvidence } from "../forecast-report/report-claims";
import { claimText, orderedClaims } from "../forecast-report/report-content";
import { forecastEvidenceHref } from "../knowledge-graph/forecast-evidence-data";
import {
  cautions,
  readableSummary,
  sourceCards,
} from "./evidence-brief-data";

export { cautions, readableSummary, sourceCards } from "./evidence-brief-data";

// 선택·필터 없이 한 화면에서 위에서 아래로 읽는다(신약개발 근거 비평 화면의 순서).
export function EvidenceBrief({
  report,
  onOpen,
  onViewClaim,
}: {
  report: ForecastReport;
  onOpen: OpenEvidence;
  onViewClaim: (id: string) => void;
}) {
  const { judgment, peakConcurrent } = report.forecast;
  const rule =
    masterLabels.rules[judgment.ruleIds[0] as keyof typeof masterLabels.rules];
  const clause = rule?.clauseId
    ? masterLabels.clauses[rule.clauseId as keyof typeof masterLabels.clauses]
    : null;
  const claims = orderedClaims(report);
  const headline = claims.find((claim) => claim.claimType === "판정");
  const caution = cautions(report);
  const cautionIds = new Set(caution.map((item) => item.id));
  const support = report.evidence.filter((item) => !cautionIds.has(item.id));
  const { cards, datalabClaimCount, claimCount } = sourceCards(report);
  const center = peakConcurrent.p50;
  return (
    <section className="evidence-brief" aria-label="근거 정리">
      <header className="evidence-brief__verdict">
        <span className="evidence-brief__kicker">판정</span>
        <h2>
          {report.event.name} —{" "}
          <span
            className={`evidence-brief__level evidence-brief__level--${judgment.level}`}
          >
            {judgment.label}
          </span>
        </h2>
        {headline && <p>{claimText(headline, report)}</p>}
        <ol className="evidence-brief__chain" aria-label="판정 흐름">
          <li>
            <small>예측 순간 최대</small>
            <strong>
              {center != null ? formatPeople(center) : "추정 없음"}
            </strong>
            {peakConcurrent.p10 != null && peakConcurrent.p90 != null && (
              <span>{formatRange(peakConcurrent.p10, peakConcurrent.p90)}</span>
            )}
          </li>
          <li aria-hidden="true" className="evidence-brief__arrow">
            <ArrowRight size={18} />
          </li>
          <li>
            <small>{rule?.kind ?? "기준"} 기준</small>
            <strong>{rule?.title ?? judgment.ruleIds[0]}</strong>
            <span>{clause?.title ?? "자체 기준"}</span>
          </li>
          <li aria-hidden="true" className="evidence-brief__arrow">
            <ArrowRight size={18} />
          </li>
          <li
            className={`evidence-brief__result evidence-brief__level--${judgment.level}`}
          >
            <small>판정 {judgment.level}단계</small>
            <strong>{judgment.label}</strong>
            <span>{judgment.basis === "구간" ? "구간 기준" : "확률 기준"}</span>
          </li>
        </ol>
      </header>

      <div className="evidence-brief__columns">
        <section
          className="evidence-brief__column evidence-brief__column--support"
          aria-labelledby="evidence-support"
        >
          <h3 id="evidence-support">
            <CheckCircle2 size={18} aria-hidden="true" /> 판정을 받치는 근거{" "}
            <span>{support.length}</span>
          </h3>
          <ul>
            {support.map((item) => {
              const { Icon, label } = evidenceKinds[item.kind];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={(event) => onOpen(item.id, event.currentTarget)}
                  >
                    <span className="evidence-brief__kind">
                      <Icon size={14} aria-hidden="true" />
                      {label} [{evidenceNumber(item.id, report.evidence)}]
                    </span>
                    <strong>{item.title}</strong>
                    <span>{readableSummary(item)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section
          className="evidence-brief__column evidence-brief__column--caution"
          aria-labelledby="evidence-caution"
        >
          <h3 id="evidence-caution">
            <AlertTriangle size={18} aria-hidden="true" /> 주의할 점{" "}
            <span>{caution.length}</span>
          </h3>
          {caution.length ? (
            <ul>
              {caution.map((item) => (
                <li key={item.id}>
                  {item.evidence ? (
                    <button
                      type="button"
                      onClick={(event) => onOpen(item.id, event.currentTarget)}
                    >
                      <span className="evidence-brief__kind">
                        {evidenceKinds[item.evidence.kind].label} [
                        {evidenceNumber(item.id, report.evidence)}]
                      </span>
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                    </button>
                  ) : (
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>따로 표시할 주의점이 없어요.</p>
          )}
        </section>
      </div>

      <section
        className="evidence-brief__claims"
        aria-labelledby="evidence-claims"
      >
        <h3 id="evidence-claims">
          문장별 근거 <span>{claimCount}</span>
        </h3>
        <ol>
          {claims.map((claim) => (
            <li key={claim.id}>
              <span className="evidence-brief__claim-type">
                {claim.claimType}
              </span>
              <p>
                {claimText(claim, report)}{" "}
                {claim.evidenceIds.map((id) => {
                  const item = report.evidence.find(
                    (evidence) => evidence.id === id,
                  );
                  return item ? (
                    <EvidenceChip
                      key={id}
                      evidence={item}
                      evidenceOrder={report.evidence}
                      onOpen={onOpen}
                      hideProbability={judgment.basis === "구간"}
                    />
                  ) : null;
                })}
              </p>
              <button
                type="button"
                className="evidence-brief__view"
                onClick={() => onViewClaim(claim.id)}
              >
                예보서에서 보기
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="evidence-brief__sources"
        aria-labelledby="evidence-sources"
      >
        <h3 id="evidence-sources">
          근거와 출처 <span>{cards.length}</span>
        </h3>
        <ul>
          {cards.map((card) => (
            <li key={card.id}>
              <strong>{card.title}</strong>
              {card.detail && <span>{card.detail}</span>}
              <small>
                근거 {card.numbers.map((number) => `[${number}]`).join(" ")}
              </small>
              {card.url && (
                <a href={card.url} target="_blank" rel="noopener noreferrer">
                  원문 열기 <ExternalLink size={13} aria-hidden="true" />
                </a>
              )}
            </li>
          ))}
        </ul>
        <p className="evidence-brief__foot">
          데이터랩 자료까지 이어지는 문장 {datalabClaimCount}개 / {claimCount}개
          ·{" "}
          <Link to={forecastEvidenceHref(report)}>이 예보의 근거 살펴보기</Link>
        </p>
      </section>
    </section>
  );
}
