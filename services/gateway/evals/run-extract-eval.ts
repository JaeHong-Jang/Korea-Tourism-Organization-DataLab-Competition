// 동일한 행사 정답셋으로 로컬 후보 모델의 정확도와 로딩별 지연을 기록한다
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseEnv } from "node:util";
import type { EventDraft } from "@crowdcast/contracts/types";
import {
  DEFAULT_EXTRACTION_MODEL,
  EXTRACTION_MODELS,
  MAX_OUTPUT_TOKENS,
} from "../src/llm/models.js";
import { createLlmClient } from "../src/llm/ollama-client.js";
import { readStartupConfig } from "../src/startup-config.js";
import {
  DICTATION_PROMPT,
  extractEvent,
} from "../src/team/analysis/dictation.js";
import { todayInKorea } from "../src/team/analysis/normalize/date.js";
import {
  extractionSchema,
  validateDraft,
} from "../src/team/analysis/normalize/extraction.js";

// 실행 위치와 무관하게 평가 자원을 모듈 기준으로 찾는다
const localFile = (path: string) => new URL(path, import.meta.url);

export type ExtractCase = {
  id: string;
  today: string;
  tags: string[];
  text: string;
  expected: EventDraft;
};
type Sample = {
  id: string;
  phase: "cold" | "warm";
  elapsedMs: number;
  raw: string | null;
  result: Awaited<ReturnType<typeof extractEvent>>;
};
type ModelRun = { model: string; error: string | null; samples: Sample[] };

// 표본이 작아도 재현되는 최근접 순위 방식으로 지연 백분위를 계산한다
export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

// 정답을 실행 결과로 만들지 않고 독립 JSONL의 모든 계약 필드를 검증한다
export function readCases(contents: string): ExtractCase[] {
  const lines = contents.trim().split("\n");
  const cases: ExtractCase[] = lines.map((line) => JSON.parse(line));
  if (cases.length !== 30 || new Set(cases.map((item) => item.id)).size !== 30)
    throw new Error("평가 사례는 고유한 30건이어야 합니다");
  for (const item of cases) {
    if (
      !item.text ||
      !Array.isArray(item.tags) ||
      !validateDraft(item.expected)
    )
      throw new Error("평가 정답 계약 위반");
    todayInKorea({ CROWDCAST_TODAY: item.today });
  }
  if (
    cases.filter((item) => item.tags.includes("중구모호")).length !== 3 ||
    cases.filter((item) => item.tags.includes("상대날짜")).length !== 5
  )
    throw new Error("모호성·상대 날짜 사례 수 위반");
  return cases;
}

// 폼 대체를 정답 null과 같다고 채점하지 않고 실패한 모든 필드는 오답으로 센다
export function scoreRun(run: ModelRun, cases: ExtractCase[]) {
  const fields = Object.keys(cases[0].expected) as (keyof EventDraft)[];
  const correct = Object.fromEntries(
    fields.map((field) => [field, 0]),
  ) as Record<keyof EventDraft, number>;
  let nonEmptyTotal = 0;
  let nonEmptyCorrect = 0;
  let detected = 0;
  let falsePositive = 0;
  let success = 0;
  const failures: string[] = [];
  for (const item of cases) {
    const sample = run.samples.find(
      (value) => value.phase === "warm" && value.id === item.id,
    );
    const ok = sample?.result.mode === "extracted";
    if (ok) success++;
    const wrong: string[] = [];
    for (const field of fields) {
      const value = item.expected[field];
      const same = ok && isDeepStrictEqual(sample.result.draft[field], value);
      if (same) correct[field]++;
      else wrong.push(field);
      if (value !== null && (!Array.isArray(value) || value.length > 0)) {
        nonEmptyTotal++;
        if (same) nonEmptyCorrect++;
      }
    }
    if (wrong.length)
      failures.push(`${item.id}: ${sample?.result.reason ?? wrong.join(", ")}`);
    const ambiguous = item.expected.ambiguities.length > 0;
    const found =
      ok &&
      sample.result.draft.ambiguities.some((value) => value.field === "venue");
    if (ambiguous && found) detected++;
    if (!ambiguous && found) falsePositive++;
  }
  const total = cases.length * fields.length;
  const matched = Object.values(correct).reduce((a, b) => a + b, 0);
  return {
    correct,
    success,
    detected,
    falsePositive,
    nonEmptyCorrect,
    nonEmptyTotal,
    wrong: total - matched,
    accuracy: matched / total,
    failures,
  };
}

// 실측 순위는 오답 수로 정렬하고 승인된 기본 모델과 별도로 표시한다
export function measuredRanking(runs: ModelRun[], cases: ExtractCase[]) {
  return runs
    .filter((run) => !run.error)
    .map((run) => ({ model: run.model, ...scoreRun(run, cases) }))
    .filter((run) => run.success > 0)
    .sort((a, b) => b.accuracy - a.accuracy);
}

