// records JSON·docx의 실제 바이트 상한과 본문 취소·임시 파일 정리를 확인한다
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { DOCX_CONTENT_TYPE } from "../src/clients/records-relay-client.js";
import {
  RECORDS_DOCX_MAX_BYTES,
  RECORDS_JSON_MAX_BYTES,
} from "../src/clients/records-response-body.js";
import { plan, proxyConfig } from "./proxy-fixture.js";

// 병렬 테스트의 docx 파일을 관찰하지 않도록 이 테스트만 임시 루트를 격리한다
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return { ...original, tmpdir: vi.fn(original.tmpdir) };
});
const systemTemp = tmpdir();
let directory: string;

// 예상된 오류 로그가 출력되지 않게 하고 파일 격리와 시계를 복원한다
beforeEach(async () => {
  directory = await mkdtemp(join(systemTemp, "crowdcast-records-size-tests-"));
  vi.mocked(tmpdir).mockReturnValue(directory);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
  vi.mocked(tmpdir).mockReturnValue(systemTemp);
  vi.restoreAllMocks();
});

// 길이 없는 청크 스트림으로 큰 본문을 한 번에 할당하지 않고 재현한다
function sizedBody(bytes: number, json: boolean) {
  let remaining = bytes;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (!remaining) {
          controller.close();
          return;
        }
        const chunk = new Uint8Array(Math.min(64 * 1024, remaining));
        if (json) {
          chunk.fill(32);
          if (remaining === bytes) chunk[0] = 91;
          if (remaining === chunk.byteLength) chunk[chunk.byteLength - 1] = 93;
        }
        remaining -= chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  return { stream, cancel };
}

// 프로세스가 만든 다운로드 임시 폴더만 관찰한다
async function temporaryDocx() {
  return (await readdir(tmpdir()))
    .filter((name) => name.startsWith("crowdcast-records-docx-"))
    .sort();
}

// JSON과 docx는 헤더가 없어도 각각의 상한에서 같은 계약 경계를 지킨다
it.each([false, true])("docx=%s 실제 바이트 상한", async (docx) => {
  const before = await temporaryDocx();
  const limit = docx ? RECORDS_DOCX_MAX_BYTES : RECORDS_JSON_MAX_BYTES;
  const path = docx
    ? `/api/records/plans/${plan.id}/export.docx`
    : "/api/records/ledger";
  for (const extra of [0, 1]) {
    const body = sizedBody(limit + extra, !docx);
    const response = await createApp(
      proxyConfig,
      async () =>
        new Response(body.stream, {
          headers: {
            "content-type": docx ? DOCX_CONTENT_TYPE : "application/json",
          },
        }),
    ).request(path);
    expect(response.status).toBe(extra ? 503 : 200);
    if (extra) {
      expect(body.cancel).toHaveBeenCalled();
      expect(await response.json()).toHaveProperty(
        "code",
        "UPSTREAM_UNAVAILABLE",
      );
    } else if (docx) {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("docx 응답 스트림 없음");
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        expect(chunk.value.byteLength).toBeLessThanOrEqual(64 * 1024);
        bytes += chunk.value.byteLength;
      }
      expect(bytes).toBe(limit);
    } else {
      expect(await response.json()).toEqual([]);
    }
    await expect.poll(temporaryDocx).toEqual(before);
  }
});

// 큰 Content-Length는 즉시 거부하고 작은 거짓 길이는 실제 누적 크기로 잡는다
it.each([false, true])("docx=%s 길이 헤더를 신뢰하지 않는다", async (docx) => {
  const limit = docx ? RECORDS_DOCX_MAX_BYTES : RECORDS_JSON_MAX_BYTES;
  for (const declared of [limit + 1, 1]) {
    const body = sizedBody(limit + 1, !docx);
    const response = await createApp(
      proxyConfig,
      async () =>
        new Response(body.stream, {
          headers: {
            "content-type": docx ? DOCX_CONTENT_TYPE : "application/json",
            "content-length": String(declared),
          },
        }),
    ).request(
      docx
        ? `/api/records/plans/${plan.id}/export.docx`
        : "/api/records/ledger",
    );
    expect(response.status).toBe(503);
    expect(body.cancel).toHaveBeenCalled();
  }
});

// 본문 읽기 중 연결 종료는 상류 reader를 취소하고 docx 임시 파일도 지운다
it.each([false, true])("docx=%s 본문 수신 중 취소", async (docx) => {
  const before = await temporaryDocx();
  const controller = new AbortController();
  const cancel = vi.fn();
  const pull = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ pull, cancel });
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(stream, {
        headers: {
          "content-type": docx ? DOCX_CONTENT_TYPE : "application/json",
        },
      }),
  );
  const pending = createApp(proxyConfig, fetcher).request(
    docx ? `/api/records/plans/${plan.id}/export.docx` : "/api/records/ledger",
    { signal: controller.signal },
  );
  await expect.poll(() => stream.locked).toBe(true);
  controller.abort();
  expect((await pending).status).toBe(503);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(cancel).toHaveBeenCalled();
  await expect.poll(temporaryDocx).toEqual(before);
});

// 상류 수신 후에도 브라우저 취소와 응답 reader 취소가 디스크 자원을 반납한다
it.each(["signal", "reader"])(
  "docx 다운로드 %s 취소 시 파일 정리",
  async (kind) => {
    const before = await temporaryDocx();
    const controller = new AbortController();
    const response = await createApp(
      proxyConfig,
      async () =>
        new Response(sizedBody(RECORDS_DOCX_MAX_BYTES, false).stream, {
          headers: { "content-type": DOCX_CONTENT_TYPE },
        }),
    ).request(`/api/records/plans/${plan.id}/export.docx`, {
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("docx 응답 스트림 없음");
    expect((await reader.read()).done).toBe(false);
    if (kind === "signal") {
      controller.abort();
      await expect(reader.closed).rejects.toThrow();
    } else {
      await reader.cancel();
    }
    await expect.poll(temporaryDocx).toEqual(before);
  },
);

// JSON과 바이너리 본문 모두 헤더 이후 멈춰도 5초를 넘기지 않는다
it.each([
  ["/api/regions.topojson", "application/json"],
  ["/api/evidence/stats", "application/json"],
  ["/api/records/ledger/verify", "application/json"],
  [`/api/records/plans/${plan.id}/export.docx`, DOCX_CONTENT_TYPE],
])("본문 지연 %s", async (path, contentType) => {
  vi.useFakeTimers();
  const stream = new TransformStream();
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(stream.readable, {
        headers: { "content-type": contentType },
      }),
  );
  const pending = createApp(proxyConfig, fetcher).request(path);
  await vi.waitFor(() => expect(stream.readable.locked).toBe(true));
  await vi.advanceTimersByTimeAsync(5_000);
  expect((await pending).status).toBe(503);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await stream.writable.abort();
  vi.useRealTimers();
  await expect.poll(temporaryDocx).toEqual([]);
});
