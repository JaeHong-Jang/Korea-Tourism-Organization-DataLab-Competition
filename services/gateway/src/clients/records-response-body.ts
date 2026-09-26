// records 본문을 바이트 상한 안에서 읽고 검증한 docx를 임시 파일에서 스트리밍한다
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

// JSON은 2MiB, docx는 20MiB까지만 받아 메모리·디스크 사용을 제한한다
export const RECORDS_JSON_MAX_BYTES = 2 * 1024 * 1024;
export const RECORDS_DOCX_MAX_BYTES = 20 * 1024 * 1024;

// Content-Length가 없거나 거짓이어도 실제 청크의 누적 바이트를 검사한다
async function readBoundedBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  consume: (chunk: Uint8Array) => Promise<void> | void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("records 응답 계약 위반: 본문 없음");
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    const declared = Number(response.headers.get("content-length"));
    if (declared > maxBytes)
      throw new Error("records 응답 계약 위반: 크기 초과");
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes)
        throw new Error("records 응답 계약 위반: 크기 초과");
      await consume(chunk.value);
    }
  } catch (error) {
    // 끝없는 상류 취소 응답이 요청 마감을 붙잡지 않게 한다
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

// JSON 해석 전에 크기를 제한하고 UTF-8 문자가 청크 경계에서 잘리지 않게 한다
export async function readRecordsJson(response: Response, signal: AbortSignal) {
  const chunks: Uint8Array[] = [];
  await readBoundedBody(response, RECORDS_JSON_MAX_BYTES, signal, (chunk) => {
    chunks.push(chunk);
  });
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

// 전송 시작 전에 전체 크기를 검사해야 길이 미상 docx의 초과도 503으로 반환한다
export async function stageRecordsDocx(
  response: Response,
  signal: AbortSignal,
  downstream?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const directory = await mkdtemp(join(tmpdir(), "crowdcast-records-docx-"));
  const file = await open(join(directory, "document.docx"), "wx+").catch(
    async (error) => {
      await rm(directory, { recursive: true, force: true });
      throw error;
    },
  );
  try {
    await readBoundedBody(
      response,
      RECORDS_DOCX_MAX_BYTES,
      signal,
      async (chunk) => {
        await file.writeFile(chunk);
      },
    );
    signal.throwIfAborted();

    // 다운로드는 역압과 연결 취소를 따르고 완료·오류·취소 모두 임시 파일을 지운다
    const stream = file.createReadStream({
      start: 0,
      autoClose: true,
      signal: downstream,
    });
    stream.once("close", () => {
      void rm(directory, { recursive: true, force: true }).catch(() => {
        console.error("records docx 임시 파일 정리 실패");
      });
    });
    return Readable.toWeb(stream, {
      strategy: { highWaterMark: 64 * 1024, size: (chunk) => chunk.byteLength },
    }) as ReadableStream<Uint8Array>;
  } catch (error) {
    await file.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
