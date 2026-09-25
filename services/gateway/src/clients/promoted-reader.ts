// 공유 백테스트 포인터에서 사용 모델의 검증 판정만 읽는다
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 포인터가 아직 없거나 판정이 기록되지 않았으면 선택 필드를 생략한다
export async function readPromotedVerdict(
  path: string | URL = resolve(
    process.env.CROWDCAST_DATA_ROOT ??
      fileURLToPath(new URL("../../../../", import.meta.url)),
    "reports/backtest/promoted.json",
  ),
): Promise<"통과" | "미검증" | undefined> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const value: unknown = JSON.parse(contents);
  if (!value || typeof value !== "object") return undefined;
  const verdict = (value as Record<string, unknown>).verdict;
  return verdict === "통과" || verdict === "미검증" ? verdict : undefined;
}
