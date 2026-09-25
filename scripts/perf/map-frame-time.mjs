// T-445 실제 지도와 미니어처를 같은 Chromium 실행에서 1440×900 프레임 시간으로 비교한다.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = join(root, "reports/figures/perf");
const origin = "http://127.0.0.1:5188";

// 지도와 미니어처를 같은 서버에 올려 타일·폰트 경로와 브라우저 조건을 고정한다.
async function startServer() {
  const server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5188", "--strictPort"], { cwd: join(root, "apps/web"), stdio: ["ignore", "pipe", "pipe"] });
  let failure = "";
  server.stdout.on("data", (chunk) => { failure += String(chunk); });
  server.stderr.on("data", (chunk) => { failure += String(chunk); });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) {
      await new Promise((done) => setTimeout(done, 100));
      throw new Error(`T-445 서버 시작 실패: ${failure.trim()}`);
    }
    try { if ((await fetch(origin)).ok) return server; } catch { /* 시작 중인 로컬 서버를 기다린다. */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  server.kill();
  throw new Error(`T-445 지도 측정 서버를 시작하지 못했습니다. ${failure.trim()}`);
}

// 일정 시간의 requestAnimationFrame 간격을 모아 p50·p95를 계산한다.
async function frameTimes(page, seconds = 10) {
  const frames = await page.evaluate((duration) => new Promise((resolve) => {
    const deltas = [];
    let previous = 0;
    const end = performance.now() + duration;
    const tick = (time) => {
      if (previous) deltas.push(time - previous);
      previous = time;
      if (time < end) requestAnimationFrame(tick);
      else resolve(deltas);
    };
    requestAnimationFrame(tick);
  }), seconds * 1000);
  const sorted = frames.sort((a, b) => a - b);
  return { frames: sorted.length, p50_ms: sorted[Math.floor(sorted.length * 0.5)] ?? null, p95_ms: sorted[Math.floor(sorted.length * 0.95)] ?? null };
}

// 같은 화면의 미니어처·전국 지도·서울·부산을 순서대로 재고 건물 렌더도 확인한다.
async function measure(browser, view, center = null) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${origin}/?sceneFixture=1&view=${view}&sceneQuality=high&mapQuality=high&theme=day`);
  if (view === "miniature") await page.waitForFunction(() => document.documentElement.dataset.sceneReady === "true", undefined, { timeout: 45_000 });
  else {
    await page.waitForFunction(() => window.__crowdcastMap?.areTilesLoaded(), undefined, { timeout: 45_000 });
    if (center) {
      await page.evaluate((coords) => window.__crowdcastMap?.jumpTo({ center: coords, zoom: 15, pitch: 60 }), center);
      await page.waitForFunction(() => window.__crowdcastMap?.areTilesLoaded() && window.__crowdcastMap.queryRenderedFeatures({ layers: ["building-extrusion"] }).length > 0, undefined, { timeout: 45_000 });
    }
  }
  const result = await frameTimes(page);
  result.vehicles = Number(await page.locator("html").getAttribute("data-map-vehicles") ?? 0);
  result.people = Number(await page.locator("html").getAttribute("data-map-people") ?? 0);
  result.buildings = center ? await page.evaluate(() => window.__crowdcastMap?.queryRenderedFeatures({ layers: ["building-extrusion"] }).length ?? 0) : 0;
  await context.close();
  return result;
}

// p95가 미니어처보다 큰 조건을 숨기지 않고 파일과 종료 코드로 남긴다.
if (!process.argv.includes("--t440")) throw new Error("사용법: node scripts/perf/map-frame-time.mjs --t440");
const server = await startServer();
let browser;
try {
  browser = await chromium.launch({ args: ["--enable-gpu", "--use-gl=egl", "--enable-unsafe-swiftshader"] });
  const miniature = await measure(browser, "miniature");
  const overview = await measure(browser, "map");
  const seoul = await measure(browser, "map", [126.98, 37.56]);
  const busan = await measure(browser, "map", [129.08, 35.18]);
  const ratio = Math.max(overview.p95_ms, seoul.p95_ms, busan.p95_ms) / miniature.p95_ms;
  const report = { task: "T-445", viewport: "1440x900", browser: browser.version(), miniature, overview, seoul, busan, p95_ratio: ratio, passed: ratio <= 1 };
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "T-445-frame-time.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(output, "T-445-frame-time.md"), ["# T-445 지도 프레임 시간", "", "| 조건 | p50 | p95 | 사람 | 차량 | 건물 |", "| --- | ---: | ---: | ---: | ---: | ---: |", ...Object.entries({ "미니어처": miniature, "전국 3D 지도": overview, "서울 z15": seoul, "부산 z15": busan }).map(([name, value]) => `| ${name} | ${value.p50_ms?.toFixed(2)}ms | ${value.p95_ms?.toFixed(2)}ms | ${value.people} | ${value.vehicles} | ${value.buildings} |`), "", `- 최대 p95 비율 ${ratio.toFixed(2)}배 / 합격선 1.0배: ${report.passed ? "통과" : "미달"}`, ""].join("\n"));
  console.log(`T-445 p95 비율 ${ratio.toFixed(2)}배: ${report.passed ? "통과" : "미달"}`);
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
