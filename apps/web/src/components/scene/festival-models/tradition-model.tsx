// 전통 행사의 박공 지붕 천막 형상을 정의한다.
import { block } from "./model-part";

// 양쪽으로 경사진 지붕을 천막 위에 올린다.
export const traditionParts = [
  block([0, 3.25, 0], [3.2, 1.1, 2.4], "canvas"),
  block([-0.85, 4.1, 0], [2.15, 0.28, 2.9], "roof", [0, 0, 0.48]),
  block([0.85, 4.1, 0], [2.15, 0.28, 2.9], "roof", [0, 0, -0.48]),
];
