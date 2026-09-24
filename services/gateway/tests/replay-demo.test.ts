// 발표 백업을 실제 런타임에서 명시적으로 녹화하고 기본 테스트에서는 읽기만 검증한다
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { DEMO_TRACE_DIRECTORY } from "../src/team/replay/read-trace.js";
import { replayGap } from "../src/team/replay/timing.js";
import { validateTrace } from "../src/team/replay/validate-trace.js";
import { teamTraceDirectory } from "../src/team/runtime/settings.js";
import { shortText, teamFixture } from "./team-fixture.js";

// 시각과 봉투를 고치지 않고 실제 분석 요청 한 건을 발표 백업에 복사한다
it.skipIf(process.env.T307_RECORD_DEMO !== "1")(
  "발표 백업 trace를 녹화한다",
  async () => {
    const harness = teamFixture({ env: { FORECAST_MODE: "fake" } });
    const id = await harness.create();
    await harness.message(id, { text: shortText });
    const original = await harness.message(id, {
      text: shortText,
      answer: {
        startsAt: "2026-10-18T19:00:00+09:00",
        endsAt: "2026-10-18T21:00:00+09:00",
        hostType: "지자체",
        hazards: ["폭죽"],
      },
    });
    expect(original.some((event) => event.event === "forecast")).toBe(true);
    const source = readFileSync(
      join(harness.traceDirectory, `${id}.jsonl`),
      "utf8",
    );
    const lines = source.trimEnd().split("\n");
    const requestId = JSON.parse(lines.at(-1) ?? "{}").requestId;
    const selected = `${lines
      .filter((line) => JSON.parse(line).requestId === requestId)
      .join("\n")}\n`;
    const events = validateTrace(selected);
    expect(events.map((event) => event.envelope)).toEqual(original);

    // 원본 세션도 공유 산출물에 보존해 요청 추출과 해시를 재검증할 수 있게 한다
    mkdirSync(teamTraceDirectory(), { recursive: true });
    mkdirSync(DEMO_TRACE_DIRECTORY, { recursive: true });
    const sourcePath = join(teamTraceDirectory(), `${id}.jsonl`);
    const demoPath = join(DEMO_TRACE_DIRECTORY, "demo-yeongjong.jsonl");
    writeFileSync(sourcePath, source);
    writeFileSync(demoPath, selected);
    console.log(
      JSON.stringify({
        sourcePath,
        sourceSha256: createHash("sha256").update(source).digest("hex"),
        demoPath,
        demoSha256: createHash("sha256").update(selected).digest("hex"),
        events: events.length,
        originalMs:
          Date.parse(events.at(-1)?.at ?? "") - Date.parse(events[0].at ?? ""),
        replayMs: events
          .slice(1)
          .reduce((total, event, i) => total + replayGap(events[i], event), 0),
      }),
    );
  },
);

// 기본 앱에 등록된 발표 파일이 외부 호출 없이 실제 SSE로 끝나는지 확인한다
it("커밋된 영종 trace는 검증을 통과하고 네트워크 없이 재생된다", async () => {
  const path = join(DEMO_TRACE_DIRECTORY, "demo-yeongjong.jsonl");
  const text = readFileSync(path, "utf8");
  const events = validateTrace(text);
  expect(events.every((event) => event.at !== undefined)).toBe(true);
  expect(events.some((event) => event.envelope.event === "forecast")).toBe(
    true,
  );
  expect(text).not.toMatch(
    /(?:01[016789]-?\d{3,4}-?\d{4}|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i,
  );
  expect(fileURLToPath(new URL("../fixtures/replay/", import.meta.url))).toBe(
    DEMO_TRACE_DIRECTORY,
  );
  const app = createApp(readConfig({}), async () => {
    throw new Error("외부 호출 금지");
  });
  const controller = new AbortController();
  const response = await app.request("/api/team/replay/demo-yeongjong", {
    signal: controller.signal,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  controller.abort();
  await response.body?.cancel();
});
