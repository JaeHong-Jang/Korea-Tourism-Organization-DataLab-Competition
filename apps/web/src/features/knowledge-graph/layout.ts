// ELK가 클래스 층에서 개체 층으로 이어지는 기준 그래프 좌표를 계산한다.
import type { Edge, Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { GraphData, GraphNode } from "./graph-data";

const elk = new ELK();
export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 82;
export type GraphPosition = { x: number; y: number };

// 클래스는 첫 층에 고정하고 전체 응답의 좌표를 한 번에 계산한다.
export async function layoutGraph(
  data: GraphData,
): Promise<Map<string, GraphPosition>> {
  const result = await elk.layout({
    id: "knowledge-graph",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: data.nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      ...(node.kind === "class"
        ? { layoutOptions: { "elk.layered.layerConstraint": "FIRST" } }
        : {}),
    })),
    edges: data.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });
  return new Map(
    result.children?.map((node) => [
      node.id,
      { x: node.x ?? 0, y: node.y ?? 0 },
    ]) ?? [],
  );
}

// 필터와 선택을 바꿔도 원래 좌표를 재사용한다.
export function flowNodes(
  data: GraphData,
  positions: Map<string, GraphPosition>,
  active: ReadonlySet<string> | null,
  selectedId: string | null,
  onSelect: (id: string) => void,
): Node<{
  item: GraphNode;
  dimmed: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}>[] {
  return data.nodes.map((item) => ({
    id: item.id,
    type: "knowledge",
    position: positions.get(item.id) ?? { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    draggable: false,
    data: {
      item,
      dimmed: Boolean(active && !active.has(item.id)),
      selected: item.id === selectedId,
      onSelect,
    },
  }));
}

// 관계 이름은 계약의 한국어 라벨을 그대로 사용한다.
export function flowEdges(
  data: GraphData,
  active: ReadonlySet<string> | null,
): Edge[] {
  return data.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
    animated: false,
    className:
      active && !(active.has(edge.source) && active.has(edge.target))
        ? "is-dimmed"
        : "",
  }));
}
