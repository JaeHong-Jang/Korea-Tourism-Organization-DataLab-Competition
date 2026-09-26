// 예측 서비스의 대시보드 조회를 계약 검증을 거쳐 반환한다
import {
  backtestSchema,
  datalabSpecSchema,
  festivalsSchema,
  freshnessSchema,
  insightSchema,
  modelCardSchema,
  preregistrationSchema,
  runsSchema,
} from "./query-schemas.js";
import { requestJson, type ServiceClientOptions } from "./request-json.js";

// 수치를 조립하지 않고 원래 순서와 null을 유지해 조회한다
export function createForecastQueries(options: ServiceClientOptions) {
  return {
    // 기간만 상류로 전달하고 지역·유형·단계 필터는 라우트에서 적용한다
    festivals(from?: string, to?: string) {
      const query = new URLSearchParams();
      if (from !== undefined) query.set("from", from);
      if (to !== undefined) query.set("to", to);
      return requestJson(
        options,
        `/v1/festivals/upcoming${query.size ? `?${query}` : ""}`,
        festivalsSchema,
        { method: "GET" },
      );
    },
    // 최신 백테스트의 표본·단위·근거 계약을 보존한다
    backtest() {
      return requestJson(options, "/v1/backtest/latest", backtestSchema, {
        method: "GET",
      });
    },
    // 취소·채점 불가 항목을 포함한 사전 등록 점수를 읽는다
    preregistration() {
      return requestJson(
        options,
        "/v1/preregistration/scores",
        preregistrationSchema,
        { method: "GET" },
      );
    },
    // 운영 상태와 검증 화면이 같은 모델 카드를 읽는다
    modelCard() {
      return requestJson(options, "/v1/model-card/latest", modelCardSchema, {
        method: "GET",
      });
    },
    // 인사이트 식별자를 경로 한 조각으로 인코딩한다
    insight(key: string) {
      return requestJson(
        options,
        `/v1/insights/${encodeURIComponent(key)}`,
        insightSchema,
        { method: "GET" },
      );
    },
    // 실제 사용 데이터셋 명세만 조회한다
    datalabSpec() {
      return requestJson(options, "/v1/datalab/spec", datalabSpecSchema, {
        method: "GET",
      });
    },
    // 파이프라인 실행 순서를 상류 응답 그대로 유지한다
    runs() {
      return requestJson(options, "/v1/runs", runsSchema, { method: "GET" });
    },
    // 수집되지 않은 값은 계약의 null 그대로 받는다
    freshness() {
      return requestJson(options, "/v1/ops/freshness", freshnessSchema, {
        method: "GET",
      });
    },
  };
}
