// 항목별 분모·실패 원인·지연과 실행 조건을 재검산 가능한 보고서로 표시한다
import type { observeConditions } from "./scenario-conditions.js";
import type {
  Scenario,
  ScenarioSample,
  ScenarioScore,
} from "./scenario-types.js";

export type ScenarioArtifact = {
  measuredAt: string;
  evaluationDate: string;
  mode: "가짜" | "실제";
  base: string;
  casesSha256: string;
  conditionsBefore: Awaited<ReturnType<typeof observeConditions>>;
  conditionsAfter: Awaited<ReturnType<typeof observeConditions>>;
  cases: Scenario[];
  samples: ScenarioSample[];
  scores: ScenarioScore[];
  summary: ReturnType<typeof summarizeScenarios>;
};

// 작은 표본에서도 정렬 순위가 재현되는 최근접 순위 백분위를 사용한다
export function latencySummary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (q: number) =>
    sorted.length ? sorted[Math.ceil(sorted.length * q) - 1] : null;
  return { n: sorted.length, p50: percentile(0.5), p95: percentile(0.95) };
}

// 무발행 사례의 빈 문장 검사가 근거 연결률 분모를 늘리지 않게 분리한다
export function summarizeScenarios(scores: ScenarioScore[]) {
  const keys = [
    "sequence",
    "evidence",
    "numbers",
    "interval",
    "ask",
    "intent",
    "publication",
    "execution",
  ] as const;
  const checks = Object.fromEntries(
    keys.map((key) => [
      key,
      {
        passed: scores.filter((score) => score.checks[key]).length,
        total: scores.length,
      },
    ]),
  );
  const sum = (
    field:
      | "claims"
      | "linkedClaims"
      | "matchedNumberClaims"
      | "numericTokens"
      | "llmCalls",
  ) => scores.reduce((value, score) => value + score[field], 0);
  const askTargets = scores.filter((score) => score.expected.askFields.length);
  const followupTargets = scores.filter(
    (score) => score.category === "followup",
  );
  const scopeTargets = scores.filter(
    (score) => score.category === "out_of_scope",
  );
  return {
    passed: scores.filter((score) => score.passed).length,
    total: scores.length,
    checks,
    askAccuracy: {
      passed: askTargets.filter((score) => score.checks.ask).length,
      total: askTargets.length,
    },
    followupIntentAccuracy: {
      passed: followupTargets.filter((score) => score.checks.intent).length,
      total: followupTargets.length,
    },
    scopeAccuracy: {
      passed: scopeTargets.filter((score) => score.passed).length,
      total: scopeTargets.length,
    },
    claims: sum("claims"),
    linkedClaims: sum("linkedClaims"),
    matchedNumberClaims: sum("matchedNumberClaims"),
    numericTokens: sum("numericTokens"),
    numberMismatches: scores.reduce(
      (value, score) => value + score.numberProblems.length,
      0,
    ),
    unlinkedClaims: sum("claims") - sum("linkedClaims"),
    llmCalls: sum("llmCalls"),
    models: [...new Set(scores.flatMap((score) => score.models))],
    latency: {
      forecast: latencySummary(
        scores.flatMap((score) =>
          score.latency.forecastMs === null ? [] : [score.latency.forecastMs],
        ),
      ),
      publishedDone: latencySummary(
        scores.flatMap((score) =>
          score.latency.publishedDoneMs === null
            ? []
            : [score.latency.publishedDoneMs],
        ),
      ),
      excludedAsking: scores.filter((score) => score.latency.excludedAsking)
        .length,
    },
  };
}

// 줄바꿈과 표 구분자를 정리해 오류 원인이 표 구조를 깨지 않게 한다
function cell(value: unknown) {
  return String(value).replace(/[\r\n|]/g, " ");
}

