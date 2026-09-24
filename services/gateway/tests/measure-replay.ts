// curl 수신 시각과 원본 trace 간격을 비교하고 SSE 봉투가 같은지 수동 검증한다
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SseEvent } from "@crowdcast/contracts/types";
import { DEMO_TRACE_DIRECTORY } from "../src/team/replay/read-trace.js";
import { replayGap } from "../src/team/replay/timing.js";
import { validateTrace } from "../src/team/replay/validate-trace.js";

// 발표 파일 또는 명시한 실제 세션 파일을 정본으로 읽고 curl은 로컬 주소에만 연결한다
const url = new URL(
  process.argv[2] ?? "http://127.0.0.1:8787/api/team/replay/demo-yeongjong",
);
assert.equal(url.hostname, "127.0.0.1");
const source = validateTrace(
  readFileSync(
    process.argv[3] ?? join(DEMO_TRACE_DIRECTORY, "demo-yeongjong.jsonl"),
    "utf8",
  ),
);
const started = performance.now();
const child = spawn("curl", ["-f", "-sS", "-N", "--max-time", "15", url.href], {
  stdio: ["ignore", "pipe", "inherit"],
});
const received: { at: number; envelope: SseEvent }[] = [];
let pending = "";

// 프레임 경계마다 도착 시각을 남겨 첫 이벤트부터 done까지의 시간을 잰다
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk: string) => {
  pending += chunk;
  let boundary = pending.indexOf("\n\n");
  while (boundary >= 0) {
    const frame = pending.slice(0, boundary);
    pending = pending.slice(boundary + 2);
    const data = frame.split("\n").find((line) => line.startsWith("data: "));
    if (data)
      received.push({
        at: performance.now(),
        envelope: JSON.parse(data.slice(6)),
      });
    boundary = pending.indexOf("\n\n");
  }
});

// curl 성공과 봉투 일치를 확인한 뒤 상한 전후 및 실제 수신 시간을 한 번만 출력한다
const code = await new Promise<number | null>((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
assert.equal(code, 0);
assert.deepEqual(
  received.map((event) => event.envelope),
  source.map((event) => event.envelope),
);
const gaps = source
  .slice(1)
  .map((event, index) => replayGap(source[index], event));
console.log(
  JSON.stringify(
    {
      url: url.href,
      events: received.length,
      originalMs:
        Date.parse(source.at(-1)?.at ?? "") - Date.parse(source[0].at ?? ""),
      cappedMs: gaps.reduce((total, gap) => total + gap, 0),
      cappedGaps: source
        .slice(1)
        .filter(
          (event, index) =>
            Date.parse(event.at ?? "") - Date.parse(source[index].at ?? "") >
            8_000,
        ).length,
      firstToDoneMs: Number(
        ((received.at(-1)?.at ?? 0) - received[0].at).toFixed(3),
      ),
      totalMs: Number((performance.now() - started).toFixed(3)),
      identical: true,
    },
    null,
    2,
  ),
);
