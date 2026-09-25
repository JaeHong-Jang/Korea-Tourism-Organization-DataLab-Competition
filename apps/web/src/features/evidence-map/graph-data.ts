// 발행 스냅샷의 문장·근거·출처·문서를 중복 없는 지도 자료로 바꾼다.
import masterLabels from "@crowdcast/contracts/jsonld/master-labels.json";
import type { Evidence, ForecastReport } from "@crowdcast/contracts/types";
import { claimText, orderedClaims } from "../forecast-report/report-content";

export type MapNode = {
  id: string;
  kind: "claim" | "evidence" | "source" | "document";
  label: string;
  detail?: string;
  referenceId?: string;
  evidenceKind?: Evidence["kind"];
  url?: string;
};
export type MapEdge = { id: string; source: string; target: string };
export type EvidenceMapData = {
  nodes: MapNode[];
  edges: MapEdge[];
  claimCount: number;
  evidenceCount: number;
  datalabClaimCount: number;
};

// 마스터 라벨이 있는 식별자는 정본 이름과 링크를 우선한다.
function sourceFor(
  evidence: Evidence,
): { source: MapNode; document?: MapNode } | null {
  if (evidence.source) {
    const source = evidence.source;
    const dataset =
      masterLabels.datasets[
        source.datasetId as keyof typeof masterLabels.datasets
      ];
    return {
      source: {
        id: `source:dataset:${source.datasetId}`,
        kind: "source",
        label: source.title || dataset?.title || source.datasetId,
        detail: source.datasetId,
        referenceId: source.datasetId,
      },
      document: {
        id: `document:dataset:${source.datasetId}`,
        kind: "document",
        label: dataset?.title ?? source.title,
        detail: source.datalabMenu ?? source.publisher,
        referenceId: source.datasetId,
        url: dataset?.url ?? source.accessUrl ?? undefined,
      },
    };
  }
  if (evidence.ruleId) {
    const rule =
      masterLabels.rules[evidence.ruleId as keyof typeof masterLabels.rules];
    const clauseId = evidence.clauseId ?? rule?.clauseId;
    const clause = clauseId
      ? masterLabels.clauses[clauseId as keyof typeof masterLabels.clauses]
      : null;
    return {
      source: {
        id: `source:rule:${evidence.ruleId}`,
        kind: "source",
        label: rule?.title ?? evidence.ruleId,
        detail: evidence.ruleId,
        referenceId: evidence.ruleId,
      },
      document: clauseId
        ? {
            id: `document:clause:${clauseId}`,
            kind: "document",
            label: clause?.title ?? clauseId,
            detail: clause?.publisher,
            referenceId: clauseId,
            url: clause?.url,
          }
        : undefined,
    };
  }
  const reference =
    evidence.modelVersion ??
    evidence.caseEventId ??
    evidence.assumptionId ??
    (evidence.checkResult && evidence.forecastId
      ? `${evidence.forecastId}:${evidence.checkResult.checkKind}:${evidence.checkResult.revision}`
      : null);
  if (!reference) return null;
  const prefix =
    evidence.kind === "model"
      ? "모델"
      : evidence.kind === "case"
        ? "사례"
        : evidence.kind === "assumption"
          ? "가정"
          : "검증";
  return {
    source: {
      id: `source:${evidence.kind}:${reference}`,
      kind: "source",
      label: `${prefix} ${reference}`,
      referenceId: reference,
    },
  };
}

