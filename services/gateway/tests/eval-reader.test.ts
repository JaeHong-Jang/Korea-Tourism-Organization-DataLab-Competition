// 실제 임시 파일로 시나리오 집계의 없음·형식·단위 변환을 확인한다
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readLatestEval } from "../src/clients/eval-reader.js";

const latest = {
  measuredAt: "2026-09-25T05:11:15.793Z",
  mode: "fake",
  summary: {
    passed: 19,
    total: 20,
    unlinkedClaims: 1,
    numberMismatches: 2,
    checks: {
      sequence: { passed: 20, total: 20 },
      numbers: { passed: 18, total: 20 },
    },
    latency: {
      forecast: { n: 9, p50: 5300, p95: 7600 },
      publishedDone: { n: 10, p50: 11400, p95: 14600 },
    },
  },
};

// 실행별 임시 디렉터리를 정리해 공유 최신 결과를 바꾸지 않는다
it("최신 평가가 없거나 모양이 다르면 null이고 정상 집계는 초로 바꾼다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crowdcast-t310-eval-"));
  const path = join(directory, "latest.json");
  try {
    expect(await readLatestEval(path)).toBeNull();
    await writeFile(path, JSON.stringify(latest));
    expect(await readLatestEval(path)).toEqual({
      suite: "scenario",
      runAt: latest.measuredAt,
      cases: 20,
      unsupportedPublished: 1,
      numberMismatch: 2,
      passed: false,
      checks: latest.summary.checks,
      latencySeconds: {
        forecast: { n: 9, p50: 5.3, p95: 7.6 },
        publishedDone: { n: 10, p50: 11.4, p95: 14.6 },
      },
      mode: "fake",
    });
    await writeFile(path, "{");
    expect(await readLatestEval(path)).toBeNull();
    await writeFile(path, JSON.stringify({ ...latest, mode: "가짜" }));
    expect(await readLatestEval(path)).toBeNull();
    await writeFile(
      path,
      JSON.stringify({
        ...latest,
        summary: { ...latest.summary, numberMismatches: -1 },
      }),
    );
    expect(await readLatestEval(path)).toBeNull();
    await writeFile(
      path,
      JSON.stringify({
        ...latest,
        summary: { ...latest.summary, latency: null },
      }),
    );
    expect(await readLatestEval(path)).toBeNull();
    await expect(readLatestEval(directory)).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
