// 분석 결과의 revision·기준 그래프 버전을 고정해 게이트 A를 검사한다
import type { createKnowledgeClient } from "../../clients/knowledge-client.js";

export const ANALYSIS_SHAPES = "S03,S04,S05,S06,S07,S08,S09";

// 무결성·검증 범위 충돌은 일반 서비스 장애와 구분해 숫자 전송을 막는다
export class AnalysisGateError extends Error {}

// 응답이 다른 범위를 검사했다면 passed 값과 관계없이 거부한다
export async function analysisGate(
  knowledge: ReturnType<typeof createKnowledgeClient>,
  sessionId: string,
  revision: number,
) {
  const { masterVersion } = await knowledge.getMasterVersion();
  const gate = await knowledge.validateSession(
    sessionId,
    revision,
    masterVersion,
    ANALYSIS_SHAPES,
  );
  if (
    gate.gate !== "A" ||
    gate.revision !== revision ||
    gate.masterVersion !== masterVersion ||
    (gate.passed && gate.violations.length > 0)
  ) {
    throw new AnalysisGateError("분석 검증 범위가 일치하지 않습니다");
  }
  return gate;
}
