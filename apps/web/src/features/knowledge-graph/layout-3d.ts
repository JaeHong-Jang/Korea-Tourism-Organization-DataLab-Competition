// 기준 그래프를 인파예보 고래 로고 모양으로 펼친다 — 중심 노드마다 고래의 한 자리를 맡고, 몸 안쪽일수록 앞뒤로 두껍게.
import type { GraphData } from "./graph-data";
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

// 고래 몸의 이름 붙은 자리(모양틀 칸 좌표). 중심 노드 묶음마다 한 자리를 맡는다.
const ANCHORS = {
  head: [38, 17],
  mouth: [45, 23],
  body: [16, 29],
  forehead: [29, 19],
  back: [20, 22],
  tail: [9, 11],
  chest: [26, 33],
  belly: [19, 39],
  waveMid: [34, 39],
  wave: [40, 32],
  tailTip: [13, 3],
  fin: [5, 37],
  tailBase: [4, 19],
  waveLow: [25, 46],
  waveRight: [43, 37],
} as const satisfies Record<string, readonly [number, number]>;
type Anchor = keyof typeof ANCHORS;

// 뜻이 분명한 중심 노드는 자리를 고정한다(에이전트는 머리, 가정은 입). 나머지는 큰 묶음부터 아래 순서로 앉는다.
const PINNED: Record<string, Anchor> = {
  "cc:TeamAgent": "head",
  "cc:Assumption": "mouth",
};
const ANCHOR_ORDER = Object.keys(ANCHORS) as Anchor[];
// 연결이 이 수 이상인 노드를 묶음의 중심(이름표가 붙는 노드)으로 본다.
const HUB_DEGREE = 9;

type Group = { hub: string; members: string[] };

// 중심 노드마다 묶음을 만든다. 여러 중심에 이어진 노드는 가장 구체적인(연결이 적은) 중심에 붙이고,
// 중심과 직접 이어지지 않은 노드는 이웃이 속한 묶음을 따라간다.
function communities(data: GraphData, degree: Map<string, number>): Group[] {
  const neighbors = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    const list = neighbors.get(from);
    if (list) list.push(to);
    else neighbors.set(from, [to]);
  };
  for (const edge of data.edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }
  const hubSet = new Set(
    data.nodes
      .filter((node) => (degree.get(node.id) ?? 0) >= HUB_DEGREE)
      .map((node) => node.id),
  );
  const owner = new Map<string, string>([...hubSet].map((id) => [id, id]));
  for (const node of data.nodes) {
    if (hubSet.has(node.id)) continue;
    const best = (neighbors.get(node.id) ?? [])
      .filter((id) => hubSet.has(id))
      .sort(
        (a, b) =>
          (degree.get(a) ?? 0) - (degree.get(b) ?? 0) || a.localeCompare(b),
      )[0];
    if (best) owner.set(node.id, best);
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const node of data.nodes) {
      if (owner.has(node.id)) continue;
      const via = (neighbors.get(node.id) ?? []).find((id) => owner.has(id));
      const hub = via ? owner.get(via) : undefined;
      if (hub) {
        owner.set(node.id, hub);
        changed = true;
      }
    }
  }
  // 어느 중심과도 이어지지 않은 노드는 한 묶음("")으로 모은다.
  const groups = new Map<string, string[]>();
  for (const node of data.nodes) {
    const key = owner.get(node.id) ?? "";
    const list = groups.get(key);
    if (list) list.push(node.id);
    else groups.set(key, [node.id]);
  }
  return [...groups]
    .map(([hub, members]) => ({ hub, members }))
    .sort(
      (a, b) =>
        b.members.length - a.members.length || a.hub.localeCompare(b.hub),
    );
}

