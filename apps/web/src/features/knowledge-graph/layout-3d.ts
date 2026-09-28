// 기준 그래프를 인파예보 고래 로고 모양으로 펼친다 — 같은 종류는 한 덩어리로, 몸 안쪽일수록 앞뒤로 두껍게.
import { type GraphData, type GraphKind, readerGroups } from "./graph-data";
import { whaleCrop, whaleSilhouette } from "./whale-silhouette";

export type Point3 = [number, number, number];

// 모양틀 한 칸의 화면 크기와 몸통 반두께(가운데가 가장 두껍고 가장자리로 갈수록 둥글게 얇아진다).
const CELL = 10;
const THICKNESS = 110;
// 물결은 몸통보다 납작하게 둔다.
const WAVE_THICKNESS = 0.35;
// 테두리 칸은 안쪽 칸보다 이만큼 더 자주 뽑아, 노드가 적어도 고래 윤곽이 먼저 읽히게 한다.
const EDGE_WEIGHT = 4;
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

// 같은 그래프에는 늘 같은 모양이 나오도록 고정 씨앗 난수를 쓴다.
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

// 힐베르트 곡선 순서로 칸을 늘어놓으면, 이어진 구간이 가늘고 긴 띠가 아니라 둥근 덩어리가 된다.
function hilbertIndex(size: number, x: number, y: number) {
  let index = 0;
  let px = x;
  let py = y;
  for (let s = size / 2; s >= 1; s /= 2) {
    const rx = px & s ? 1 : 0;
    const ry = py & s ? 1 : 0;
    index += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        px = s - 1 - px;
        py = s - 1 - py;
      }
      [px, py] = [py, px];
    }
  }
  return index;
}

type Cell = {
  x: number;
  y: number;
  depth: number;
  order: number;
  wave: boolean;
};

// 모양틀의 채워진 칸마다 가장자리까지의 거리(두께 계산용)와 곡선 순서를 구한다.
function silhouetteCells(): Cell[] {
  const rows = whaleSilhouette;
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const filled = (x: number, y: number) =>
    y >= 0 && y < height && x >= 0 && x < width && rows[y][x] !== ".";
  const depth = new Map<string, number>();
  const queue: [number, number][] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (filled(x, y) && STEPS.some(([dx, dy]) => !filled(x + dx, y + dy))) {
        depth.set(`${x},${y}`, 1);
        queue.push([x, y]);
      }
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    const next = (depth.get(`${x},${y}`) ?? 1) + 1;
    for (const [dx, dy] of STEPS) {
      const key = `${x + dx},${y + dy}`;
      if (!filled(x + dx, y + dy) || depth.has(key)) continue;
      depth.set(key, next);
      queue.push([x + dx, y + dy]);
    }
  }
  let size = 1;
  while (size < Math.max(width, height)) size *= 2;
  return [...depth]
    .map(([key, value]) => {
      const [x, y] = key.split(",").map(Number);
      return {
        x,
        y,
        depth: value,
        order: hilbertIndex(size, x, y),
        wave: rows[y][x] === "~",
      };
    })
    .sort((a, b) => a.order - b.order);
}

// 보는 묶음 순서(판정 → 자료 → 계산 → 만드는 주체)대로 종류를 늘어놓아 묶음끼리 이웃하게 한다.
function kindOrder(data: GraphData) {
  const present = new Set(data.nodes.map((node) => node.kind));
  const ordered: GraphKind[] = readerGroups
    .flatMap((group) => group.kinds)
    .filter((kind) => present.has(kind));
  for (const kind of present) if (!ordered.includes(kind)) ordered.push(kind);
  return ordered;
}

// 노드를 곡선 순서의 칸에 고르게 나눠 앉힌다. 종류 안에서는 연결이 많은 노드를 덩어리 한가운데에 둔다.
export function layoutGraph3d(data: GraphData) {
  const random = seeded(183303);
  const cells = silhouetteCells();
  const degree = nodeDegrees(data);
  const nodes = kindOrder(data).flatMap((kind) => {
    const group = data.nodes
      .filter((node) => node.kind === kind)
      .sort(
        (a, b) =>
          (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) ||
          a.id.localeCompare(b.id),
      );
    // 연결 많은 순으로 가운데에서 바깥쪽으로 번갈아 놓는다.
    const arranged: typeof group = [];
    group.forEach((node, index) => {
      if (index % 2) arranged.push(node);
      else arranged.unshift(node);
    });
    return arranged;
  });
  const width = Math.max(...whaleSilhouette.map((row) => row.length));
  const height = whaleSilhouette.length;
  const maxDepth = Math.max(...cells.map((cell) => cell.depth));
  const result = new Map<string, Point3>();
  // 곡선 순서를 따라 칸마다 무게(테두리는 무겁게)를 쌓고, 같은 무게 간격으로 노드를 앉힌다.
  const weights = cells.map((cell) => (cell.depth === 1 ? EDGE_WEIGHT : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  let acc = weights[0];
  nodes.forEach((node, index) => {
    const goal = ((index + 0.5) * total) / nodes.length;
    while (acc < goal && cursor < cells.length - 1) acc += weights[++cursor];
    const cell = cells[cursor];
    // 칸 안에서 조금 흔들어 격자 무늬를 지운다. 앞뒤 높이는 가장자리까지 거리로 부풀린 둥근 몸(원 단면)을 따른다.
    const inner = 1 - cell.depth / maxDepth;
    const bulge =
      Math.sqrt(1 - inner * inner) *
      THICKNESS *
      (cell.wave ? WAVE_THICKNESS : 1);
    const side = index % 2 ? 1 : -1;
    result.set(node.id, [
      (cell.x - width / 2 + (random() - 0.5) * 0.8) * CELL,
      (height / 2 - cell.y + (random() - 0.5) * 0.8) * CELL,
      side * bulge * (0.75 + random() * 0.25),
    ]);
  });
  return result;
}

// 노드 배치와 같은 좌표계에서 원본 로고 한 장이 놓일 중심과 크기(몸 한가운데 단면에 둔다).
export function whaleBackdrop() {
  const width = Math.max(...whaleSilhouette.map((row) => row.length));
  const height = whaleSilhouette.length;
  const center: Point3 = [
    (whaleCrop.width / 2 - 0.5 - whaleCrop.left - width / 2) * CELL,
    (height / 2 - (whaleCrop.height / 2 - 0.5 - whaleCrop.top)) * CELL,
    0,
  ];
  return { center, size: [whaleCrop.width * CELL, whaleCrop.height * CELL] };
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
