// 취소 신호를 확인하며 요청별 SSE 봉투를 세션 JSONL에 추가한다
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type TraceAppend = (
  path: string,
  line: string,
  signal: AbortSignal,
) => Promise<void>;

// 디렉터리 생성 뒤에도 취소를 확인해 늦은 파일 쓰기를 막는다
export const appendTrace: TraceAppend = async (path, line, signal) => {
  signal.throwIfAborted();
  await mkdir(dirname(path), { recursive: true });
  signal.throwIfAborted();
  await writeFile(path, line, { mode: 0o600, flag: "a", signal });
};
