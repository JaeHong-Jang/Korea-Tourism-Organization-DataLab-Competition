// 시나리오를 순차 요청하고 앞서 발행한 세션·카드를 후속 요청에 전달한다
import type { ForecastCard, ForecastReport } from "@crowdcast/contracts/types";
import { contractRegistry } from "../src/contract/registry.js";
import { eventData, scoreScenario } from "./scenario-score.js";
import { readScenarioStream } from "./scenario-stream.js";
import type { Scenario, ScenarioSample } from "./scenario-types.js";

const validateReport = contractRegistry.compile<ForecastReport>({
  $ref: "https://crowdcast.local/schemas/forecast-report.schema.json",
});

// 세션 생성과 예보서 조회에도 본문 읽기를 포함한 마감을 적용한다
async function requestJson(
  fetcher: typeof fetch,
  url: string,
  method = "GET",
): Promise<unknown> {
  const response = await fetcher(url, {
    method,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`평가 보조 요청 HTTP ${response.status}`);
  }
  return response.json();
}

// 질문 정답을 임의 보충하지 않고 JSONL에 명시된 위험 확인 답만 한 번 전송한다
export async function measureScenarios(
  cases: Scenario[],
  fetcher: typeof fetch,
  base: string,
  progress: (id: string, passed: boolean) => void = () => {},
) {
  const samples: ScenarioSample[] = [];
  for (const item of cases) {
    const parent = samples.find((sample) => sample.id === item.parent);
    const parentEvents =
      parent?.turns.flatMap((turn) =>
        turn.events.map((value) => value.envelope),
      ) ?? [];
    const sample: ScenarioSample = {
      id: item.id,
      sessionId: null,
      parentForecastId: null,
      priorCard: null,
      report: null,
      turns: [],
      problems: [],
    };
    samples.push(sample);
    try {
      if (item.parent) {
        const done = eventData<{ forecastId: string | null }>(
          parentEvents,
          "done",
        ).at(-1);
        if (
          !parent?.sessionId ||
          !done?.forecastId ||
          !eventData(parentEvents, "claim").length
        )
          throw new Error(`선행 사례 ${item.parent}의 발행 세션이 없습니다`);
        sample.sessionId = parent.sessionId;
        sample.parentForecastId = done.forecastId;
        sample.priorCard =
          eventData<ForecastCard>(parentEvents, "forecast")[0] ?? null;
        sample.report = parent.report;
      } else {
        const response = (await requestJson(
          fetcher,
          `${base}/api/team/sessions`,
          "POST",
        )) as { sessionId?: unknown };
        if (
          typeof response.sessionId !== "string" ||
          !/^s-[a-z0-9_.:-]+$/.test(response.sessionId)
        )
          throw new Error("상담 세션 응답 계약 위반");
        sample.sessionId = response.sessionId;
      }
      const url = `${base}/api/team/sessions/${encodeURIComponent(sample.sessionId)}/messages`;
      const first = await readScenarioStream(fetcher, url, { text: item.text });
      sample.turns.push(first);
      const asking = first.events.some(
        (value) => value.envelope.event === "ask",
      );
      if (item.answer && asking && !first.problems.length)
        sample.turns.push(
          await readScenarioStream(fetcher, url, {
            text: "위험요소를 확인했어요.",
            answer: item.answer,
          }),
        );

      // 지연 측정이 끝난 뒤 예보서를 읽어 카드에 없는 basis만 보충하고 원시 결과에 보존한다
      const last =
        sample.turns.at(-1)?.events.map((value) => value.envelope) ?? [];
      const id = eventData<{ forecastId: string | null }>(last, "done").at(
        -1,
      )?.forecastId;
      if (id && !item.parent) {
        const report = await requestJson(
          fetcher,
          `${base}/api/forecasts/${encodeURIComponent(id)}`,
        );
        if (!validateReport(report)) throw new Error("발행 예보서 계약 위반");
        sample.report = report;
      }
    } catch (error) {
      sample.problems.push(
        error instanceof Error ? error.message : "평가 요청 실패",
      );
    }
    progress(item.id, scoreScenario(item, sample).passed);
  }
  return samples;
}
