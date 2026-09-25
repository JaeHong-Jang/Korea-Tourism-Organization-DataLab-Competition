// 독립 JSONL의 사례 수·구성을 확인하고 평가일에 상대 날짜를 고정한다
import { readFile } from "node:fs/promises";
import { validateExtraction } from "../src/team/analysis/normalize/extraction.js";
import type { Scenario } from "./scenario-types.js";

// KST 날짜는 실행 순간 한 번만 고정해 자정 경계의 사례 간 차이를 막는다
export function evaluationDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

// 실제 일정이 아닌 개발 시나리오의 날짜만 평가일에서 이동한다
export function materializeScenario(item: Scenario, date: string): Scenario {
  const day = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date
  )
    throw new Error("평가일 형식이 잘못되었습니다");
  day.setUTCDate(day.getUTCDate() + (item.offsetDays ?? 0));
  const actual = day.toISOString().slice(0, 10);
  if (item.offsetDays !== undefined && actual >= "2026-10-18")
    throw new Error(
      "10/18 이후 자료가 필요한 일정입니다. 사례·자료 조건을 다시 검토하세요",
    );
  const korean = `${day.getUTCFullYear()}년 ${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일`;
  return JSON.parse(JSON.stringify(item).replaceAll("{{date}}", korean));
}

// 위험 두 사례는 새 예보 열두 사례에 포함하고 후속 참조는 앞선 발행 사례만 허용한다
export function readScenarios(contents: string): Scenario[] {
  const cases: Scenario[] = contents
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (cases.length !== 23 || new Set(cases.map((item) => item.id)).size !== 23)
    throw new Error("고유한 기본 시나리오 20개와 what-if 3개가 필요합니다");
  for (const [category, count] of Object.entries({
    new: 12,
    ask: 3,
    followup: 6,
    out_of_scope: 2,
  }))
    if (cases.filter((item) => item.category === category).length !== count)
      throw new Error(`사례 구성 오류: ${category}`);
  const seen = new Map<string, Scenario>();
  for (const item of cases) {
    if (
      item.whatifMode &&
      (item.category !== "followup" || item.expected.intent !== "whatif")
    )
      throw new Error(`what-if 조건 오류: ${item.id}`);
    if (
      !item.text ||
      !Array.isArray(item.tags) ||
      !Array.isArray(item.expected?.askFields) ||
      typeof item.expected.published !== "boolean"
    )
      throw new Error(`사례 형식 오류: ${item.id}`);
    if (item.parent && !seen.get(item.parent)?.expected.published)
      throw new Error(`앞선 발행 세션이 필요합니다: ${item.id}`);
    if (["new", "ask"].includes(item.category)) {
      if (
        !Number.isInteger(item.offsetDays) ||
        (item.offsetDays ?? 0) < 3 ||
        (item.offsetDays ?? 0) > 13 ||
        !item.text.includes("{{date}}") ||
        !validateExtraction(item.extraction) ||
        item.text.includes("인천")
      )
        throw new Error(`일정·추출 픽스처 조건 오류: ${item.id}`);
    } else if (!item.parent || !item.expected.intent)
      throw new Error(`후속 조건 오류: ${item.id}`);
    seen.set(item.id, item);
  }
  if (cases.filter((item) => item.whatifMode).length !== 3)
    throw new Error("what-if 시나리오 3개가 필요합니다");
  if (
    new Set(
      cases
        .filter((item) => item.category === "new")
        .map((item) => item.extraction?.typeText),
    ).size !== 6 ||
    cases.filter((item) => item.tags.includes("위험요소")).length !== 2
  )
    throw new Error("유형 여섯 종·위험요소 두 사례가 필요합니다");
  return cases;
}

// 실행 위치와 무관하게 같은 원본 정답셋을 읽는다
export async function loadScenarios() {
  const contents = await readFile(
    new URL("scenarios.jsonl", import.meta.url),
    "utf8",
  );
  return { contents, cases: readScenarios(contents) };
}
