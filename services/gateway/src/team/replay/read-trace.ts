// 식별자와 실제 파일 경계를 확인한 뒤 라이브·발표 trace를 읽기 전용으로 연다
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { TeamSettings } from "../runtime/settings.js";
import { ReplayError } from "./replay-error.js";

const TRACE_ID = /^(s-[0-9]+-[0-9a-f-]{36}|demo-[a-z0-9-]{1,40})$/;
// 세션 전체를 검증하기 전 메모리에 읽으므로 trace 파일은 2MB까지 허용한다
export const REPLAY_MAX_TRACE_BYTES = 2 * 1024 * 1024;
export const DEMO_TRACE_DIRECTORY = fileURLToPath(
  new URL("../../../fixtures/replay/", import.meta.url),
);

// 정규식의 줄 끝 예외와 URL 디코딩 뒤 남은 경로 조작도 허용하지 않는다
export function validateTraceId(traceId: string) {
  if (TRACE_ID.exec(traceId)?.[0] !== traceId)
    throw new ReplayError(
      "BAD_TRACE_ID",
      400,
      "재생 식별자 형식이 맞지 않습니다.",
    );
}

// 심볼릭 링크 해석 뒤에도 선택한 폴더 밖 파일을 읽지 못하게 한다
function assertInside(directory: string, path: string) {
  const child = relative(directory, path);
  if (
    !child ||
    child === ".." ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  )
    throw new ReplayError(
      "BAD_TRACE_ID",
      400,
      "재생 파일이 허용 폴더 밖에 있습니다.",
    );
}

// 경로 검사 뒤 파일이 바뀌어도 링크를 따라가지 않고 같은 핸들에서 검사·읽기를 끝낸다
async function readTraceFile(target: string) {
  // 비일반 파일로 교체되어도 FIFO 열기에서 멈추지 않도록 비차단으로 연다
  const file = await open(
    target,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile())
      throw new ReplayError(
        "TRACE_INVALID",
        422,
        "일반 trace 파일이 필요합니다.",
      );
    if (stat.size > REPLAY_MAX_TRACE_BYTES)
      throw new ReplayError(
        "TRACE_INVALID",
        422,
        "재생 파일은 2MB 이하여야 합니다.",
      );

    // 검사 뒤 파일이 늘어나도 상한보다 한 바이트까지만 읽어 메모리 사용을 제한한다
    const buffer = Buffer.alloc(REPLAY_MAX_TRACE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (size > REPLAY_MAX_TRACE_BYTES)
      throw new ReplayError(
        "TRACE_INVALID",
        422,
        "재생 파일은 2MB 이하여야 합니다.",
      );
    return buffer.toString("utf8", 0, size);
  } finally {
    await file.close();
  }
}

// 실제 trace 경로는 예보팀 설정을 받고 발표 백업만 패키지에 고정한다
export async function readTrace(
  traceId: string,
  settings: Pick<TeamSettings, "traceDirectory">,
  demoDirectory = DEMO_TRACE_DIRECTORY,
) {
  validateTraceId(traceId);
  const directory = resolve(
    traceId.startsWith("demo-") ? demoDirectory : settings.traceDirectory,
  );
  const path = resolve(directory, `${traceId}.jsonl`);
  assertInside(directory, path);

  // 누락은 404로, 읽을 수 없는 파일은 내용 노출 없이 422로 구분한다
  try {
    const root = await realpath(directory);
    const target = resolve(root, `${traceId}.jsonl`);
    assertInside(root, await realpath(target));
    return await readTraceFile(target);
  } catch (error) {
    if (error instanceof ReplayError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new ReplayError(
        "TRACE_NOT_FOUND",
        404,
        "저장된 재생 파일이 없습니다.",
      );
    throw new ReplayError(
      "TRACE_INVALID",
      422,
      "재생 파일을 읽을 수 없습니다.",
    );
  }
}
