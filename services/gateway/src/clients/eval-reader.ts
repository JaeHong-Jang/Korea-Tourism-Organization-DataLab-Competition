// 공유 평가 디렉터리의 최신 결과를 운영 상태 계약으로 읽는다
import { readFile } from "node:fs/promises";
import { evalSummarySchema } from "./query-schemas.js";

// 파일이 없는 경우만 null로 두고 깨진 파일이나 잘못된 수치는 거부한다
export async function readLatestEval(
  path: string | URL = new URL(
    "../../../../reports/evals/latest.json",
    import.meta.url,
  ),
) {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  // 평가 실패를 숨기거나 성공 값으로 바꾸지 않고 그대로 검증한다
  const result: unknown = JSON.parse(text);
  if (!evalSummarySchema(result)) throw new Error("평가 결과 계약 위반");
  return result;
}
