// 공연 행사의 무대와 양쪽 조명탑 형상을 정의한다.
import { block } from "./model-part";

// 높은 조명탑으로 공연장을 멀리서도 구분한다.
export const performanceParts = [
  block([0, 2.9, 0], [3.6, 0.35, 2.2], "stage"),
  block([0, 4.4, -0.9], [3.6, 0.2, 0.5], "roof"),
  ...[-2, 2].flatMap((x) => [
    block([x, 4.1, 0], [0.18, 2.5, 0.18], "metal"),
    block([x, 5.2, 0.3], [0.6, 0.35, 0.4], "canvas"),
  ]),
];