// 같은 근거와 같은 출처가 여러 문장에 연결돼도 노드는 한 번만 만든다.
export function buildEvidenceMap(report: ForecastReport): EvidenceMapData {
  const nodes = new Map<string, MapNode>();
  const edges = new Map<string, MapEdge>();
  const claims = orderedClaims(report);
  const evidenceById = new Map(report.evidence.map((item) => [item.id, item]));
  const datalabEvidence = new Set(
    report.evidence
      .filter(
        (item) =>
          item.source?.datasetId.startsWith("ds-datalab") ||
          Boolean(item.source?.datalabMenu),
      )
      .map((item) => item.id),
  );
  let datalabClaimCount = 0;

  // 레이아웃에 실린 발행 문장과 계약의 근거 ID만 간선으로 연결한다.
  for (const claim of claims) {
    const claimId = `claim:${claim.id}`;
    nodes.set(claimId, {
      id: claimId,
      kind: "claim",
      label: claimText(claim, report),
      detail: claim.claimType,
      referenceId: claim.id,
    });
    if (claim.evidenceIds.some((id) => datalabEvidence.has(id)))
      datalabClaimCount++;
    for (const evidenceId of claim.evidenceIds) {
      if (!evidenceById.has(evidenceId)) continue;
      const target = `evidence:${evidenceId}`;
      edges.set(`${claimId}->${target}`, {
        id: `${claimId}->${target}`,
        source: claimId,
        target,
      });
    }
  }

  // 스냅샷에 포함된 모든 근거를 카드 번호 순서로 놓고 출처·문서를 합친다.
  for (const evidence of report.evidence) {
    const evidenceId = `evidence:${evidence.id}`;
    nodes.set(evidenceId, {
      id: evidenceId,
      kind: "evidence",
      label: evidence.title,
      detail: evidence.summary,
      referenceId: evidence.id,
      evidenceKind: evidence.kind,
    });
    const lineage = sourceFor(evidence);
    if (!lineage) continue;
    nodes.set(lineage.source.id, lineage.source);
    edges.set(`${evidenceId}->${lineage.source.id}`, {
      id: `${evidenceId}->${lineage.source.id}`,
      source: evidenceId,
      target: lineage.source.id,
    });
    if (lineage.document) {
      nodes.set(lineage.document.id, lineage.document);
      edges.set(`${lineage.source.id}->${lineage.document.id}`, {
        id: `${lineage.source.id}->${lineage.document.id}`,
        source: lineage.source.id,
        target: lineage.document.id,
      });
    }
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    claimCount: claims.length,
    evidenceCount: report.evidence.length,
    datalabClaimCount,
  };
}

// 필터는 배치 좌표를 바꾸지 않고 관련 문장·출처·문서만 남긴다.
export function filterEvidenceMap(
  data: EvidenceMapData,
  kinds: readonly Evidence["kind"][],
): EvidenceMapData {
  if (kinds.length === 0 || kinds.length === 6) return data;
  const evidenceIds = new Set(
    data.nodes
      .filter(
        (node) =>
          node.kind === "evidence" &&
          node.evidenceKind &&
          kinds.includes(node.evidenceKind),
      )
      .map((node) => node.id),
  );
  const visible = new Set(evidenceIds);
  for (const edge of data.edges)
    if (evidenceIds.has(edge.target) || evidenceIds.has(edge.source)) {
      visible.add(edge.source);
      visible.add(edge.target);
    }
  for (const edge of data.edges)
    if (visible.has(edge.source) && edge.target.startsWith("document:"))
      visible.add(edge.target);
  return {
    ...data,
    nodes: data.nodes.filter((node) => visible.has(node.id)),
    edges: data.edges.filter(
      (edge) => visible.has(edge.source) && visible.has(edge.target),
    ),
  };
}

// 호버·포커스 노드에서 양방향으로 닿는 경로만 밝힌다.
export function connectedPath(
  data: EvidenceMapData,
  startId: string,
): Set<string> {
  const reached = new Set([startId]);
  const pending = [startId];
  while (pending.length) {
    const current = pending.pop();
    for (const edge of data.edges) {
      const next =
        edge.source === current
          ? edge.target
          : edge.target === current
            ? edge.source
            : null;
      if (next && !reached.has(next)) {
        reached.add(next);
        pending.push(next);
      }
    }
  }
  return reached;
}
