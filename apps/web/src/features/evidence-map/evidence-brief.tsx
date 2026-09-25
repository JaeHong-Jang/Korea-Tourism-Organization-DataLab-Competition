// 발행 예보서의 근거를 판정 → 받치는 근거·주의할 점 → 문장별 근거 → 출처 순으로 읽게 정리한다.
import masterLabels from "@crowdcast/contracts/jsonld/master-labels.json";
import type { Evidence, ForecastReport } from "@crowdcast/contracts/types";
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
import {
  SIZE_BIAS_NOTICE,
  UNVERIFIED_NOTICE,
} from "../forecast-report/report-judgment";
import { buildEvidenceMap } from "./graph-data";

type Caution = { id: string; title: string; text: string; evidence?: Evidence };

// 기계용 JSON 요약은 출처·기간·모델만 짧게 쓰고, 일반 문장은 그대로 쓴다.
export function readableSummary(evidence: Evidence): string {
  const text = evidence.summary.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return text;
  const period = evidence.period
    ? `관측 ${evidence.period.from.slice(0, 10)}~${evidence.period.to.slice(0, 10)}`
    : null;
  return (
    [
      evidence.source?.title,
      period,
      evidence.modelVersion ? `모델 ${evidence.modelVersion}` : null,
      evidence.caseEventId ? "과거 비슷한 행사 실측" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "세부 값은 근거 서랍에서 볼 수 있어요."
  );
}

// 가정·통과 못 한 검사·검증 한계·학습 범위 밖 입력을 주의할 점으로 모은다.
export function cautions(report: ForecastReport): Caution[] {
  const items: Caution[] = report.evidence
    .filter(
      (item) =>
        item.kind === "assumption" ||
        (item.kind === "check" && item.checkResult?.passed === false),
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      text: readableSummary(item),
      evidence: item,
    }));
  if (report.forecast.judgment.basis === "구간")
    items.push({
      id: "basis",
      title: "구간 기준 판정",
      text: "표본이 적어 확률 대신 예측 구간으로 판정했어요.",
    });
  if (report.forecast.ood)
    items.push({
      id: "ood",
      title: "학습 범위 밖 입력",
      text: "과거 자료에 비슷한 행사가 적어 오차가 클 수 있어요.",
    });
  if (report.forecast.predictionRun.modelVerdict === "미검증") {
    items.push({
      id: "unverified",
      title: "검증 전 모델",
      text: UNVERIFIED_NOTICE,
    });
    items.push({ id: "size-bias", title: "규모 쏠림", text: SIZE_BIAS_NOTICE });
  }
  return items;
}

// 근거 → 출처 → 원문 문서를 따라가 같은 문서는 한 장의 출처 카드로 묶는다.
export function sourceCards(report: ForecastReport) {
  const map = buildEvidenceMap(report);
  const nodes = new Map(map.nodes.map((node) => [node.id, node]));
  const cards = new Map<
    string,
    {
      id: string;
      title: string;
      detail?: string;
      url?: string;
      numbers: number[];
    }
  >();
  for (const evidence of report.evidence) {
    const source = map.edges.find(
      (edge) => edge.source === `evidence:${evidence.id}`,
    )?.target;
    if (!source) continue;
    const document =
      map.edges.find((edge) => edge.source === source)?.target ?? source;
    const node = nodes.get(document);
    if (!node) continue;
    const card = cards.get(document) ?? {
      id: document,
      // 원문 문서가 없는 모델·가정·검증은 식별자 대신 근거 제목과 종류로 보인다.
      title: node.kind === "document" ? node.label : evidence.title,
      detail:
        node.kind === "document"
          ? node.detail
          : `${evidenceKinds[evidence.kind].label} · ${node.referenceId ?? ""}`,
      url: node.url,
      numbers: [],
    };
    const number = evidenceNumber(evidence.id, report.evidence);
    if (number != null && !card.numbers.includes(number))
      card.numbers.push(number);
    cards.set(document, card);
  }
  return {
    cards: [...cards.values()],
    datalabClaimCount: map.datalabClaimCount,
    claimCount: map.claimCount,
  };
}

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
          · <Link to="/graph">전체 근거 그래프 보기</Link>
        </p>
      </section>
    </section>
  );
}
