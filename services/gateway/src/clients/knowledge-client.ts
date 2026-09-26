// 근거 그래프의 근거 카드와 세션 검증 결과를 계약에 맞춰 읽는다

import { contractRegistry } from "../contract/registry.js";
import { responseListSchema, responseSchema } from "../contract/responses.js";
import {
  type SessionFacts,
  sessionRevisionSchema,
} from "../contract/session-facts.js";
import { requestJson, type ServiceClientOptions } from "./request-json.js";
import { factsRequestSchema } from "./request-schemas.js";

// 근거 한 건·목록·게이트 결과는 각각 해당 계약을 사용한다
const evidenceSchema = responseSchema("evidence");
const evidenceListSchema = responseListSchema("evidence");
const gateSchema = responseSchema("gate-report");
const masterVersionSchema = contractRegistry.compile<{ masterVersion: number }>(
  {
    type: "object",
    required: ["masterVersion"],
    properties: { masterVersion: { type: "integer", minimum: 1 } },
  },
);

// 적재·검증·발행 전송을 제공하고 발행 여부 판단은 다음 task의 팀장에게 맡긴다
export function createKnowledgeClient(options: ServiceClientOptions) {
  return {
    // 검증 전에 현재 기준 그래프 버전을 읽어 요청 범위를 고정한다
    getMasterVersion() {
      return requestJson(options, "/v1/master/version", masterVersionSchema, {
        method: "GET",
      });
    },
    // 식별자를 경로 한 조각으로 인코딩해 근거 한 건을 요청한다
    getEvidence(id: string) {
      return requestJson(
        options,
        `/v1/evidence/${encodeURIComponent(id)}`,
        evidenceSchema,
        { method: "GET" },
      );
    },
    // 문장에 연결된 근거 카드 전체를 검증한다
    getClaimEvidence(id: string) {
      return requestJson(
        options,
        `/v1/claims/${encodeURIComponent(id)}/evidence`,
        evidenceListSchema,
        { method: "GET" },
      );
    },
    // 적재 거부의 gate-report를 검증해 호출자가 무결성 위반을 확인하게 한다
    addFacts(id: string, facts: SessionFacts) {
      return requestJson(
        options,
        `/v1/sessions/${encodeURIComponent(id)}/facts`,
        sessionRevisionSchema,
        {
          method: "POST",
          body: facts,
          bodySchema: factsRequestSchema,
          errorSchemas: { 422: gateSchema },
        },
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
        { method: "POST" },
      );
    },
    // 검증한 버전은 쿼리로만 보내고 본문 없는 발행 요청의 충돌 상태를 보존한다
    publishSession(id: string, revision: number, masterVersion: number) {
      const query = new URLSearchParams({
        revision: String(revision),
        masterVersion: String(masterVersion),
      });
      return requestJson(
        options,
        `/v1/sessions/${encodeURIComponent(id)}/publish?${query}`,
        gateSchema,
        { method: "POST" },
      );
    },
  };
}
