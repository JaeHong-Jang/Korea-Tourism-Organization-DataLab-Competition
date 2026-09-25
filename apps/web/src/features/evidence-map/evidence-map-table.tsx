// 그래프와 같은 문장·근거·출처·문서를 읽기 쉬운 표로 펼친다.
// biome-ignore-all lint/a11y/noNoninteractiveTabindex: 표의 가로 스크롤 영역에 키보드 초점을 준다.
import type { Evidence, ForecastReport } from "@crowdcast/contracts/types";
import { evidenceNumber } from "../../components/common/evidence-number";
import type { OpenEvidence } from "../forecast-report/report-claims";
import type { EvidenceMapData, MapNode } from "./graph-data";

// 간선으로 연결된 각 문장과 근거 쌍을 표의 한 행으로 만든다.
export function EvidenceMapTable({
  report,
  data,
  onOpen,
}: {
  report: ForecastReport;
  data: EvidenceMapData;
  onOpen: OpenEvidence;
}) {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  for (const edge of data.edges)
    outgoing.set(edge.source, [
      ...(outgoing.get(edge.source) ?? []),
      edge.target,
    ]);
  const rows: { claim: MapNode | null; evidenceId: string }[] = data.nodes
    .filter((node) => node.kind === "claim")
    .flatMap((claim) =>
      (outgoing.get(claim.id) ?? [])
        .filter((id) => nodes.get(id)?.kind === "evidence")
        .map((evidenceId) => ({ claim, evidenceId })),
    );
  const linkedEvidence = new Set(rows.map((row) => row.evidenceId));
  for (const evidence of data.nodes.filter(
    (node) => node.kind === "evidence" && !linkedEvidence.has(node.id),
  ))
    rows.push({ claim: null, evidenceId: evidence.id });

  // 그래프 밖에서도 카드 번호와 원문 링크를 같은 자료에서 찾는다.
  return (
    <section
      className="evidence-map-table-wrap"
      aria-label="근거 연결 표, 좌우로 스크롤"
      tabIndex={0}
    >
      <table className="evidence-map-table">
        <caption>발행 문장부터 데이터셋·문서까지의 근거 연결</caption>
        <thead>
          <tr>
            <th scope="col">문장</th>
            <th scope="col">근거</th>
            <th scope="col">출처</th>
            <th scope="col">데이터셋·문서</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ claim, evidenceId }) => {
            const evidenceNode = nodes.get(evidenceId);
            const source = nodes.get(outgoing.get(evidenceId)?.[0] ?? "");
            const document = nodes.get(
              outgoing.get(source?.id ?? "")?.[0] ?? "",
            );
            const evidence = report.evidence.find(
              (item) => item.id === evidenceNode?.referenceId,
            );
            const number = evidence
              ? evidenceNumber(evidence.id, report.evidence)
              : null;
            return (
              <tr key={`${claim?.id ?? "unlinked"}-${evidenceId}`}>
                <td>{claim?.label ?? "연결된 발행 문장 없음"}</td>
                <td>
                  {evidence && (
                    <button
                      type="button"
                      onClick={(event) =>
                        onOpen(evidence.id, event.currentTarget)
                      }
                    >
                      {number ? `[${number}] ` : ""}
                      {evidence.title}
                    </button>
                  )}
                </td>
                <td>{source?.label ?? "출처 없음"}</td>
                <td>
                  {document?.url ? (
                    <a href={document.url} target="_blank" rel="noreferrer">
                      {document.label}
                    </a>
                  ) : (
                    (document?.label ?? "해당 없음")
                  )}
                  {document?.detail && <small>{document.detail}</small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// 여섯 종류의 근거 필터를 계약 enum 그대로 유지한다.
export const mapEvidenceKinds: Evidence["kind"][] = [
  "data",
  "model",
  "rule",
  "case",
  "assumption",
  "check",
];
