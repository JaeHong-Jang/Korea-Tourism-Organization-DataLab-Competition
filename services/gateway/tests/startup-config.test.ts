// 실제 .env·네트워크 없이 단독 기동의 설정 우선순위와 Ollama 후보 선택을 확인한다
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStartupConfig } from "../src/startup-config.js";

// 계약 등록에 필요한 파일은 읽되 테스트 중 .env 접근은 가짜 내용으로 교체한다
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

// 운영체제의 실제 경로 조회를 차단한다
vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

// 각 테스트는 빈 환경 파일과 기본 게이트웨이가 없는 상태에서 시작한다
beforeEach(() => {
  vi.mocked(readFileSync).mockReturnValue("");
  vi.mocked(execFileSync).mockReturnValue("");
});

// 호출 기록과 가짜 타이머가 다음 사례의 후보 선택에 영향을 주지 않게 한다
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// 후보 확인은 모델 실행이 없는 버전 조회만 허용한다
describe("단독 기동 설정", () => {
  // npm workspace의 cwd가 아닌 소스 위치에서 루트 .env를 찾는다
  it("루트 .env의 호스트·포트·서비스 주소를 읽는다", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      'OLLAMA_HOST="172.20.32.1:11435" # Windows 호스트\nGATEWAY_PORT=8788\nFORECAST_URL=http://127.0.0.1:9010\n',
    );
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null));
    const config = await readStartupConfig({}, fetcher);
    expect(config.ollamaHost).toBe("http://172.20.32.1:11435");
    expect(config.port).toBe(8788);
    expect(config.services.forecast).toBe("http://127.0.0.1:9010");
    expect(readFileSync).toHaveBeenLastCalledWith(
      new URL("../../../.env", import.meta.url),
      "utf8",
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "http://172.20.32.1:11435/api/version",
    );
  });

  // dev.mjs가 선택한 주소나 셸 설정을 .env가 덮어쓰면 안 된다
  it("기존 환경 변수를 우선하고 입력 환경을 변경하지 않는다", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      "OLLAMA_HOST=172.20.32.1:11434\nGATEWAY_PORT=8788\n",
    );
    const env = { OLLAMA_HOST: "http://127.0.0.1:11435", GATEWAY_PORT: "8789" };
    const config = await readStartupConfig(env, async () => new Response(null));
    expect(config.ollamaHost).toBe(env.OLLAMA_HOST);
    expect(config.port).toBe(8789);
    expect(env).toEqual({
      OLLAMA_HOST: "http://127.0.0.1:11435",
      GATEWAY_PORT: "8789",
    });
  });

  // 첫 주소의 연결 실패 뒤에 WSL의 Windows 호스트를 찾아야 한다
  it("환경 주소 다음에 WSL 기본 게이트웨이를 확인한다", async () => {
    vi.mocked(readFileSync).mockReturnValue("OLLAMA_HOST=127.0.0.1:11435");
    vi.mocked(execFileSync).mockReturnValue(
      "default via 172.20.32.1 dev eth0\n",
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("연결 실패"))
      .mockResolvedValueOnce(new Response(null));
    expect((await readStartupConfig({}, fetcher)).ollamaHost).toBe(
      "http://172.20.32.1:11434",
    );
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "http://127.0.0.1:11435/api/version",
      "http://172.20.32.1:11434/api/version",
    ]);
    expect(execFileSync).toHaveBeenCalledWith(
      "ip",
      ["route", "show", "default"],
      expect.objectContaining({ timeout: 1_000 }),
    );
  });

  // 두 후보가 HTTP 오류여도 미러링 모드의 루프백 주소를 시도한다
  it("마지막으로 127.0.0.1을 확인한다", async () => {
    vi.mocked(execFileSync).mockReturnValue(
      "default via 172.20.32.1 dev eth0\n",
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null));
    const config = await readStartupConfig(
      { OLLAMA_HOST: "127.0.0.1:11435" },
      fetcher,
    );
    expect(config.ollamaHost).toBe("http://127.0.0.1:11434");
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "http://127.0.0.1:11435/api/version",
      "http://172.20.32.1:11434/api/version",
      "http://127.0.0.1:11434/api/version",
    ]);
  });

  // 환경 파일이나 ip 명령이 없어도 기동할 수 있어야 한다
  it(".env와 ip 명령이 없으면 루프백을 사용한다", async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw Object.assign(new Error("파일 없음"), { code: "ENOENT" });
    });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("ip 없음");
    });
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null));
    expect((await readStartupConfig({}, fetcher)).ollamaHost).toBe(
      "http://127.0.0.1:11434",
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  // 실제 읽기 오류를 빈 환경으로 오해하면 설정 누락을 숨기게 된다
  it(".env 접근 오류는 기동 오류로 전달한다", async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw Object.assign(new Error("접근 오류"), { code: "EACCES" });
    });
    const fetcher = vi.fn<typeof fetch>();
    await expect(readStartupConfig({}, fetcher)).rejects.toThrow("접근 오류");
    expect(fetcher).not.toHaveBeenCalled();
  });

  // 같은 주소를 재시도하느라 시작 시간이 늘어나지 않게 한다
  it("정규화한 후보의 중복을 제거한다", async () => {
    vi.mocked(execFileSync).mockReturnValue("default via 127.0.0.1 dev lo\n");
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 503 }),
    );
    await readStartupConfig({ OLLAMA_HOST: "127.0.0.1:11434/" }, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  // 모든 Ollama가 꺼져 있어도 dev.mjs처럼 지정 주소 또는 기본값으로 앱을 연다
  it.each([undefined, "http://127.0.0.1:11435"])(
    "후보가 모두 꺼지면 설정 %s를 유지하고 반환한다",
    async (host) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError("연결 실패"));
      const config = await readStartupConfig({ OLLAMA_HOST: host }, fetcher);
      expect(config.ollamaHost).toBe(host ?? "http://127.0.0.1:11434");
    },
  );

  // 취소 신호를 무시하는 전송도 각 후보에 2초까지만 기다린다
  it("후보별 2초 마감 뒤에 시작 설정을 반환한다", async () => {
    vi.useFakeTimers();
    vi.mocked(execFileSync).mockReturnValue(
      "default via 172.20.32.1 dev eth0\n",
    );
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    const result = readStartupConfig(
      { OLLAMA_HOST: "127.0.0.1:11435" },
      fetcher,
    );
    await vi.advanceTimersByTimeAsync(6_000);
    expect((await result).ollamaHost).toBe("http://127.0.0.1:11435");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
