// 건물 종류별 벽 한 칸 그림 — 낮에는 창·발코니·벽돌·유리 무늬, 밤에는 불 켜진 창만 빛나게 한다.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import type { BuildingKind } from "./building-kind";

type Rect = [number, number, number, number];
type Pattern = {
  // 한 칸의 실제 크기(m) — 벽 UV가 미터 단위라 반복 횟수로 바로 쓴다(층 높이는 과장 1.4배 반영).
  cell: [number, number];
  // 64×64 칸 안의 창(유리) 자리.
  windows: Rect[];
  // 유리를 칠하기 전 벽 무늬(벽돌 줄눈·골판 등)와 유리 위 덧그림(난간·창살).
  under?: (context: CanvasRenderingContext2D) => void;
  over?: (context: CanvasRenderingContext2D) => void;
  // 칸 전체가 유리인 오피스는 벽 대신 유리색을 먼저 깐다.
  glassWall?: boolean;
};

// 창 아래 그늘 한 줄로 입체감을 준다.
const sill =
  (y: number, x = 0, width = 64) =>
  (context: CanvasRenderingContext2D) => {
    context.fillStyle = "rgba(0,0,0,0.12)";
    context.fillRect(x, y, width, 3);
  };

const PATTERNS: Record<BuildingKind, Pattern> = {
  // 판상형 아파트: 칸 가득한 발코니 창 두 짝, 흰 난간 띠와 층 사이 그늘이 가로 줄무늬를 만든다.
  apartment: {
    cell: [3, 4.2],
    windows: [
      [3, 14, 28, 26],
      [33, 14, 28, 26],
    ],
    over: (context) => {
      context.fillStyle = "rgba(250,250,246,0.95)";
      context.fillRect(0, 31, 64, 3);
      context.fillStyle = "rgba(0,0,0,0.10)";
      context.fillRect(0, 42, 64, 4);
    },
  },
  // 유리 커튼월: 칸 전체가 유리, 밝은 세로 멀리언과 층 사이 띠.
  office: {
    cell: [3.6, 4.2],
    glassWall: true,
    windows: [[3, 3, 58, 47]],
    over: (context) => {
      context.fillStyle = "rgba(255,255,255,0.55)";
      context.fillRect(0, 0, 2, 64);
      context.fillStyle = "rgba(255,255,255,0.32)";
      context.fillRect(0, 52, 64, 12);
    },
  },
  // 벽돌 빌라: 엇갈린 벽돌 줄눈 위에 흰 창틀 두른 작은 창.
  villa: {
    cell: [3.2, 4.2],
    windows: [[18, 17, 28, 22]],
    under: (context) => {
      context.fillStyle = "rgba(0,0,0,0.13)";
      for (let row = 0; row < 8; row++) {
        context.fillRect(0, row * 8 + 7, 64, 1);
        for (let x = row % 2 ? 8 : 0; x < 64; x += 16)
          context.fillRect(x, row * 8, 1, 7);
      }
      context.fillStyle = "#fbfbf8";
      context.fillRect(15, 14, 34, 28);
    },
    over: sill(42, 15, 34),
  },
  // 단독주택: 넓은 흰 벽에 작은 창 하나.
  house: {
    cell: [4, 4.2],
    windows: [[22, 20, 20, 18]],
    over: sill(38, 20, 24),
  },
  // 상가: 가운데 중간 크기 창(1층 간판은 따로 붙인다).
  shop: {
    cell: [3.6, 4.2],
    windows: [[13, 16, 38, 30]],
    over: sill(46, 13, 38),
  },
  // 학교·병원: 칸을 거의 채운 넓은 창에 흰 창살 두 줄.
  school: {
    cell: [3.6, 4.2],
    windows: [[4, 14, 56, 30]],
    over: (context) => {
      context.fillStyle = "rgba(250,250,246,0.9)";
      context.fillRect(22, 14, 2, 30);
      context.fillRect(41, 14, 2, 30);
      sill(44)(context);
    },
  },
  // 공장·창고: 세로 골판 무늬에 위쪽 가는 채광창 띠.
  factory: {
    cell: [4, 4.2],
    windows: [[0, 6, 64, 7]],
    under: (context) => {
      context.fillStyle = "rgba(0,0,0,0.09)";
      for (let x = 0; x < 64; x += 6) context.fillRect(x, 0, 2, 64);
    },
  },
};

// 흰 벽(벽 색은 정점 색이 곱해진다) 위에 종류별 창을 그린다. lit이면 창만 흰색인 발광용 그림.
export function windowTexture(kind: BuildingKind, glass: string, lit = false) {
  const pattern = PATTERNS[kind];
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = lit ? "#000000" : pattern.glassWall ? glass : "#ffffff";
    context.fillRect(0, 0, 64, 64);
    if (!lit) pattern.under?.(context);
    context.fillStyle = lit ? "#ffffff" : glass;
    for (const [x, y, width, height] of pattern.windows)
      context.fillRect(x, y, width, height);
    if (!lit) pattern.over?.(context);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / pattern.cell[0], 1 / pattern.cell[1]);
  if (!lit) texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
