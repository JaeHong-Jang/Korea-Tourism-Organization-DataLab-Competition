// 실제 라우트를 통과한 가짜 스트림과 변조 스트림으로 평가기의 오탐·누락을 검사한다
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Claim, ForecastCard } from "@crowdcast/contracts/types";
import { beforeAll, describe, expect, it } from "vitest";
import {
  runScenarioEval,
  scenarioOptions,
} from "../evals/run-scenario-eval.js";
import {
  loadScenarios,
  materializeScenario,
  readScenarios,
} from "../evals/scenario-cases.js";
import { createScenarioFake } from "../evals/scenario-fake.js";
import { measureScenarios } from "../evals/scenario-measure.js";
import {
  latencySummary,
  summarizeScenarios,
} from "../evals/scenario-report.js";
import { eventData, scoreScenario } from "../evals/scenario-score.js";
import type { Scenario, ScenarioSample } from "../evals/scenario-types.js";

let cases: Scenario[];
let samples: ScenarioSample[];
beforeAll(async () => {
  cases = (await loadScenarios()).cases.map((item) =>
    materializeScenario(item, "2026-09-25"),
  );
  samples = await measureScenarios(
    cases,
    createScenarioFake(cases).fetcher,
    "http://127.0.0.1",
  );
});

// 숫자가 있는 발행 사례를 복제해 각 위반이 다른 검사에 영향을 주지 않게 한다
function publishedSample() {
  const sample = structuredClone(samples[4]);
  const events = sample.turns[0].events.map((item) => item.envelope);
  const claim = eventData<Claim>(events, "claim").find(
    (item) => item.placeholders.length > 0,
  );
  if (!claim) throw new Error("수치 발행 픽스처가 없습니다");
  return { sample, events, claim };
}

