// 파일 교체·크기 증가에도 재생 파일 경계와 메모리 상한을 지키는지 검사한다
import { appendFileSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REPLAY_MAX_TRACE_BYTES,
  readTrace,
} from "../src/team/replay/read-trace.js";
import {
  contractEvents,
  replayFixture,
  traceId,
  traceText,
} from "./replay-fixture.js";
import { parseEvents } from "./team-fixture.js";

// 경합 시점만 고정하고 경로 해석과 파일 핸들은 실제 운영체제 구현을 쓴다
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    realpath: vi.fn(actual.realpath),
    open: vi.fn(actual.open),
  };
});

// 앞선 경합 주입이 다음 사례의 파일 접근에 남지 않게 한다
beforeEach(() => {
  vi.mocked(realpath).mockReset();
  vi.mocked(open).mockReset();
});

// 파일 오류는 SSE 헤더·대기·본문을 시작하지 않고 한 줄 JSON으로 응답해야 한다
async function expectInvalid(harness: ReturnType<typeof replayFixture>) {
  const response = await harness.request();
  expect(response.status).toBe(422);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("x-accel-buffering")).toBeNull();
  expect(await response.json()).toMatchObject({
    code: "TRACE_INVALID",
    message: expect.stringMatching(/^[^\r\n]+$/),
  });
  expect(harness.wait).not.toHaveBeenCalled();
}

describe("trace 파일 핸들 보호", () => {
  // 같은 폴더를 향하는 링크도 최종 파일로는 열지 않는다
  it("폴더 안 심볼릭 링크 trace를 거부한다", async () => {
    const harness = replayFixture();
    const original = harness.save(traceText(contractEvents()), "demo-source");
    symlinkSync(original, join(harness.directory, `${traceId}.jsonl`));
    await expectInvalid(harness);
  });

  // 실제 운영의 traces 공유 링크는 폴더 수준에서 계속 허용한다
  it("공유 폴더 링크 안의 일반 trace는 읽는다", async () => {
    const harness = replayFixture();
    const shared = replayFixture();
    const text = traceText(contractEvents());
    shared.save(text);
    const directory = join(harness.directory, "shared");
    symlinkSync(shared.directory, directory, "dir");
    expect(await readTrace(traceId, { traceDirectory: directory })).toBe(text);
  });

  // 이름이 올바르더라도 디렉터리는 trace로 읽지 않는다
  it("일반 파일이 아닌 trace를 거부한다", async () => {
    const harness = replayFixture();
    mkdirSync(join(harness.directory, `${traceId}.jsonl`));
    await expectInvalid(harness);
  });

  // 실제 경로 검사가 끝난 직후 파일을 외부 링크로 바꿔 TOCTOU를 재현한다
  it("realpath 뒤 심볼릭 링크로 교체된 파일을 읽지 않는다", async () => {
    const harness = replayFixture();
    const other = replayFixture();
    const path = harness.save(traceText(contractEvents()));
    const outside = other.save(traceText(contractEvents()));
    const actual =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    vi.mocked(realpath).mockImplementation(async (input) => {
      const result = await actual.realpath(input);
      if (input === path) {
        unlinkSync(path);
        symlinkSync(outside, path);
      }
      return result;
    });
    await expectInvalid(harness);
  });

  // JSON 내부 공백으로 유효한 파일을 만들어 바이트 상한 양쪽을 정확히 확인한다
  it.each([0, 1])(
    "2MB 상한에 %i바이트를 더한 파일을 검사한다",
    async (extra) => {
      const harness = replayFixture();
      const events = contractEvents();
      const text = traceText(events);
      const padding = " ".repeat(
        REPLAY_MAX_TRACE_BYTES - Buffer.byteLength(text) + extra,
      );
      harness.save(padding + text);
      if (extra) return expectInvalid(harness);
      const response = await harness.request();
      expect(response.status).toBe(200);
      expect(parseEvents(await response.text())).toEqual(events);
    },
  );

  // fstat 통과 뒤 커진 파일도 제한된 버퍼에서 거부하고 열린 핸들을 닫는다
  it("크기 검사 직후 증가한 파일은 422이며 핸들을 닫는다", async () => {
    const harness = replayFixture();
    const path = harness.save(traceText(contractEvents()));
    const actual =
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      );
    const file = await actual.open(path, "r");
    const close = vi.spyOn(file, "close");
    const stat = file.stat.bind(file);
    vi.spyOn(file, "stat").mockImplementationOnce(async () => {
      const result = await stat();
      appendFileSync(path, " ".repeat(REPLAY_MAX_TRACE_BYTES));
      return result;
    });
    vi.mocked(open).mockResolvedValueOnce(file);
    await expectInvalid(harness);
    expect(close).toHaveBeenCalledOnce();
  });
});
