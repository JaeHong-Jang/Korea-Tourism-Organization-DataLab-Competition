// 임시 사용 모델 포인터의 선택 판정과 누락 처리를 확인한다
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readPromotedVerdict } from "../src/clients/promoted-reader.js";

// 포인터가 없거나 판정이 빠졌을 때 임의로 통과 처리하지 않는다
it("사용 모델의 통과·미검증만 읽고 없는 판정은 생략한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crowdcast-promoted-"));
  const path = join(directory, "promoted.json");
  try {
    expect(await readPromotedVerdict(path)).toBeUndefined();
    await writeFile(path, JSON.stringify({ verdict: "미검증" }));
    expect(await readPromotedVerdict(path)).toBe("미검증");
    await writeFile(path, JSON.stringify({ verdict: "통과" }));
    expect(await readPromotedVerdict(path)).toBe("통과");
    await writeFile(path, JSON.stringify({ verdict: "실패" }));
    expect(await readPromotedVerdict(path)).toBeUndefined();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
