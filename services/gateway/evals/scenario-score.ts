// 실제 요청별 스트림을 계약 순서와 독립 근거·숫자·행동 기대값으로 채점한다
import { isDeepStrictEqual } from "node:util";
// @ts-expect-error 계약 순서 판정은 JavaScript로 배포된다
import { sequenceProblems } from "@crowdcast/contracts/rules/sse-sequence.mjs";
import type {
  AgentStep,
  Claim,
  Evidence,
  ForecastCard,
  SseEvent,
} from "@crowdcast/contracts/types";
import { auditClaimNumbers } from "./scenario-numbers.js";
import type {
  Scenario,
  ScenarioSample,
  ScenarioScore,
} from "./scenario-types.js";

// 봉투는 스트림 리더에서 계약을 검증한 뒤 이름에 대응하는 자료로 좁힌다
export function eventData<T>(events: SseEvent[], name: SseEvent["event"]): T[] {
  return events
    .filter((event) => event.event === name)
    .map((event) => event.data as T);
}

// 요청 단위의 순서를 검사해 되묻기 재개의 seq 초기화를 오류로 세지 않는다
export function scoreScenario(
  item: Scenario,
  sample: ScenarioSample,
): ScenarioScore {
  const events = sample.turns.flatMap((turn) =>
    turn.events.map((value) => value.envelope),
  );
  const sequence: string[] = sample.turns.flatMap((turn, index) =>
    (
      sequenceProblems(
        turn.events.map((value) => value.envelope),
        item.parent
          ? { mode: "followup", forecastId: sample.parentForecastId }
          : { mode: "new" },
      ) as string[]
    ).map((problem) => `요청 ${index + 1}: ${problem}`),
  );
  if (!sample.turns.length) sequence.push("수신한 요청이 없습니다");
  const evidenceProblems: string[] = [];
  const numberProblems: string[] = [];
  const intervalProblems: string[] = [];
  const execution = [
    ...sample.problems,
    ...sample.turns.flatMap((turn) => turn.problems),
  ];
  const card =
    eventData<ForecastCard>(events, "forecast")[0] ?? sample.priorCard;
  const claims = eventData<Claim>(events, "claim");
  const steps = eventData<AgentStep>(events, "agent_step");
  let linkedClaims = 0;
  let matchedNumberClaims = 0;
  let numericTokens = 0;
  // 근거는 각 요청이 실제로 보낸 묶음만 사용해 다른 턴의 누락을 감추지 않는다
  for (const turn of sample.turns) {
    const stream = turn.events.map((value) => value.envelope);
    const evidence = eventData<{ items: Evidence[] }>(
      stream,
      "evidence",
    ).flatMap((data) => data.items);
    for (const claim of eventData<Claim>(stream, "claim")) {
      const connected =
        claim.status === "published" &&
        claim.evidenceIds.length > 0 &&
        claim.evidenceIds.every((id) =>
          evidence.some((value) => value.id === id),
        );
      if (connected) linkedClaims++;
      else evidenceProblems.push(`${claim.id}: 발행 상태·전송 근거 연결 누락`);
      const audit = auditClaimNumbers(claim, card, evidence);
      numericTokens += audit.numericTokens;
      if (!audit.problems.length) matchedNumberClaims++;
      numberProblems.push(
        ...audit.problems.map((problem) => `${claim.id}: ${problem}`),
      );
    }
  }

  // basis는 카드 계약에 없어 발행 예보서에서 읽고 수치는 SSE 카드와 일치하는지 확인한다
  if (sample.report && card) {
    if (
      sample.report.forecastId !== card.id ||
      sample.report.sessionId !== sample.sessionId
    )
      execution.push("예보서와 스트림의 예보·세션 식별자 불일치");
    if (
      !isDeepStrictEqual(card.dailyMean, sample.report.forecast.dailyMean) ||
      !isDeepStrictEqual(
        card.peakConcurrent,
        sample.report.forecast.peakConcurrent,
      )
    )
      numberProblems.push("SSE Quantity와 저장 예보서 Quantity 불일치");
  }
  const display = [
    ...claims.map((claim) => claim.rendered ?? ""),
    ...(card?.probabilities.map((entry) => entry.display) ?? []),
    ...(card?.judgment.reasons.map((reason) => reason.text) ?? []),
  ];
  const percentCount = display.join("\n").match(/[%％]/g)?.length ?? 0;
  if (card && !sample.report)
    intervalProblems.push("basis를 확인할 예보서가 없습니다");
  if (sample.report?.forecast.judgment.basis === "구간" && percentCount)
    intervalProblems.push(`구간 판정 표시에서 % ${percentCount}개`);

  // 되묻기 정답은 순서 무관 집합으로 비교하되 중복·재개 뒤의 질문은 오답으로 센다
  const actualAskFields = eventData<{ field: string }>(events, "ask").map(
    (ask) => ask.field,
  );
  const ask = isDeepStrictEqual(
    [...actualAskFields].sort(),
    [...item.expected.askFields].sort(),
  );
  const intents = steps
    .filter((step) => step.agentId === "lead")
    .flatMap((step) => {
      const intent = /^요청 분류: ([a-z_]+) \((?:규칙|LLM)\)$/.exec(
        step.note,
      )?.[1];
      return intent ? [intent] : [];
    });
  const actualIntent = intents.at(-1) ?? null;
  const intent = actualIntent === item.expected.intent;
  const errors = eventData<{ code: string }>(events, "error");
  for (const error of errors)
    if (!(item.category === "out_of_scope" && error.code === "OUT_OF_SCOPE"))
      execution.push(`스트림 오류: ${error.code}`);
  if (
    item.category === "out_of_scope" &&
    (errors.length !== 1 || errors[0].code !== "OUT_OF_SCOPE")
  )
    execution.push("범위 밖 안내 오류가 없습니다");
  if (
    item.expected.intent === "save" &&
    !steps.some(
      (step) => step.status === "done" && step.note === "예보서를 저장했어요",
    )
  )
    execution.push("저장 완료 기록이 없습니다");
  if (
    item.expected.intent === "draft" &&
    !eventData<{ actions: { href?: string }[] }>(events, "suggest").some(
      (data) =>
        data.actions.some((action) =>
          /^\/api\/plans\/[^/]+\/export\.docx$/.test(action.href ?? ""),
        ),
    )
  )
    execution.push("계획 초안 다운로드 링크가 없습니다");

  // 기존 예보 id를 반환하는 저장·초안은 새 문장 발행으로 세지 않는다
  const published =
    claims.length > 0 &&
    eventData<{ gate: string; passed: boolean }>(events, "gate").some(
      (gate) => gate.gate === "publish" && gate.passed,
    );
  const publication = item.expected.published
    ? published
    : !claims.length &&
      !published &&
      !eventData<{ gate: string; passed: boolean }>(events, "gate").some(
        (gate) => gate.gate === "publish" && gate.passed,
      );
  const checks = {
    sequence: !sequence.length,
    evidence: !evidenceProblems.length,
    numbers: !numberProblems.length,
    interval: !intervalProblems.length,
    ask,
    intent,
    publication,
    execution: !execution.length,
  };
  const problems = [
    ...sequence,
    ...evidenceProblems,
    ...numberProblems,
    ...intervalProblems,
    ...execution,
  ];
  if (!ask)
    problems.push(
      `되묻기 기대 [${item.expected.askFields}] / 실제 [${actualAskFields}]`,
    );
  if (!intent)
    problems.push(`의도 기대 ${item.expected.intent} / 실제 ${actualIntent}`);
  if (!publication)
    problems.push(
      `문장 발행 기대 ${item.expected.published} / 실제 ${published}`,
    );

  // 질문 왕복이 없는 첫 요청만 지연 분포에 넣고 모든 턴의 원시 시각은 보존한다
  const excludedAsking =
    actualAskFields.length > 0 || !!item.expected.askFields.length;
  const first = sample.turns[0]?.events ?? [];
  const forecastMs = excludedAsking
    ? null
    : (first.find((value) => value.envelope.event === "forecast")?.elapsedMs ??
      null);
  const publishedDoneMs =
    excludedAsking || !published || !checks.execution || !checks.sequence
      ? null
      : (first.find((value) => value.envelope.event === "done")?.elapsedMs ??
        null);
  return {
    id: item.id,
    category: item.category,
    expected: item.expected,
    passed: Object.values(checks).every(Boolean),
    problems,
    checks,
    sequenceProblems: sequence,
    evidenceProblems,
    numberProblems,
    intervalProblems,
    claims: claims.length,
    linkedClaims,
    matchedNumberClaims,
    numericTokens,
    percentCount,
    actualAskFields,
    actualIntent,
    llmCalls: steps.filter((step) => step.usedLlm).length,
    models: [
      ...new Set(
        steps
          .filter((step) => step.usedLlm && step.model)
          .map((step) => step.model as string),
      ),
    ],
    latency: { forecastMs, publishedDoneMs, excludedAsking },
  };
}
