// 실제 임시 파일로 평가 결과의 없음·오류·계약 검증을 확인한다
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readLatestEval } from "../src/clients/eval-reader.js";
import { ops } from "./proxy-fixture.js";

// 실행별 임시 디렉터리를 정리해 공유 최신 결과를 바꾸지 않는다
it("파일이 없을 때만 null을 반환하고 잘못된 파일은 거부한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crowdcast-t310-eval-"));
  const path = join(directory, "latest.json");
  try {
    expect(await readLatestEval(path)).toBeNull();
    await writeFile(path, JSON.stringify(ops.evals));
    expect(await readLatestEval(path)).toEqual(ops.evals);
    await writeFile(path, "{");
    await expect(readLatestEval(path)).rejects.toThrow();
    await writeFile(path, JSON.stringify({ ...ops.evals, numberMismatch: -1 }));
    await expect(readLatestEval(path)).rejects.toThrow("계약 위반");
    await expect(readLatestEval(directory)).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