// 두 칸 사이 거리의 제곱.
const distance2 = (a: Cell, b: Cell) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// 묶음마다 자리(씨앗 칸)를 정하고, 묶음 크기에 비례한 칸 수만큼 씨앗에서 가까운 이웃 칸으로 번져 영역을 나눈다.
function claimRegions(cells: Cell[], groups: Group[]) {
  const index = new Map(cells.map((cell, i) => [`${cell.x},${cell.y}`, i]));
  const nearest = (x: number, y: number) => {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    cells.forEach((cell, i) => {
      const d = (cell.x - x) ** 2 + (cell.y - y) ** 2;
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  };
  const free = ANCHOR_ORDER.filter(
    (name) => !groups.some((group) => PINNED[group.hub] === name),
  );
  const seeds: number[] = [];
  for (const group of groups) {
    const name = PINNED[group.hub] ?? free.shift();
    if (name) {
      seeds.push(nearest(ANCHORS[name][0], ANCHORS[name][1]));
      continue;
    }
    // 자리가 모자라면 이미 쓴 씨앗들에서 가장 먼 칸을 쓴다.
    let far = 0;
    let farD = -1;
    cells.forEach((cell, i) => {
      const d = Math.min(...seeds.map((seed) => distance2(cell, cells[seed])));
      if (d > farD) {
        far = i;
        farD = d;
      }
    });
    seeds.push(far);
  }
  const total = groups.reduce((sum, group) => sum + group.members.length, 0);
  const capacity = groups.map((group) =>
    Math.max(1, (group.members.length / total) * cells.length),
  );
  const claim = new Int32Array(cells.length).fill(-1);
  const regions: number[][] = groups.map(() => []);
  const frontier: Set<number>[] = groups.map(() => new Set());
  const take = (g: number, i: number) => {
    claim[i] = g;
    regions[g].push(i);
    for (const [dx, dy] of STEPS) {
      const next = index.get(`${cells[i].x + dx},${cells[i].y + dy}`);
      if (next !== undefined && claim[next] < 0) frontier[g].add(next);
    }
  };
  seeds.forEach((seed, g) => {
    if (claim[seed] < 0) take(g, seed);
  });
  let left = cells.length - regions.flat().length;
  while (left > 0) {
    // 가장 덜 찬 묶음부터, 씨앗에서 가장 가까운 경계 칸을 하나 가져간다.
    const order = groups
      .map((_, g) => g)
      .sort(
        (a, b) =>
          regions[a].length / capacity[a] - regions[b].length / capacity[b],
      );
    let taken = false;
    for (const g of order) {
      let best = -1;
      let bestD = Number.POSITIVE_INFINITY;
      for (const i of frontier[g]) {
        if (claim[i] >= 0) {
          frontier[g].delete(i);
          continue;
        }
        const d = distance2(cells[i], cells[seeds[g]]);
        if (d < bestD) {
          best = i;
          bestD = d;
        }
      }
      if (best >= 0) {
        take(g, best);
        taken = true;
        break;
      }
    }
    // 모든 묶음이 막혔으면(떨어진 섬) 남은 칸을 가장 가까운 씨앗의 묶음에 준다.
    if (!taken) {
      const i = claim.indexOf(-1);
      let g = 0;
      seeds.forEach((seed, k) => {
        if (
          distance2(cells[i], cells[seed]) <
          distance2(cells[i], cells[seeds[g]])
        )
          g = k;
      });
      take(g, i);
    }
    left--;
  }
  return { seeds, regions };
}

// 중심 노드는 제 자리(씨앗)에, 이어진 노드는 그 묶음 영역 안에 고르게 앉혀 누르면 한쪽이 한꺼번에 밝아지게 한다.
export function layoutGraph3d(data: GraphData) {
  const random = seeded(183303);
  const cells = silhouetteCells();
  const degree = nodeDegrees(data);
  const groups = communities(data, degree);
  const { seeds, regions } = claimRegions(cells, groups);
  const width = Math.max(...whaleSilhouette.map((row) => row.length));
  const height = whaleSilhouette.length;
  const maxDepth = Math.max(...cells.map((cell) => cell.depth));
  const result = new Map<string, Point3>();
  // 앞뒤 높이는 가장자리까지 거리로 부풀린 둥근 몸(원 단면)을 따른다.
  const place = (id: string, cell: Cell, side: number, spread: number) => {
    const inner = 1 - cell.depth / maxDepth;
    const bulge =
      Math.sqrt(1 - inner * inner) *
      THICKNESS *
      (cell.wave ? WAVE_THICKNESS : 1);
    result.set(id, [
      (cell.x - width / 2 + (random() - 0.5) * 0.8) * CELL,
      (height / 2 - cell.y + (random() - 0.5) * 0.8) * CELL,
      side * bulge * spread,
    ]);
  };
  groups.forEach((group, g) => {
    const hubCell = cells[seeds[g]];
    // 중심 노드는 이름표가 잘 보이도록 몸 앞면에 둔다.
    if (group.hub) place(group.hub, hubCell, 1, 1);
    const members = group.members
      .filter((id) => id !== group.hub)
      .sort(
        (a, b) =>
          (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b),
      );
    // 영역 칸을 곡선 순서로 늘어놓고(테두리는 무겁게) 같은 무게 간격으로 노드를 앉힌다.
    const region = regions[g]
      .filter((i) => i !== seeds[g] || !group.hub)
      .map((i) => cells[i])
      .sort((a, b) => a.order - b.order);
    if (!region.length) region.push(hubCell);
    const weights = region.map((cell) => (cell.depth === 1 ? EDGE_WEIGHT : 1));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = 0;
    let acc = weights[0];
    members.forEach((id, index) => {
      const goal = ((index + 0.5) * total) / members.length;
      while (acc < goal && cursor < region.length - 1) acc += weights[++cursor];
      place(id, region[cursor], index % 2 ? 1 : -1, 0.75 + random() * 0.25);
    });
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
