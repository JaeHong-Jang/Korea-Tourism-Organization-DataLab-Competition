// 전체 근거 그래프의 변환·필터·검색·연결을 작은 계약 응답으로 확인한다.
import type { KnowledgeGraph } from "@crowdcast/contracts/types";
import { describe, expect, it } from "vitest";
import {
  buildGraph,
  connectedNodes,
  filterGraph,
  searchGraph,
} from "./graph-data";
import { layoutGraph3d, nodeDegrees } from "./layout-3d";

const graph: KnowledgeGraph = {
  masterVersion: 4,
  generatedAt: "2026-09-25T12:00:00Z",
  nodes: [
    { id: "cc:Evidence", kind: "class", label: "근거" },
    {
      id: "rule-safety",
      kind: "rule",
      label: "안전 판정 규칙",
      note: "행사 안전",
    },
    { id: "law-safety", kind: "clause", label: "재난안전법 조항" },
    { id: "ds-visit", kind: "dataset", label: "관광 데이터랩 방문자" },
    { id: "st-verify", kind: "stage", label: "출처 확인 단계" },
  ],
  edges: [
    {
      source: "cc:Evidence",
      target: "rule-safety",
      predicate: "rdfs:subClassOf",
      label: "분류한다",
    },
    {
      source: "rule-safety",
      target: "law-safety",
      predicate: "cc:basedOn",
      label: "근거로 삼는다",
    },
    {
      source: "st-verify",
      target: "ds-visit",
      predicate: "prov:used",
      label: "사용한다",
    },
    {
      source: "missing",
      target: "law-safety",
      predicate: "cc:basedOn",
      label: "근거로 삼는다",
    },
  ],
};

// 없는 노드로 향하는 잘못된 관계는 화면에서 제외하고 정상 관계의 이름은 보존한다.
describe("전체 근거 그래프", () => {
  it("노드와 관계를 그래프 자료로 변환하고 연결 수를 센다", () => {
    const data = buildGraph(graph);
    expect(data.edges).toHaveLength(3);
    expect(data.edges.map((edge) => edge.label)).toContain("근거로 삼는다");
    expect(nodeDegrees(data).get("rule-safety")).toBeGreaterThan(0);
  });

  // 필터 뒤에는 양쪽 노드가 모두 남은 관계만 표시한다.
  it("종류 필터와 직접 연결 경로를 적용한다", () => {
    const filtered = filterGraph(
      buildGraph(graph),
      new Set(["class", "rule", "clause"]),
    );
    expect(filtered.nodes).toHaveLength(3);
    expect(filtered.edges).toHaveLength(2);
    expect(connectedNodes(filtered, "rule-safety")).toEqual(
      new Set(["rule-safety", "cc:Evidence", "law-safety"]),
    );
  });

  // 한 글자 입력은 검색하지 않고 숨긴 종류도 두 글자부터 찾는다.
  it("두 글자부터 이름과 설명을 검색한다", () => {
    const data = buildGraph(graph);
    expect(searchGraph(data, "안")).toEqual([]);
    expect(searchGraph(data, "관광").map((node) => node.id)).toEqual([
      "ds-visit",
    ]);
    expect(searchGraph(data, "행사 안전").map((node) => node.id)).toEqual([
      "rule-safety",
    ]);
  });

  // 3D 배치는 같은 그래프에 늘 같은 좌표를 주고 모든 좌표가 유한하다.
  it("3D 배치가 결정적이고 유한하다", () => {
    const data = buildGraph(graph);
    const first = layoutGraph3d(data, 60);
    const second = layoutGraph3d(data, 60);
    expect(first).toHaveProperty("size", graph.nodes.length);
    for (const [id, point] of first) {
      expect(point.every(Number.isFinite)).toBe(true);
      expect(point).toEqual(second.get(id));
    }
  });
});
