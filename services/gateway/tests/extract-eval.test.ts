// 평가 정답셋의 계약과 실패를 과대평가하지 않는 채점 규칙을 검증한다
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  measuredRanking,
  percentile,
  readCases,
  renderReport,
  scoreRun,
} from "../evals/run-extract-eval.js";
import {
  DEFAULT_EXTRACTION_MODEL,
  EXTRACTION_MODELS,
} from "../src/llm/models.js";
import { emptyDraft } from "../src/team/analysis/normalize/draft.js";

const cases = readCases(
  readFileSync(
    new URL("../evals/extract_cases.jsonl", import.meta.url),
    "utf8",
  ),
);

// 필수 사례를 빠뜨린 축소 평가로 좋은 점수가 나오지 않게 한다
it("독립 정답 30건과 모호성·상대 날짜 수를 검증한다", () => {
  expect(cases).toHaveLength(30);
  expect(cases.filter((item) => item.expected.ambiguities.length)).toHaveLength(
    3,
  );
  expect(cases.filter((item) => item.tags.includes("상대날짜"))).toHaveLength(
    5,
  );
});

// 폼의 null이 정답 null과 같아도 실패를 정답으로 세지 않는다
it("폼 대체와 미실행 모델은 정확도 0이며 추천에서 제외한다", () => {
  const run = {
    model: "qwen2.5:7b",
    error: null,
    samples: cases.map((item) => ({
      id: item.id,
      phase: "warm" as const,
      elapsedMs: 10,
      raw: null,
      result: {
        draft: emptyDraft(),
        questions: [],
        mode: "form" as const,
        reason: "llm" as const,
        metrics: undefined,
      },
    })),
  };
  expect(scoreRun(run, cases).accuracy).toBe(0);
  expect(measuredRanking([run], cases)).toEqual([]);
  expect(scoreRun({ ...run, samples: [] }, cases).accuracy).toBe(0);
});

// 승인 모델이 소수 필드에서 뒤져도 실측 순위와 운영상 동률·기본값을 구분한다
it.each([0, 1, 2, 3])("오답 차이 %i칸의 판정을 보고서에 명시한다", (gap) => {
  const runs = EXTRACTION_MODELS.map((model, modelIndex) => ({
    model,
    error: null,
    samples: cases.map((item, caseIndex) => ({
      id: item.id,
      phase: "warm" as const,
      elapsedMs: modelIndex === 0 ? 1_200 : 1_800,
      raw: null,
      result: {
        draft: {
          ...item.expected,
          name: modelIndex === 0 && caseIndex < gap ? null : item.expected.name,
        },
        questions: [],
        mode: "extracted" as const,
        reason: null,
        metrics: undefined,
      },
    })),
  }));
  const report = renderReport(runs, cases, "digest", "recording.json");
  expect(measuredRanking(runs, cases)[0].model).toBe(
    EXTRACTION_MODELS[gap ? 1 : 0],
  );
  expect(report).toContain(
    `정확도 차이 판정: **${gap <= 2 ? "같은 수준" : "차이 있음"}** (오답 수 차이 ${gap}칸)`,
  );
  expect(report).toContain(
    `승인된 기본 모델(추천 유지): **${DEFAULT_EXTRACTION_MODEL}**`,
  );
  expect(report).toContain("05 §4-2 모델 선택");
});

// 최근접 순위 방식과 단일 첫 로딩 표본의 표시 규칙을 고정한다
it("지연 백분위는 정렬된 최근접 순위로 구한다", () => {
  expect(percentile([9, 1, 3, 7], 0.5)).toBe(3);
  expect(percentile([9, 1, 3, 7], 0.95)).toBe(9);
  expect(percentile([42], 0.95)).toBe(42);
  expect(percentile([], 0.5)).toBeNull();
});
