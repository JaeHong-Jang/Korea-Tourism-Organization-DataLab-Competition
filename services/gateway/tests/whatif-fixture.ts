// 가짜 상류의 what-if 결과와 해설을 실제 상담 스트림에 연결한다
import type { Forecast } from "@crowdcast/contracts/types";
import { templateTexts } from "../src/team/report/templates.js";
import { fakeForecastFetch } from "../src/team/runtime/fake-forecast.js";
import { followupFixture, isClassification } from "./followup-fixture.js";
import type { Call } from "./team-fixture.js";

// 입력·식별자만 달라진 계약 수치를 반환하고 변경 전 스냅샷은 그대로 보관한다
export function whatifFixture(
  options: Parameters<typeof followupFixture>[0] = {},
) {
  let latest: Forecast | undefined;
  return followupFixture({
    ...options,
    override: async (call: Call) => {
      const override = await options.override?.(call);
      if (override) return override;
      // 실제 서비스 대신 계약 사례를 반환하되 변경된 요청 본문은 호출 기록에 남긴다
      if (call.url.pathname === "/v1/similar")
        return fakeForecastFetch(call.url, {
          method: "POST",
          body: JSON.stringify({ ...(call.body as object), type: "불꽃" }),
        });
      if (call.url.pathname === "/v1/whatif") {
        const response = await fakeForecastFetch(call.url, {
          method: "POST",
          body: JSON.stringify(call.body),
        });
        latest = (await response.json()) as Forecast;
        return Response.json(latest);
      }
      if (
        latest &&
        call.url.pathname === "/api/chat" &&
        !isClassification(call)
      )
        return Response.json({
          message: {
            role: "assistant",
            content: JSON.stringify({
              claims: templateTexts(latest)
                .filter((claim) => claim.claimType === "요인")
                .slice(0, 3),
            }),
          },
          done: true,
          done_reason: "stop",
          load_duration: 0,
          eval_count: 120,
        });
    },
  });
}

// T-208이 기본 보정 없음으로 응답하는 경우를 수치가 고정된 상류 픽스처로 나타낸다
export function withWeatherAssumption(forecast: Forecast) {
  forecast.assumptions.push({
    id: "as-weather-adjustment",
    name: "날씨 보정 배수",
    value: 1,
    low: 0.5,
    high: 1.2,
    unit: "배",
    basis: "가정",
    note: "과거 강수일 자료 없음 — 보정 없음",
  });
  return forecast;
}
