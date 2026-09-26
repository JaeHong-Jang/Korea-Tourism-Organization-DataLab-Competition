// 기준 그래프의 노드와 관계를 필터·검색·연결 탐색용 자료로 바꾼다.
import type { KnowledgeGraph } from "@crowdcast/contracts/types";

export type GraphNode = KnowledgeGraph["nodes"][number];
export type GraphEdge = KnowledgeGraph["edges"][number] & { id: string };
export type GraphKind = GraphNode["kind"];
export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };

export const graphKinds: { kind: GraphKind; label: string }[] = [
  { kind: "class", label: "클래스" },
  { kind: "rule", label: "규칙" },
  { kind: "clause", label: "조항" },
  { kind: "dataset", label: "데이터셋" },
  { kind: "assumption", label: "가정" },
  { kind: "model", label: "모델" },
  { kind: "stage", label: "단계" },
  { kind: "file", label: "파일" },
  { kind: "agent", label: "에이전트" },
  { kind: "other", label: "기타" },
];
export const kindLabel = (kind: GraphKind) =>
  graphKinds.find((item) => item.kind === kind)?.label ?? "기타";

// 계약 순서를 보존하며 중복 관계에도 안정적인 화면 식별자를 붙인다.
export function buildGraph(graph: KnowledgeGraph): GraphData {
  const known = new Set(graph.nodes.map((node) => node.id));
  return {
    nodes: graph.nodes,
    edges: graph.edges
      .filter((edge) => known.has(edge.source) && known.has(edge.target))
      .map((edge, index) => ({ ...edge, id: `relation-${index}` })),
  };
}

// 종류를 숨겨도 남은 두 노드 사이의 관계만 표시한다.
export function filterGraph(
  data: GraphData,
  kinds: ReadonlySet<GraphKind>,
): GraphData {
  const nodes = data.nodes.filter((node) => kinds.has(node.kind));
  const visible = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: data.edges.filter(
      (edge) => visible.has(edge.source) && visible.has(edge.target),
    ),
  };
}

// 두 글자 이상일 때 이름과 설명에서 일치하는 노드를 찾는다.
export function searchGraph(data: GraphData, query: string): GraphNode[] {
  const needle = query.trim().toLocaleLowerCase("ko");
  if ([...needle].length < 2) return [];
  return data.nodes.filter((node) =>
    `${node.label} ${node.note ?? ""}`.toLocaleLowerCase("ko").includes(needle),
  );
}

// 선택 노드에 직접 닿는 관계와 이웃만 밝힌다.
export function connectedNodes(data: GraphData, id: string): Set<string> {
  const connected = new Set([id]);
  for (const edge of data.edges) {
    if (edge.source === id) connected.add(edge.target);
    if (edge.target === id) connected.add(edge.source);
  }
  return connected;
}

// 상세 패널에서 관계의 방향과 한국어 이름을 함께 읽는다.
export function nodeRelations(data: GraphData, id: string) {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  return data.edges.flatMap((edge) => {
    if (edge.source !== id && edge.target !== id) return [];
    const related = nodes.get(edge.source === id ? edge.target : edge.source);
    return related
      ? [
          {
            edge,
            related,
            direction: edge.source === id ? "나가는 관계" : "들어오는 관계",
          },
        ]
      : [];
  });
}

// 원문 링크는 브라우저에서 열 수 있는 웹 주소만 허용한다.
export function sourceUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