describe("시나리오 평가", () => {
  it("23개를 실제 게이트웨이 SSE로 실행하고 후속은 앞 발행 세션을 쓴다", () => {
    const scores = cases.map((item, index) =>
      scoreScenario(item, samples[index]),
    );
    expect(scores.flatMap((score) => score.problems)).toEqual([]);
    const summary = summarizeScenarios(scores);
    expect(summary).toMatchObject({
      total: 23,
      passed: 23,
      numberMismatches: 0,
      unlinkedClaims: 0,
      llmCalls: 0,
    });
    expect(summary.claims).toBeGreaterThan(0);
    expect(samples[15].sessionId).toBe(samples[0].sessionId);
    expect(samples[17].sessionId).toBe(samples[2].sessionId);
    expect(summary.latency.forecast.n).toBe(12);
    expect(summary.latency.publishedDone.n).toBe(13);
  });

  it("게이트웨이의 number 통과 표시가 있어도 변조된 rendered를 독립 검산한다", () => {
    const { sample, claim } = publishedSample();
    claim.rendered = claim.rendered?.replace("12,000", "13,000") ?? null;
    expect(
      claim.checks.some(
        (check) => check.checkKind === "number" && check.passed,
      ),
    ).toBe(true);
    const score = scoreScenario(cases[4], sample);
    expect(score.checks.numbers).toBe(false);
    expect(score.numberProblems.join()).toContain("표시 13000");
  });

  it("카드의 알려진 다른 분위수로 바꾼 숫자도 오답이다", () => {
    const { sample, claim } = publishedSample();
    claim.rendered = claim.rendered?.replace("12,000", "35,000") ?? null;
    expect(scoreScenario(cases[4], sample).checks.numbers).toBe(false);
  });

  it("단위 변조와 근거 없는 수치 인용을 거부한다", () => {
    const { sample, claim } = publishedSample();
    claim.text = claim.text.replace("명", "원");
    claim.rendered = claim.rendered?.replace("명", "원") ?? null;
    claim.evidenceIds = [];
    expect(scoreScenario(cases[4], sample).checks).toMatchObject({
      numbers: false,
      evidence: false,
    });
  });

  it("발행 게이트 순서 위반과 done 뒤 이벤트를 잡는다", () => {
    const { sample } = publishedSample();
    const events = sample.turns[0].events;
    const gate = events.findIndex((item) => item.envelope.event === "gate");
    const card = events.findIndex((item) => item.envelope.event === "forecast");
    [events[gate], events[card]] = [events[card], events[gate]];
    events.push(structuredClone(events[0]));
    expect(scoreScenario(cases[4], sample).sequenceProblems.join()).toContain(
      "게이트 A 통과 전에 숫자 카드",
    );
    expect(scoreScenario(cases[4], sample).sequenceProblems.join()).toContain(
      "done 뒤에 이벤트",
    );
  });

  it("되묻기의 빠진 필드·추가 필드를 정확히 비교한다", () => {
    const sample = structuredClone(samples[12]);
    const ask = sample.turns[0].events.find(
      (item) => item.envelope.event === "ask",
    );
    if (!ask) throw new Error("되묻기가 없습니다");
    (ask.envelope.data as { field: string }).field = "type";
    expect(scoreScenario(cases[12], sample).checks.ask).toBe(false);
  });

  it("구간 카드의 확률 표시와 전송하지 않은 근거를 거부한다", () => {
    const { sample, events } = publishedSample();
    eventData<ForecastCard>(events, "forecast")[0].probabilities[0].display =
      "99%";
    sample.turns[0].events = sample.turns[0].events.filter(
      (item) => item.envelope.event !== "evidence",
    );
    expect(scoreScenario(cases[4], sample).checks).toMatchObject({
      interval: false,
      evidence: false,
    });
  });

  it("부분 수신·연결 실패를 성공으로 처리하지 않고 후속 실패도 남긴다", async () => {
    const failed = await measureScenarios(
      cases,
      async () => {
        throw new Error("연결 차단");
      },
      "http://127.0.0.1",
    );
    expect(failed).toHaveLength(23);
    expect(
      failed.every(
        (sample, index) => !scoreScenario(cases[index], sample).passed,
      ),
    ).toBe(true);
    expect(failed[15].problems.join()).toContain("선행 사례");
  });

  it("분류만 맞고 저장은 실패한 후속 요청을 통과시키지 않는다", () => {
    const sample = structuredClone(samples[16]);
    sample.turns[0].events = sample.turns[0].events.filter(
      (item) =>
        (item.envelope.data as { note?: string }).note !==
        "예보서를 저장했어요",
    );
    expect(scoreScenario(cases[16], sample).checks.execution).toBe(false);
  });

  it("빈 지연과 최근접 순위, 상대 출력 및 셸 중괄호 확장을 처리한다", () => {
    expect(latencySummary([])).toEqual({ n: 0, p50: null, p95: null });
    expect(latencySummary([50, 10, 40, 20, 30])).toEqual({
      n: 5,
      p50: 30,
      p95: 50,
    });
    expect(
      scenarioOptions([
        "--fake",
        "--out",
        "reports/evals/test.json",
        "reports/evals/test.md",
      ]).markdownFile,
    ).toBe(
      fileURLToPath(new URL("../../../reports/evals/test.md", import.meta.url)),
    );
    expect(scenarioOptions(["--fake"]).jsonFile).toMatch(/-fake.json$/);
    expect(() => scenarioOptions([])).toThrow("--base");
  });

  // 가짜 실행의 전체 결과를 별도 최신 파일에 쓰고 임시 파일을 남기지 않는다
  it("시나리오 실행이 최신 평가를 원자 갱신하며 fake 모드를 기록한다", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "crowdcast-scenario-latest-"),
    );
    const latestFile = join(directory, "latest.json");
    try {
      const artifact = await runScenarioEval(
        ["--fake", "--out", join(directory, "scenario.json")],
        latestFile,
      );
      const latest = JSON.parse(await readFile(latestFile, "utf8"));
      expect(latest).toEqual({ ...artifact, mode: "fake" });
      expect(await readdir(directory)).toEqual([
        "latest.json",
        "scenario.json",
        "scenario.md",
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("사례 중복·20개 구성과 자료 경계 날짜를 검증한다", async () => {
    const { contents, cases: definitions } = await loadScenarios();
    expect(readScenarios(contents)).toHaveLength(23);
    expect(() =>
      readScenarios(`${contents}${contents.split("\n")[0]}`),
    ).toThrow("20개");
    expect(() => materializeScenario(definitions[10], "2026-10-05")).toThrow(
      "10/18",
    );
    expect(materializeScenario(definitions[0], "2026-09-25").text).toContain(
      "2026년 9월 28일",
    );
  });
});
