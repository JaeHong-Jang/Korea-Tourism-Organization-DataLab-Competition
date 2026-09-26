// 대학 행사의 무대와 현수막 형상을 정의한다.
import { block } from "./model-part";

// 두 기둥에 걸린 현수막으로 공연 모형과 구분한다.
export const universityParts = [
  block([0, 2.9, 0], [3.5, 0.3, 2.4], "stage"),
  ...[-1.65, 1.65].map((x) =>
    block([x, 4.15, -0.6], [0.14, 2.3, 0.14], "metal"),
  ),
  block([0, 4.8, -0.6], [3.3, 0.7, 0.12], "banner"),
];
