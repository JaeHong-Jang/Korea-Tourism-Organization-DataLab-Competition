// 노드 종류를 색(범주형 고정 순서)과 모양으로 함께 구분한다 — 색만으로 읽지 않게.
import type { GraphKind } from "./graph-data";

export type NodeShape =
  | "sphere"
  | "octahedron"
  | "box"
  | "icosahedron"
  | "tetrahedron"
  | "cone"
  | "torus"
  | "dot";

// 주요 7종은 --cat-1~7, 나머지(단계·파일·기타)는 중성색으로 둔다.
export const kindStyle: Record<GraphKind, { color: string; shape: NodeShape }> =
  {
    class: { color: "--cat-1", shape: "sphere" },
    rule: { color: "--cat-2", shape: "octahedron" },
    dataset: { color: "--cat-3", shape: "box" },
    assumption: { color: "--cat-4", shape: "tetrahedron" },
    model: { color: "--cat-5", shape: "icosahedron" },
    agent: { color: "--cat-6", shape: "sphere" },
    clause: { color: "--cat-7", shape: "cone" },
    stage: { color: "--ink-2", shape: "torus" },
    file: { color: "--muted", shape: "dot" },
    other: { color: "--muted", shape: "dot" },
  };

// 연결이 많을수록 조금 크게, 파일 점은 작게 둔다.
export function nodeRadius(kind: GraphKind, degree: number) {
  if (kind === "file" || kind === "other") return 1.8;
  return Math.min(9, 3 + Math.sqrt(degree) * 0.9);
}
