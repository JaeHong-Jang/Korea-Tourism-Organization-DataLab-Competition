// 실제 시청 좌표와 경계 원본으로 투영 거리와 모든 클릭 코드 범위를 검증한다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Topology } from "topojson-specification";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildLandModel, codeForFace } from "../land-tiles";
import { projectKorea } from "../projection";

// 작업 트리의 공용 데이터 경로를 Git 메타데이터에서 찾는다.
function boundaryPath(): string {
  const worktrees = execFileSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  const main = worktrees.match(/^worktree (.+)$/m)?.[1];
  if (!main) throw new Error("공용 경계 데이터 경로를 찾을 수 없습니다.");
  return join(main, "data/external/boundaries/sigungu.topo.json");
}

// 테스트에서는 계약 토큰의 색만 흉내 내고 실제 원본 경계를 사용한다.
beforeAll(() => {
  const tokens = readFileSync(
    join(process.cwd(), "../../packages/contracts/design-tokens.css"),
    "utf8",
  );
  vi.stubGlobal("document", { documentElement: {} });
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: (name: string) =>
      tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1] ?? "",
  }));
});

afterAll(() => vi.unstubAllGlobals());

describe("미니 대한민국 투영과 타일", () => {
  // 서울·부산 시청의 투영상 거리는 약 325km여야 한다.
  it("시청 사이 거리를 km 단위로 유지한다", () => {
    const seoul = projectKorea(126.978, 37.5665);
    const busan = projectKorea(129.0756, 35.1796);
    expect(
      Math.hypot(seoul[0] - busan[0], seoul[1] - busan[1]),
    ).toBeGreaterThan(325 * 0.95);
    expect(Math.hypot(seoul[0] - busan[0], seoul[1] - busan[1])).toBeLessThan(
      325 * 1.05,
    );
  });

  // 252개 경계가 병합 뒤에도 서로 다른 면 인덱스로 선택된다.
  it("모든 시군구 코드를 면 범위에서 다시 찾는다", () => {
    const topology = JSON.parse(
      readFileSync(boundaryPath(), "utf8"),
    ) as Topology;
    const model = buildLandModel(topology);
    const codes = model.tiles.flatMap((tile) =>
      tile.faces.map((range) => codeForFace(tile.faces, range.start)),
    );
    expect(codes).toHaveLength(252);
    expect(new Set(codes).size).toBe(252);
    expect(model.centers.size).toBe(252);
    let largestTriangle = 0;
    for (const tile of model.tiles) {
      const positions = tile.geometry.getAttribute("position");
      for (let vertex = 0; vertex < positions.count; vertex += 3) {
        const ax = positions.getX(vertex);
        const ay = positions.getY(vertex);
        const bx = positions.getX(vertex + 1);
        const by = positions.getY(vertex + 1);
        const cx = positions.getX(vertex + 2);
        const cy = positions.getY(vertex + 2);
        largestTriangle = Math.max(
          largestTriangle,
          Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2,
        );
      }
    }
    expect(largestTriangle).toBeLessThan(10000);
    model.tiles.forEach((tile) => {
      tile.geometry.dispose();
    });
  });
});
