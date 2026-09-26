// 먹거리 행사의 천막 줄 형상을 정의한다.
import { block, spire } from "./model-part";

// 세 천막의 지붕을 반복해 노점 줄을 나타낸다.
export const foodParts = [-1.2, 0, 1.2].flatMap((x) => [
  block([x, 3.1, 0], [1.05, 0.9, 1.25], "canvas"),
  spire([x, 4.02, 0], [0.83, 0.95, 4], "roof"),
]);
