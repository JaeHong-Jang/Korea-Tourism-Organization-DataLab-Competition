// 기타 행사의 작은 광장 천막 형상을 정의한다.
import { block, spire } from "./model-part";

// 유형을 추정하지 않는 낮은 받침과 천막을 둔다.
export const otherParts = [
  block([0, 2.8, 0], [3, 0.2, 3], "bed"),
  block([0, 3.35, 0], [1.8, 0.9, 1.8], "canvas"),
  spire([0, 4.2, 0], [1.4, 0.9, 4], "roof"),
];
