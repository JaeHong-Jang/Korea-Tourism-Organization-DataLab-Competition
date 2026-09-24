// 근거 그래프의 근거 카드와 세션 검증 결과를 계약에 맞춰 읽는다
import { responseListSchema, responseSchema } from "../contract/responses.js";
import { requestJson, type ServiceClientOptions } from "./request-json.js";

// 근거 한 건·목록·게이트 결과는 각각 해당 계약을 사용한다
const evidenceSchema = responseSchema("evidence");
const evidenceListSchema = responseListSchema("evidence");
const gateSchema = responseSchema("gate-report");

// 근거 조회와 검증 호출만 제공하고 발행 여부 판단은 다음 task의 팀장에게 맡긴다
export function createKnowledgeClient(options: ServiceClientOptions) {
  return {
    // 식별자를 경로 한 조각으로 인코딩해 근거 한 건을 요청한다
    getEvidence(id: string) {
      return requestJson(
        options,
        `/v1/evidence/${encodeURIComponent(id)}`,
        evidenceSchema,
      );
    },
    // 문장에 연결된 근거 카드 전체를 검증한다
    getClaimEvidence(id: string) {
      return requestJson(
        options,
        `/v1/claims/${encodeURIComponent(id)}/evidence`,
        evidenceListSchema,
      );
    },
    // 계약의 revision·masterVersion 쿼리를 전달하고 SHACL 결과를 그대로 반환한다
    validateSession(
      id: string,
      revision: number,
      masterVersion: number,
      shapes?: string,
    ) {
      const query = new URLSearchParams({
        revision: String(revision),
        masterVersion: String(masterVersion),
        ...(shapes === undefined ? {} : { shapes }),
      });
      return requestJson(
        options,
        `/v1/sessions/${encodeURIComponent(id)}/validate?${query}`,
        gateSchema,
        {},
      );
    },
  };
}
