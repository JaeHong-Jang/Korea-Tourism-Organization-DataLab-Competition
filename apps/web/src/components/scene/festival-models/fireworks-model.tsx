// 불꽃 행사의 받침대와 발사관 형상을 정의한다.
import { block } from "./model-part";

// 기울기가 다른 세 발사관으로 불꽃 유형을 구분한다.
export const fireworksParts = [
  block([0, 2.9, 0], [3.5, 0.3, 2.6], "stage"),
  ...[-0.85, 0, 0.85].map((x) =>
    block([x, 3.7, 0], [0.34, 1.5, 0.34], "metal", [0, 0, x * 0.15]),
  ),
];
