// 근거 통계와 그래프 크기를 knowledge 조회 계약으로 검증한다
import { datalabUsageSchema, graphStatsSchema } from "./query-schemas.js";
import { requestJson, type ServiceClientOptions } from "./request-json.js";

// 통계 수치를 다시 계산하지 않고 knowledge 응답만 사용한다
export function createKnowledgeQueries(options: ServiceClientOptions) {
  return {
    // 데이터셋별 근거 수와 문장 연결 통계를 읽는다
    datalabUsage() {
      return requestJson(
        options,
        "/v1/stats/datalab-usage",
        datalabUsageSchema,
        { method: "GET" },
      );
    },
    // 기준 그래프 버전과 세션 그래프 크기를 읽는다
    graphStats() {
      return requestJson(options, "/v1/stats/graph", graphStatsSchema, {
        method: "GET",
      });
    },
  };
}
