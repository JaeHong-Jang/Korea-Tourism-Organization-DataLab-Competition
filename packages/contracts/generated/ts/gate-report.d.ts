/* 자동 생성 — packages/contracts/schemas에서 npm run contracts:gen 으로 만든다. 직접 고치지 않는다 */

/**
 * 게이트 A·B·발행 검사. 검증 범위 = 세션 revision + 기준 그래프 버전
 */
export interface GateReport {
  gate: "A" | "B" | "publish";
  passed: boolean;
  revision: number;
  masterVersion: number;
  violations: {
    check: "shacl" | "number" | "rule" | "uncertainty" | "integrity";
    shapeId: string | null;
    nodeId: string;
    message: string;
  }[];
}
