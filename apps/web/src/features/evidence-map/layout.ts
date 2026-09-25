// ELK의 오른쪽 방향 계층 배치로 문장부터 문서까지 노드를 겹치지 않게 놓는다.

import type { Edge, Node } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { EvidenceMapData, MapNode } from "./graph-data";

const elk = new ELK();
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 100;

// 노드 크기를 배치 입력에 고정해 React Flow 측정 시점과 상관없이 한 번만 계산한다.
export async function layoutEvidenceMap(
  data: EvidenceMapData,
): Promise<Map<string, { x: number; y: number }>> {
  const result = await elk.layout({
    id: "evidence-map",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "32",
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: data.nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
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

// 계산한 좌표는 필터를 바꾸어도 그대로 유지한다.
export function flowPositions(
  data: EvidenceMapData,
  positions: Map<string, { x: number; y: number }>,
): Node<{ item: MapNode }>[] {
  return data.nodes.map((item) => ({
    id: item.id,
    type: "evidenceMap",
    position: positions.get(item.id) ?? { x: 0, y: 0 },
    data: { item },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    draggable: false,
  }));
}

// 선은 배치 좌표와 별도로 보관해 경로 강조에 재사용한다.
export function flowEdges(data: EvidenceMapData): Edge[] {
  return data.edges.map((edge) => ({
    ...edge,
    type: "smoothstep",
    animated: false,
  }));
}