// 가짜 평가에는 실서비스 성능으로 오인할 수 없게 제목과 조건에 반복 표기한다
export function renderScenarioReport(artifact: ScenarioArtifact): string {
  const { summary } = artifact;
  const labels: Record<string, string> = {
    sequence: "SSE 순서",
    evidence: "근거 연결",
    numbers: "독립 숫자 검산",
    interval: "구간 % 금지",
    ask: "되묻기 필드",
    intent: "후속 의도",
    publication: "발행 기대",
    execution: "요청·행동 완료",
  };
  const lines = [
    `# T-308 예보팀 시나리오 평가 — ${artifact.mode}`,
    "",
    "참고용 — 평가 시나리오는 개발팀이 만든 것",
    "",
    "실제 행사명·지명을 사용한 가상 요청이며 일정·위험요소는 실제 개최 정보가 아니다. 위험 2개는 새 예보 12개에 포함한다(새 예보 12 + 필수값 질문 3 + 후속 3 + 범위 밖 2 = 20).",
    artifact.mode === "가짜"
      ? "가짜 서비스·녹화 LLM + 실제 게이트웨이 라우트/SSE. 계약 수치를 재사용한 기능 검사이며 실제 예측 정확도·SHACL 전체 검증·모델 속도를 뜻하지 않는다."
      : "이미 실행 중인 게이트웨이 HTTP SSE를 측정했다. 모델은 agent_step.usedLlm의 실제 기록이다.",
    "",
    `- 평가일: ${artifact.evaluationDate}; 시작: ${artifact.measuredAt}`,
    `- 대상: ${artifact.base}`,
    `- 사례 SHA256: ${artifact.casesSha256}`,
    `- 모델: ${summary.models.join(", ") || "실제 호출 기록 없음"}`,
    `- Ollama 시작: ${cell(artifact.conditionsBefore.ollama.status)} (${artifact.conditionsBefore.ollama.loadedModels.join(", ") || "목록 없음"})`,
    `- Ollama 종료: ${cell(artifact.conditionsAfter.ollama.status)} (${artifact.conditionsAfter.ollama.loadedModels.join(", ") || "목록 없음"})`,
    `- 실행 위치: ${cell(JSON.stringify(artifact.conditionsBefore.location))}`,
    "",
    "| 항목 | 통과/전체 |",
    "|---|---:|",
    `| 시나리오 | ${summary.passed}/${summary.total} |`,
    ...Object.entries(summary.checks).map(
      ([key, value]) =>
        `| ${labels[key]} (사례) | ${value.passed}/${value.total} |`,
    ),
    `| 발행 문장 근거 연결 | ${summary.linkedClaims}/${summary.claims} |`,
    `| 발행 문장 숫자 검산 | ${summary.matchedNumberClaims}/${summary.claims} |`,
    `| 되묻기 대상 적중 | ${summary.askAccuracy.passed}/${summary.askAccuracy.total} |`,
    `| why·save·draft 의도 적중 | ${summary.followupIntentAccuracy.passed}/${summary.followupIntentAccuracy.total} |`,
    `| 범위 밖 안내 | ${summary.scopeAccuracy.passed}/${summary.scopeAccuracy.total} |`,
    "",
    `근거 없는 발행 ${summary.unlinkedClaims}개 · 숫자 위반 ${summary.numberMismatches}건 · 렌더 숫자 토큰 ${summary.numericTokens}개 · LLM 사용 단계 ${summary.llmCalls}회.`,
    "LLM 호출 수는 usedLlm=true인 agent_step 수로 집계한다. 재시도 내부 호출 횟수는 이 계약에서 관찰할 수 없다.",
    "",
    "| 첫 요청 시작 → | n | p50(ms) | p95(ms) |",
    "|---|---:|---:|---:|",
    ...(
      [
        ["forecast 카드", summary.latency.forecast],
        ["done (새 예보·why 문장 발행)", summary.latency.publishedDone],
      ] as const
    ).map(
      ([name, value]) =>
        `| ${name} | ${value.n} | ${value.p50?.toFixed(1) ?? "—"} | ${value.p95?.toFixed(1) ?? "—"} |`,
    ),
    "",
    `되묻기 발생·기대 사례 ${summary.latency.excludedAsking}개는 왕복 영향을 없애기 위해 지연 분포에서 제외한다. 질문 없는 첫 요청의 POST 직전부터 각 프레임 수신까지 측정하며 세션 생성·예보서 조회·적재 관찰은 제외한다. 실패·무발행 done은 발행 지연에 넣지 않는다. p50·p95는 최근접 순위이며 JSON에 모든 턴의 수신 시각을 보존한다.`,
    "",
    "| 사례 | 결과 | 되묻기 | 의도 | 문장 | LLM |",
    "|---|---|---|---|---:|---:|",
    ...artifact.scores.map(
      (score) =>
        `| ${score.id} | ${score.passed ? "통과" : "실패"} | ${score.actualAskFields.join(", ") || "—"} | ${score.actualIntent ?? "—"} | ${score.claims} | ${score.llmCalls} |`,
    ),
    "",
    "실패 원인:",
    ...artifact.scores
      .filter((score) => !score.passed)
      .map((score) => `- ${score.id}: ${cell(score.problems.join("; "))}`),
  ];
  if (summary.passed === summary.total) lines.push("- 없음");
  return `${lines.join("\n")}\n`;
}
