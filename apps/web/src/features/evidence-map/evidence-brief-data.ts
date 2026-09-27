// 예보서 근거의 주의 항목과 출처 카드를 화면에 맞게 정리한다.
import type { Evidence, ForecastReport } from "@crowdcast/contracts/types";
import { evidenceKinds } from "../../components/common/evidence-chip";
import { evidenceNumber } from "../../components/common/evidence-number";
import {
  SIZE_BIAS_NOTICE,
  UNVERIFIED_NOTICE,
} from "../forecast-report/report-judgment";
import { buildEvidenceMap } from "./graph-data";

export type Caution = {
  id: string;
  title: string;
  text: string;
  evidence?: Evidence;
};

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