// 실패 사례와 실행 조건을 표와 함께 남겨 평균만으로 결론을 내리지 않게 한다
export function renderReport(
  runs: ModelRun[],
  cases: ExtractCase[],
  digest: string,
  rawFile: string,
  provenance = "이번 실행에서 로컬 Ollama를 호출해 측정했다.",
): string {
  const ranked = measuredRanking(runs, cases);
  const gap =
    ranked.length === 2 ? Math.abs(ranked[0].wrong - ranked[1].wrong) : null;
  const lines = [
    "# T-302 받아쓰기 모델 평가",
    "",
    "실제 한국 행사명·지명을 사용한 가상 행사 요청 30건이다. 일정·예산은 실제 개최 정보가 아니다.",
    "정답은 실행과 독립된 JSONL 전체 15필드다. 폼 대체는 전 필드 오답으로 센다. 빈 값 영향을 확인하도록 비어 있지 않은 정답 정확도도 함께 표시한다.",
    "이 정답셋은 개발 평가용이며 별도 보류셋의 일반화 성능을 뜻하지 않는다.",
    "",
    `- 사례 SHA256: \`${digest}\``,
    `- 원문 응답·정규화 결과·측정값: \`${rawFile}\``,
    `- 측정 출처: ${provenance}`,
    `- 설정: temperature=0, seed=42, num_ctx=4096, num_predict=${MAX_OUTPUT_TOKENS}, timeout=60000ms, keep_alive=30m`,
    "- 날짜 기준: 사례별 2026-09-24를 사용자 메시지에 전달. 둘째 주 토요일은 월의 두 번째 토요일, 다음 주는 월요일 시작이다.",
    "- 시각 미지정 시 시작·종료 일시는 null. 시군구 코드는 동네지기 범위라 생성하지 않는다. 주최 누락은 질문에만 추가한다.",
    "- 첫 로딩: 해당 모델 언로드와 /api/ps 부재 확인 후 첫 사례 1회. 로딩됨: 같은 모델로 30건을 순차 측정한다. 첫 로딩은 n=1이라 p50=p95이며 안정적 분포 추정이 아니다.",
    "- 지연: 정규화·검증 포함 벽시계 시간, 최근접 순위 백분위. 각 응답의 load_duration도 원시 기록에 보존한다. 웜업 사례는 정확도에서 제외한다.",
    "",
    "| 모델 | 정상 추출 | 전체 필드 정확도 | 비어 있지 않은 정답 | 모호성 재현율 | 오탐 |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const score = scoreRun(run, cases);
    lines.push(
      `| ${run.model} | ${score.success}/30 | ${(score.accuracy * 100).toFixed(2)}% | ${score.nonEmptyCorrect}/${score.nonEmptyTotal} | ${score.detected}/3 | ${score.falsePositive}/27 |`,
    );
  }
  lines.push(
    "\n| 모델 | 상태 | n | p50(ms) | p95(ms) |\n|---|---|---:|---:|---:|",
  );
  for (const run of runs)
    for (const phase of ["cold", "warm"] as const) {
      const times = run.samples
        .filter((item) => item.phase === phase)
        .map((item) => item.elapsedMs);
      lines.push(
        `| ${run.model} | ${phase === "cold" ? "첫 로딩" : "로딩됨"} | ${times.length} | ${percentile(times, 0.5)?.toFixed(1) ?? "—"} | ${percentile(times, 0.95)?.toFixed(1) ?? "—"} |`,
      );
    }
  lines.push(
    `\n| 필드 | ${runs.map((run) => run.model).join(" | ")} |`,
    `|---|${runs.map(() => "---:").join("|")}|`,
  );
  for (const field of Object.keys(cases[0].expected) as (keyof EventDraft)[]) {
    lines.push(
      `| ${field} | ${runs.map((run) => `${scoreRun(run, cases).correct[field]}/30`).join(" | ")} |`,
    );
  }
  lines.push(
    `\n실측 순위(전체 필드 정확도): ${ranked.map((run, index) => `${index + 1}위 ${run.model} (오답 ${run.wrong}칸)`).join(" → ") || "비교 불가"}.`,
    `정확도 차이 판정: **${gap === null ? "비교 불가" : gap <= 2 ? "같은 수준" : "차이 있음"}**${gap === null ? "" : ` (오답 수 차이 ${gap}칸)`}. 30건에서 오답 수 차이 ≤ 2칸은 운영상 동률로 본다. 통계적 동등성을 검증했다는 뜻은 아니다.`,
    `승인된 기본 모델(추천 유지): **${DEFAULT_EXTRACTION_MODEL}**. [05 §4-2 모델 선택](../../docs/plan/05_기술_아키텍처.md)의 2026-09-24 결정에 따른다. 450칸 중 1칸 차이는 같은 수준으로 보고 로딩됨 p95(4b 1.27초, 7b 1.79초)와 3D와의 GPU 메모리 공유를 고려해 4b를 승인했다. 7b는 품질 대안이며 실측 순위로 기본값을 자동 변경하지 않는다.\n\n오답·실패 사례:`,
  );
  for (const run of runs) {
    if (run.error) lines.push(`- ${run.model}: ${run.error}`);
    for (const failure of scoreRun(run, cases).failures)
      lines.push(`- ${run.model} / ${failure}`);
  }
  return `${lines.join("\n")}\n`;
}

