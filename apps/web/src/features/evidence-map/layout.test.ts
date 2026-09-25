// 많은 문장·근거 경로를 배치해도 카드가 서로 덮이지 않는지 확인한다.
import { expect, it } from "vitest";
import type { EvidenceMapData, MapNode } from "./graph-data";
import { layoutEvidenceMap, NODE_HEIGHT, NODE_WIDTH } from "./layout";

// 실제 배치 엔진에 150개 노드를 넣어 카드 경계가 겹치지 않는지 확인한다.
it("150개 노드를 오른쪽 방향으로 겹침 없이 놓는다", async () => {
  const nodes: MapNode[] = [];
  const edges: EvidenceMapData["edges"] = [];
  for (let index = 0; index < 50; index++) {
    nodes.push({ id: `claim:${index}`, kind: "claim", label: `문장 ${index}` });
    nodes.push({
      id: `evidence:${index}`,
      kind: "evidence",
      label: `근거 ${index}`,
      evidenceKind: "data",
    });
    nodes.push({
      id: `source:${index}`,
      kind: "source",
      label: `출처 ${index}`,
    });
    edges.push({
      id: `claim-${index}`,
      source: `claim:${index}`,
      target: `evidence:${index}`,
    });
    edges.push({
      id: `evidence-${index}`,
      source: `evidence:${index}`,
      target: `source:${index}`,
    });
  }
  const positions = await layoutEvidenceMap({
    nodes,
    edges,
    claimCount: 50,
    evidenceCount: 50,
    datalabClaimCount: 0,
  });
  expect(positions.size).toBe(150);
  const placed = [...positions.values()];
  for (let first = 0; first < placed.length; first++) {
    for (let second = first + 1; second < placed.length; second++) {
      const a = placed[first];
      const b = placed[second];
      expect(
        a.x + NODE_WIDTH <= b.x ||
          b.x + NODE_WIDTH <= a.x ||
          a.y + NODE_HEIGHT <= b.y ||
          b.y + NODE_HEIGHT <= a.y,
      ).toBe(true);
    }
  }
}, 20_000);
