// 실제 클라이언트를 통과하는 가짜 Ollama와 OOD 근거 묶음을 만든다
import { readFileSync } from "node:fs";
import type { Forecast } from "@crowdcast/contracts/types";
import type { DraftText } from "../src/team/report/bundle.js";
import { templateTexts } from "../src/team/report/templates.js";
import { fakeForecastFetch } from "../src/team/runtime/fake-forecast.js";
import { REVIEW_NOTICE } from "../src/team/verification/skeptic.js";
import { type Call, extracted, teamFixture } from "./team-fixture.js";

// 수치가 고정된 영종 예시를 읽어 문장 검증만 시험한다
export function reportForecast(): Forecast {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/services/forecast.json", import.meta.url),
      "utf8",
    ),
  );
}

// OOD 상태를 결정하지 않고 테스트에서 받은 플래그에 대응하는 검사 근거를 제공한다
export function oodForecast(forecast: Forecast, withEvidence = true) {
  forecast.ood = true;
  forecast.oodReasons = ["유형·규모 조합의 학습 표본 부족"];
  if (withEvidence)
    forecast.evidence.push({
      id: `ev-${forecast.id}-ood`,
      kind: "check",
      title: REVIEW_NOTICE,
      summary: JSON.stringify({ reasons: forecast.oodReasons }),
      quantityIds: [],
      period: null,
      source: null,
      availableAt: null,
      ruleId: null,
      clauseId: null,
      caseEventId: null,
      assumptionId: null,
      forecastId: forecast.id,
      modelVersion: null,
      checkResult: { checkKind: "ood", passed: true, revision: 0 },
    });
  return forecast;
}

type Options = {
  rewrite?: (claims: DraftText[], attempt: number) => DraftText[];
  forecast?: (forecast: Forecast) => Forecast;
  override?: (call: Call) => Promise<Response | undefined>;
  deadlineMs?: number;
};

// SDK의 실제 chat 요청을 읽어 초안만 변형하고 호출 횟수를 관찰한다
export function explanationFixture(options: Options = {}) {
  let attempts = 0;
  let forecast: Forecast;
  const harness = teamFixture({
    env: { LLM_MODE: "ollama" },
    deadlineMs: options.deadlineMs,
    override: async (call) => {
      const overridden = await options.override?.(call);
      if (overridden) return overridden;
      const { url, body } = call;
      if (url.pathname === "/v1/predict") {
        const response = await fakeForecastFetch(url, {
          method: "POST",
          body: JSON.stringify(body),
        });
        forecast = await response.json();
        forecast = options.forecast?.(forecast) ?? forecast;
        return Response.json(forecast);
      }
      if (url.pathname !== "/api/chat") return;
      const request = body as { messages: { content: string }[] };
      const input = JSON.parse(request.messages[1].content) as {
        factors?: unknown[];
      };
      const drafts = input.factors
        ? templateTexts(forecast)
            .filter((claim) => claim.claimType === "요인")
            .slice(0, 3)
        : [];
      if (input.factors) attempts++;
      const content = input.factors
        ? {
            claims: options.rewrite?.(drafts, attempts) ?? drafts,
          }
        : extracted;
      return Response.json({
        message: { role: "assistant", content: JSON.stringify(content) },
        done: true,
        done_reason: "stop",
        load_duration: 0,
        eval_count: 120,
      });
    },
  });
  return { ...harness, attempts: () => attempts };
}
