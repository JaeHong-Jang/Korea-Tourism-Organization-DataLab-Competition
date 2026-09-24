// 꽃 행사의 화단과 꽃 장식 형상을 정의한다.
import { block, spire } from "./model-part";

// 여섯 꽃 장식을 낮은 화단 위에 놓는다.
export const flowerParts = [
  block([0, 2.85, 0], [3.7, 0.3, 3.2], "bed"),
  ...[-1, 0, 1].flatMap((x) =>
    [-0.8, 0.8].map((z) => spire([x, 3.25, z], [0.35, 0.6, 6], "bloom")),
  ),
];
