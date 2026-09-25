// 상담 시나리오 스무 개의 실제 또는 가짜 SSE를 채점해 JSON·Markdown으로 저장한다
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluationDate,
  loadScenarios,
  materializeScenario,
} from "./scenario-cases.js";
import { localBase, observeConditions } from "./scenario-conditions.js";
import { createScenarioFake } from "./scenario-fake.js";
import { measureScenarios } from "./scenario-measure.js";
import {
  renderScenarioReport,
  type ScenarioArtifact,
  summarizeScenarios,
} from "./scenario-report.js";
import { scoreScenario } from "./scenario-score.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

// npm workspace가 바꾸는 cwd와 무관하게 상대 출력은 저장소 루트를 기준으로 해석한다
export function scenarioOptions(args: string[], date = evaluationDate()) {
  let fake = false;
  let base: string | undefined;
  let out: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--fake") {
      fake = true;
      continue;
    }
    if (arg === "--base" || arg === "--out") {
      const value = args[++index];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} 값이 필요합니다`);
      if (arg === "--base") base = localBase(value);
      else out = value;
      continue;
    }
    // 셸의 .{json,md} 확장이 두 인자가 된 경우에도 한 출력 묶음으로 받는다
    if (out?.endsWith(".json") && arg === out.replace(/\.json$/, ".md"))
      continue;
    throw new Error(`알 수 없는 인자: ${arg}`);
  }
  if (!fake && !base)
    throw new Error("실제 평가는 --base <로컬 게이트웨이 주소>가 필요합니다");
  if (fake && base) throw new Error("--fake와 --base는 함께 쓸 수 없습니다");
  const stem = resolve(
    root,
    (out ?? `reports/evals/scenario-${date}${fake ? "-fake" : ""}`).replace(
      /(?:\.(?:json|md)|\.\{json,md\})$/,
      "",
    ),
  );
  return {
    fake,
    base: base ?? "http://127.0.0.1",
    jsonFile: `${stem}.json`,
    markdownFile: `${stem}.md`,
  };
}

// 결과 전체를 같은 디렉터리의 임시 파일에 쓴 뒤 최신 포인터를 원자 교체한다
async function writeLatestScenario(
  artifact: ScenarioArtifact,
  latestFile: string,
) {
  const temporary = `${latestFile}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(latestFile), { recursive: true });
  try {
    await writeFile(
      temporary,
      `${JSON.stringify({ ...artifact, mode: artifact.mode === "가짜" ? "fake" : "live" }, null, 2)}\n`,
    );
    await rename(temporary, latestFile);
  } finally {
    await rm(temporary, { force: true });
  }
}

// 각 사례 실패는 끝까지 수집한 뒤 파일을 남기고 프로세스의 실패 상태로 알린다
export async function runScenarioEval(
  args = process.argv.slice(2),
  latestFile = fileURLToPath(
    new URL("../../../reports/evals/latest.json", import.meta.url),
  ),
) {
  const measuredAt = new Date().toISOString();
  const date = evaluationDate(new Date(measuredAt));
  const options = scenarioOptions(args, date);
  const { contents, cases: definitions } = await loadScenarios();
  const cases = definitions.map((item) => materializeScenario(item, date));
  const fetcher = options.fake ? createScenarioFake(cases).fetcher : fetch;
  const conditionsBefore = await observeConditions(
    fetcher,
    options.base,
    options.fake,
  );
  const samples = await measureScenarios(
    cases,
    fetcher,
    options.base,
    (id, passed) => console.log(`${id}: ${passed ? "통과" : "실패"}`),
  );
  const conditionsAfter = await observeConditions(
    fetcher,
    options.base,
    options.fake,
  );
  const scores = cases.map((item, index) =>
    scoreScenario(item, samples[index]),
  );
  const artifact: ScenarioArtifact = {
    measuredAt,
    evaluationDate: date,
    mode: options.fake ? "가짜" : "실제",
    base: options.base,
    casesSha256: createHash("sha256").update(contents).digest("hex"),
    conditionsBefore,
    conditionsAfter,
    cases,
    samples,
    scores,
    summary: summarizeScenarios(scores),
  };
  await mkdir(dirname(options.jsonFile), { recursive: true });
  await writeFile(options.jsonFile, `${JSON.stringify(artifact, null, 2)}\n`);
  await writeFile(options.markdownFile, renderScenarioReport(artifact));
  await writeLatestScenario(artifact, latestFile);
  console.log(
    `${artifact.mode} ${artifact.summary.passed}/${scores.length}: ${options.markdownFile}`,
  );
  return artifact;
}

// 단위 테스트에서 모듈을 가져올 때는 평가나 외부 호출을 시작하지 않는다
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const artifact = await runScenarioEval();
  if (artifact.summary.passed !== artifact.summary.total) process.exitCode = 1;
}
