// 기준 그래프를 3D 힘 배치로 펼친다 — 같은 종류는 가까이, 관계는 끈처럼, 모든 노드는 서로 밀어낸다.
import type { GraphData, GraphKind } from "./graph-data";

export type Point3 = [number, number, number];

// 같은 그래프에는 늘 같은 모양이 나오도록 고정 씨앗 난수를 쓴다.
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

// 종류마다 구 표면의 고정 기준점을 둔다(황금각 나선으로 고르게).
function kindAnchors(kinds: GraphKind[], radius: number) {
  const anchors = new Map<GraphKind, Point3>();
  kinds.forEach((kind, index) => {
    const y = 1 - (2 * (index + 0.5)) / kinds.length;
    const ring = Math.sqrt(1 - y * y);
    const angle = index * 2.399963;
    anchors.set(kind, [
      Math.cos(angle) * ring * radius,
      y * radius * 0.7,
      Math.sin(angle) * ring * radius,
    ]);
  });
  return anchors;
}

// 노드 수가 수백 개라 O(n²) 반발을 그대로 계산해도 한 번에 끝난다.
export function layoutGraph3d(data: GraphData, iterations = 320) {
  const random = seeded(183303);
  const kinds = [...new Set(data.nodes.map((node) => node.kind))];
  const anchors = kindAnchors(kinds, 110);
  const index = new Map(data.nodes.map((node, i) => [node.id, i]));
  const count = data.nodes.length;
  const position = new Float64Array(count * 3);
  const velocity = new Float64Array(count * 3);
  data.nodes.forEach((node, i) => {
    const anchor = anchors.get(node.kind) ?? [0, 0, 0];
    for (let axis = 0; axis < 3; axis++)
      position[i * 3 + axis] = anchor[axis] + (random() - 0.5) * 60;
  });
  const links = data.edges
    .map((edge) => [index.get(edge.source), index.get(edge.target)])
    .filter(
      (pair): pair is [number, number] =>
        pair[0] !== undefined && pair[1] !== undefined,
    );
  const force = new Float64Array(count * 3);
  for (let step = 0; step < iterations; step++) {
    const cooling = 1 - step / iterations;
    force.fill(0);
    // 모든 노드 쌍은 거리 제곱에 반비례해 밀어낸다.
    for (let a = 0; a < count; a++)
      for (let b = a + 1; b < count; b++) {
        const dx = position[a * 3] - position[b * 3];
        const dy = position[a * 3 + 1] - position[b * 3 + 1];
        const dz = position[a * 3 + 2] - position[b * 3 + 2];
        const distance2 = dx * dx + dy * dy + dz * dz + 1;
        const push = 700 / distance2 / Math.sqrt(distance2);
        force[a * 3] += dx * push;
        force[a * 3 + 1] += dy * push;
        force[a * 3 + 2] += dz * push;
        force[b * 3] -= dx * push;
        force[b * 3 + 1] -= dy * push;
        force[b * 3 + 2] -= dz * push;
      }
    // 관계는 기본 길이 26의 끈처럼 당긴다.
    for (const [a, b] of links) {
      const dx = position[b * 3] - position[a * 3];
      const dy = position[b * 3 + 1] - position[a * 3 + 1];
      const dz = position[b * 3 + 2] - position[a * 3 + 2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const pull = ((distance - 26) / distance) * 0.06;
      force[a * 3] += dx * pull;
      force[a * 3 + 1] += dy * pull;
      force[a * 3 + 2] += dz * pull;
      force[b * 3] -= dx * pull;
      force[b * 3 + 1] -= dy * pull;
      force[b * 3 + 2] -= dz * pull;
    }
    // 종류 기준점으로 약하게 당기고, 속도를 줄여 가며 움직인다.
    data.nodes.forEach((node, i) => {
      const anchor = anchors.get(node.kind) ?? [0, 0, 0];
      for (let axis = 0; axis < 3; axis++) {
        const k = i * 3 + axis;
        force[k] += (anchor[axis] - position[k]) * 0.012;
        velocity[k] = (velocity[k] + force[k]) * 0.82;
        const limit = 9 * cooling + 0.5;
        position[k] += Math.max(-limit, Math.min(limit, velocity[k]));
      }
    });
  }
  const result = new Map<string, Point3>();
  data.nodes.forEach((node, i) =>
    result.set(node.id, [
      position[i * 3],
      position[i * 3 + 1],
      position[i * 3 + 2],
    ]),
  );
  return result;
}

// 연결 수는 노드 크기와 기본 이름표 선택에 쓴다.
export function nodeDegrees(data: GraphData) {
  const degree = new Map<string, number>();
  for (const edge of data.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}