// 실제 모델 호출을 두 후보 모두에 수행하고 로딩별 측정값을 수집한다
async function measureModels(cases: ExtractCase[]): Promise<ModelRun[]> {
  const env = { ...process.env };
  try {
    const file = parseEnv(await readFile(localFile("../../../.env"), "utf8"));
    for (const [key, value] of Object.entries(file))
      if (env[key] === undefined) env[key] = value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (env.LLM_MODE === "fake")
    throw new Error("실제 모델 평가는 LLM_MODE=ollama가 필요합니다");
  const { ollamaHost: host } = await readStartupConfig(env);
  const runs: ModelRun[] = [];
  for (const model of EXTRACTION_MODELS) {
    const client = createLlmClient({ env, host, model, timeoutMs: 60_000 });
    const run: ModelRun = { model, error: null, samples: [] };
    runs.push(run);
    try {
      await client.unload();
    } catch {
      run.error = "첫 로딩을 위한 모델 언로드 실패";
      continue;
    }

    // 모든 사례는 같은 모델 설정을 쓰며 원문 응답을 재채점 가능한 형태로 저장한다
    for (const [index, item] of [cases[0], ...cases].entries()) {
      const phase = index === 0 ? "cold" : "warm";
      let raw: string | null = null;
      const start = performance.now();
      const result = await extractEvent(item.text, {
        env: { ...env, CROWDCAST_TODAY: item.today },
        client: {
          complete: async (input) => {
            const completion = await client.complete(input);
            raw = completion.content;
            return completion;
          },
        },
      });
      const elapsedMs = performance.now() - start;
      run.samples.push({ id: item.id, phase, elapsedMs, raw, result });
      console.log(`${model} ${phase} ${item.id}: ${result.mode}`);
    }
  }
  return runs;
}

// 새로 측정하거나 저장 결과를 재채점하고 동일한 형식의 보고서를 발행한다
export async function runExtractEval(replayFile?: string): Promise<void> {
  const contents = await readFile(localFile("extract_cases.jsonl"), "utf8");
  const cases = readCases(contents);
  const digest = createHash("sha256").update(contents).digest("hex");
  const artifact = replayFile
    ? JSON.parse(await readFile(replayFile, "utf8"))
    : {
        measuredAt: new Date().toISOString(),
        casesSha256: digest,
        prompt: DICTATION_PROMPT,
        schema: extractionSchema,
        runs: await measureModels(cases),
      };
  // 저장 결과는 원문 조건이 같은지 확인하고 지연과 원시 JSON을 보존한다
  if (
    (replayFile && !replayFile.endsWith(".json")) ||
    artifact.casesSha256 !== digest ||
    artifact.prompt !== DICTATION_PROMPT ||
    !isDeepStrictEqual(artifact.schema, extractionSchema)
  )
    throw new Error("저장 평가의 정답셋·프롬프트·스키마 불일치");
  const directory = localFile("../../../reports/evals/");
  await mkdir(directory, { recursive: true });
  const rawFile =
    replayFile ??
    fileURLToPath(new URL(`extract-${todayInKorea({})}.json`, directory));
  if (!replayFile) await writeFile(rawFile, JSON.stringify(artifact, null, 2));
  const provenance = replayFile
    ? `${artifact.measuredAt}의 저장 응답·정규화 결과를 재채점했다. LLM 재호출·정규화 재실행·지연 재측정은 하지 않았다.`
    : undefined;
  const { runs } = artifact;
  const rawName = basename(rawFile);
  const report = renderReport(runs, cases, digest, rawName, provenance);
  await writeFile(rawFile.replace(/\.json$/, ".md"), report);
  console.log(rawFile.replace(/\.json$/, ".md"));
  if (measuredRanking(runs, cases).length !== EXTRACTION_MODELS.length)
    throw new Error("후보 모델 평가 미완료: 보고서 확인 필요");
}

// 테스트가 채점 함수를 가져올 때는 네트워크 평가를 시작하지 않는다
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--replay"))
    throw new Error("사용법: eval:extract [--replay <저장 결과.json>]");
  await runExtractEval(args[1]);
}
