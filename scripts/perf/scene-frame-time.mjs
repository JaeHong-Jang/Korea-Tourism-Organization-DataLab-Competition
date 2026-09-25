// 3D 장면을 30초씩 재생해 단독 실행과 Ollama 동시 추론의 프레임 시간을 기록한다.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = join(root, "reports/figures/perf");
const configured = existsSync(join(root, ".env")) ? parseEnv(readFileSync(join(root, ".env"), "utf8")) : {};
const model = process.env.OLLAMA_MODEL_FAST ?? configured.OLLAMA_MODEL_FAST ?? "qwen3:4b-instruct-2507-q4_K_M";
const festivalCard = JSON.parse(readFileSync(join(root, "packages/contracts/fixtures/festival-summary/valid-card.json"), "utf8"));

// 실제 규모의 행사 211건을 국내 좌표와 계약 필드로 만들어 같은 브라우저 실행에서 잰다.
function festivalScale211() {
  const codes = ["11110", "26110", "28110", "41111", "50110", "51110"];
  return Array.from({ length: 211 }, (_, index) => ({
    ...festivalCard,
    eventId: `e-scene-scale-${index + 1}`,
    forecastId: `f-scene-scale-${index + 1}`,
    name: `견본 행사 ${index + 1}`,
    sigunguCode: codes[index % codes.length],
    lat: 33.5 + (index % 17) * 0.26,
    lng: 126.1 + Math.floor(index / 17) * 0.23,
  }));
}

// 개발 서버와 같은 순서로 .env, WSL 게이트웨이, 로컬 주소를 시도한다.
function ollamaCandidates() {
  const hosts = [];
  const configuredHost = process.env.OLLAMA_HOST ?? configured.OLLAMA_HOST;
  if (configuredHost) hosts.push(configuredHost.startsWith("http") ? configuredHost : `http://${configuredHost}`);
  try {
    const gateway = execFileSync("ip", ["route", "show", "default"], { encoding: "utf8" }).split(" ")[2];
    if (gateway) hosts.push(`http://${gateway}:11434`);
  } catch { /* WSL 밖에서는 게이트웨이 후보를 생략한다. */ }
  hosts.push("http://127.0.0.1:11434");
  return [...new Set(hosts.map((host) => host.replace(/\/$/, "")))];
}

// 장면 전용 Vite 서버가 준비될 때까지 연결을 확인한다.
async function startServer() {
  const server = spawn(process.execPath, [join(root, "node_modules/vite/bin/vite.js"),
    "--host", "127.0.0.1", "--port", "5185", "--strictPort"],
  { cwd: join(root, "apps/web"), stdio: "ignore" });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch("http://127.0.0.1:5185/")).ok) return server;
    } catch { /* 서버 시작을 기다린다. */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  server.kill();
  throw new Error("성능 측정 서버를 시작하지 못했습니다.");
}

// 프레임 배열의 중앙·상위 5%·최대 간격을 밀리초로 남긴다.
function frameSummary(times) {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    frames: sorted.length,
    p50_ms: sorted[Math.floor(sorted.length * 0.5)] ?? null,
    p95_ms: sorted[Math.floor(sorted.length * 0.95)] ?? null,
    max_ms: sorted.at(-1) ?? null,
  };
}

// 로컬 Ollama에 설치된 받아쓰기 모델이 있는 경우에만 열 번 연속 호출한다.
async function findOllama() {
  for (const host of ollamaCandidates()) {
    try {
      const response = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (!response.ok) continue;
      const tags = await response.json();
      return { host, modelAvailable: tags.models?.some((item) => item.name === model) ?? false };
    } catch { /* 다음 주소를 확인한다. */ }
  }
  return null;
}

// 추론 요청은 30초 계측과 함께 시작하고 응답 내용은 저장하지 않는다.
async function runDictation(host) {
  let completed = 0;
  for (let index = 0; index < 10; index++) {
    const response = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: false, prompt: "2025 부산불꽃축제 행사명과 장소를 JSON으로 받아써 주세요.", options: { num_predict: 40 } }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}`);
    await response.arrayBuffer();
    completed++;
  }
  return completed;
}

// 품질과 DPR을 높음·1로 고정한 R3F 프레임과 Chromium 메모리를 읽는다.
async function measure(browser, ollamaHost, fixture = false, festivalCount = 0, motion = true, venue = null) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  if (festivalCount === 211) await page.route("**/api/festivals", (route) => route.fulfill({ json: festivalScale211() }));
  await page.goto(venue ? `http://127.0.0.1:5185/dev/venue/${venue}?sceneMeasure=1&venueHour=19` : `http://127.0.0.1:5185/?theme=day&at=2025-10-18T13:00+09:00&sceneMeasure=1&sceneDiagnostic=1${fixture ? "&sceneFixture=1" : ""}${motion ? "" : "&sceneMotion=0"}`);
  await page.waitForFunction((isVenue) => isVenue ? document.documentElement.dataset.venueReady === "true" : document.documentElement.dataset.sceneReady === "true", venue !== null, { timeout: 45000 });
  if (festivalCount || fixture) await page.waitForFunction((expected) => document.querySelectorAll(".festival-list__items li").length === expected, festivalCount || 30, { timeout: 30000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2");
    if (!gl) return "WebGL2 렌더러 확인 불가";
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
  });
  await page.evaluate(() => { window.__crowdcastSceneFrames = []; });
  const started = Date.now();
  const inference = ollamaHost ? runDictation(ollamaHost)
    .then((requests) => ({ requests, elapsed_ms: Date.now() - started }))
    .catch((error) => ({ error: String(error), elapsed_ms: Date.now() - started })) : null;
  await new Promise((done) => setTimeout(done, 30000));
  const metrics = await page.evaluate(() => ({
    frames: window.__crowdcastSceneFrames ?? [],
    heapUsed: performance.memory?.usedJSHeapSize ?? null,
    heapTotal: performance.memory?.totalJSHeapSize ?? null,
    quality: document.documentElement.dataset.sceneQuality ?? null,
    dolls: Number(document.documentElement.dataset.sceneDollCount ?? 0),
    festivals: document.querySelectorAll(".festival-list__items li").length,
    buildings: Number(document.documentElement.dataset.venueBuildings ?? 0),
    cars: Number(document.documentElement.dataset.venueCars ?? 0),
    render: window.__crowdcastSceneRender?.() ?? window.__crowdcastVenueRender?.() ?? null,
    actualDpr: (() => {
      const canvas = document.querySelector("canvas");
      return canvas && canvas.clientWidth ? canvas.width / canvas.clientWidth : null;
    })(),
  }));
  const inferenceResult = inference ? await inference : null;
  const result = {
    duration_ms: 30000,
    ...frameSummary(metrics.frames),
    quality: metrics.quality,
    actual_dpr: metrics.actualDpr,
    dolls: metrics.dolls,
    festivals: metrics.festivals,
    buildings: metrics.buildings,
    cars: metrics.cars,
    draw_calls: metrics.render?.calls ?? null,
    triangles: metrics.render?.triangles ?? null,
    renderer,
    software_renderer: /swiftshader|llvmpipe|software/i.test(renderer),
    js_heap_used_bytes: metrics.heapUsed,
    js_heap_total_bytes: metrics.heapTotal,
    gpu_memory_bytes: null,
    gpu_memory_note: "측정 불가(WebGL 메모리 API 없음, WSL NVML 접근 차단)",
    ollama_requests: inferenceResult?.requests ?? 0,
    ollama_elapsed_ms: inferenceResult?.elapsed_ms ?? null,
    ollama_error: inferenceResult?.error ?? null,
  };
  await context.close();
  return result;
}

// 두 조건을 같은 크기의 Chromium 창에서 차례로 재고 요약 파일을 남긴다.
const server = await startServer();
let browser;
try {
  browser = await chromium.launch({ args: ["--enable-gpu", "--use-gl=egl", "--enable-precise-memory-info", "--enable-unsafe-swiftshader"] });
  if (process.argv.includes("--t434")) {
    // 전국 기준과 세 행사장을 같은 Chromium 실행에서 재고 가장 느린 장면으로 판정한다.
    const baseline = await measure(browser, null, true, 0, false);
    const venues = {};
    for (const key of ["yeongjong", "hangang", "suwon"]) venues[key] = await measure(browser, null, false, 0, true, key);
    const p95Ratio = Math.max(...Object.values(venues).map((result) => result.p95_ms / baseline.p95_ms));
    const report = { task: "T-434", baseline_t433b: baseline, venues, p95_ratio: p95Ratio, passed: p95Ratio <= 1.3 };
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "T-434-frame-time.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(output, "T-434-frame-time.md"), ["# T-434 행사장 디오라마 프레임 시간", "", "| 장면 | p50 | p95 | 건물 | 차량 |", "| --- | ---: | ---: | ---: | ---: |", ...Object.entries({ "T-433b 기준": baseline, ...venues }).map(([key, result]) => `| ${key} | ${result.p50_ms?.toFixed(2)}ms | ${result.p95_ms?.toFixed(2)}ms | ${result.buildings} | ${result.cars} |`), `- 최고 p95 비율 ${p95Ratio.toFixed(2)}배 / 합격선 1.3배: ${report.passed ? "통과" : "미달"}`, ""].join("\n"));
    console.log(`T-434 최고 p95 비율 ${p95Ratio.toFixed(2)}배: ${report.passed ? "통과" : "미달"}`);
    if (!report.passed) process.exitCode = 1;
  } else if (process.argv.includes("--t434a")) {
    // 같은 브라우저 실행에서 이동 레이어만 끈 기준과 켠 장면을 차례로 잰다.
    const baseline = await measure(browser, null, true, 0, false);
    const animated = await measure(browser, null, true);
    if (baseline.festivals !== 30 || animated.festivals !== 30) throw new Error("견본 행사 30건 조건 불일치");
    const p95Ratio = animated.p95_ms / baseline.p95_ms;
    const report = { task: "T-434a", viewport: "1366x768", quality: "high (고정)", seconds_per_case: 30, baseline_t433b: baseline, with_motion: animated, p50_ratio: animated.p50_ms / baseline.p50_ms, p95_ratio: p95Ratio, passed: p95Ratio <= 1.3 };
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "T-434a-frame-time.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(output, "T-434a-frame-time.md"), [
      "# T-434a 전국 판 이동 연출 프레임 시간", "",
      `- 조건: Chromium ${browser.version()}, ${report.viewport}, high, 각 30초, 견본 행사 30건`,
      `- 렌더러: ${animated.renderer}${animated.software_renderer ? " (소프트웨어 렌더러)" : ""}`, "",
      "| 조건 | p50 | p95 | draw calls | triangles |", "| --- | ---: | ---: | ---: | ---: |",
      `| 같은 실행의 T-433b 장면 | ${baseline.p50_ms?.toFixed(2)}ms | ${baseline.p95_ms?.toFixed(2)}ms | ${baseline.draw_calls} | ${baseline.triangles} |`,
      `| 이동 연출 포함 | ${animated.p50_ms?.toFixed(2)}ms | ${animated.p95_ms?.toFixed(2)}ms | ${animated.draw_calls} | ${animated.triangles} |`,
      `- 비율: p50 ${report.p50_ratio.toFixed(2)}배, p95 ${p95Ratio.toFixed(2)}배 (합격선 1.3배): ${report.passed ? "통과" : "미달"}`, "",
    ].join("\n"));
    console.log(`T-434a p95 비율 ${p95Ratio.toFixed(2)}배: ${report.passed ? "통과" : "미달"}`);
    if (!report.passed) process.exitCode = 1;
  } else if (process.argv.includes("--t433")) {
    const t432Condition = await measure(browser, null, true);
    const actualScale = await measure(browser, null, false, 211);
    if (t432Condition.festivals !== 30 || actualScale.festivals !== 211) throw new Error(`행사 조건 불일치: ${t432Condition.festivals}건 / ${actualScale.festivals}건`);
    const report = {
      task: "T-433", viewport: "1366x768", quality: "high (고정)", seconds_per_case: 30,
      t432_condition: t432Condition, festivals_211: actualScale,
      p50_ratio: actualScale.p50_ms / t432Condition.p50_ms,
      p95_ratio: actualScale.p95_ms / t432Condition.p95_ms,
    };
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "T-433-frame-time.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(output, "T-433-frame-time.md"), [
      "# T-433 행사 211건 프레임 시간", "",
      `- 조건: Chromium ${browser.version()}, ${report.viewport}, high, 각 30초`,
      `- 렌더러: ${actualScale.renderer}${actualScale.software_renderer ? " (소프트웨어 렌더러)" : ""}`, "",
      "| 조건 | p50 | p95 | draw calls | triangles |", "| --- | ---: | ---: | ---: | ---: |",
      `| 같은 실행의 T-432 견본 30건 | ${t432Condition.p50_ms?.toFixed(2)}ms | ${t432Condition.p95_ms?.toFixed(2)}ms | ${t432Condition.draw_calls} | ${t432Condition.triangles} |`,
      `| 행사 211건 | ${actualScale.p50_ms?.toFixed(2)}ms | ${actualScale.p95_ms?.toFixed(2)}ms | ${actualScale.draw_calls} | ${actualScale.triangles} |`,
      `- 비율: p50 ${report.p50_ratio.toFixed(2)}배, p95 ${report.p95_ratio.toFixed(2)}배`, "",
    ].join("\n"));
    console.log(`행사 211건 / T-432 조건: p50 ${report.p50_ratio.toFixed(2)}배, p95 ${report.p95_ratio.toFixed(2)}배`);
  } else if (process.argv.includes("--t432")) {
    const sameRunBaseline = await measure(browser, null, false);
    const crowd = await measure(browser, null, true);
    if (crowd.dolls !== 2000) throw new Error(`인형 2,000개 조건 불일치: ${crowd.dolls}개`);
    const baselinePath = join(output, "T-431-frame-time.json");
    const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")).standalone : null;
    const report = { task: "T-432", viewport: "1366x768", requested_dpr: 1, quality: "high (고정)", seconds: 30, baseline_t431: baseline ? { p50_ms: baseline.p50_ms, p95_ms: baseline.p95_ms, renderer: baseline.renderer } : null, same_run_baseline: sameRunBaseline, crowd };
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "T-432-frame-time.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(output, "T-432-frame-time.md"), [
      "# T-432 3D 인형 2,000개 프레임 시간", "",
      `- 조건: Chromium ${browser.version()}, ${report.viewport}, high, DPR ${crowd.actual_dpr}, ${crowd.dolls}개, 30초`,
      `- 렌더러: ${crowd.renderer}${crowd.software_renderer ? " (소프트웨어 렌더러)" : ""}`,
      "",
      "| 조건 | p50 | p95 | draw calls | triangles |",
      "| --- | ---: | ---: | ---: | ---: |",
      `| T-432 수정 전(게이트 피드백) | 미기록 | 170.20ms | 약 445 | 미기록 |`,
      `| 같은 실행의 빈 장면 | ${sameRunBaseline.p50_ms?.toFixed(2)}ms | ${sameRunBaseline.p95_ms?.toFixed(2)}ms | ${sameRunBaseline.draw_calls ?? "측정 불가"} | ${sameRunBaseline.triangles ?? "측정 불가"} |`,
      `| T-432 수정 후 | ${crowd.p50_ms?.toFixed(2)}ms | ${crowd.p95_ms?.toFixed(2)}ms | ${crowd.draw_calls ?? "측정 불가"} | ${crowd.triangles ?? "측정 불가"} |`,
      "",
      baseline ? `- T-431 기준: p50 ${baseline.p50_ms?.toFixed(2)}ms, p95 ${baseline.p95_ms?.toFixed(2)}ms (${baseline.renderer})` : "- T-431 기준: 기록 없음",
      `- p95 ≤ 80ms 목표: ${crowd.p95_ms !== null && crowd.p95_ms <= 80 ? "통과" : "미달"}; 빈 장면과 인형 장면의 p95 차이 ${(crowd.p95_ms - sameRunBaseline.p95_ms).toFixed(2)}ms`,
      "- 프레임 시간은 이 실행 환경의 렌더러에만 해당한다.", "",
    ].join("\n"));
    console.log(`인형 ${crowd.dolls}개 p50 ${crowd.p50_ms?.toFixed(2)}ms / p95 ${crowd.p95_ms?.toFixed(2)}ms; ${crowd.renderer}`);
  } else {
  const standalone = await measure(browser, null);
  const ollama = await findOllama();
  const concurrent = !ollama ? "측정 불가(Ollama 없음)" : !ollama.modelAvailable
    ? "측정 불가(받아쓰기 모델 없음)" : await measure(browser, ollama.host);
  const report = {
    task: "T-431",
    viewport: "1366x768",
    requested_dpr: 1,
    quality: "high (고정)",
    seconds_per_case: 30,
    browser: browser.version(),
    gpu_attempt: "Chromium --enable-gpu --use-gl=egl; WSL NVML 접근 차단",
    boundary_source: "공용 시군구 TopoJSON 252개",
    standalone,
    with_ollama: concurrent,
  };
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "T-431-frame-time.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(output, "T-431-frame-time.md"), [
    "# T-431 3D 장면 프레임 시간",
    "",
    `- 조건: Chromium ${report.browser}, ${report.viewport}, 품질 ${report.quality}, 각 30초`,
    `- 실제 캔버스 DPR: 단독 ${standalone.actual_dpr}, 동시 ${typeof concurrent === "string" ? concurrent : concurrent.actual_dpr}`,
    `- GPU 가속 시도: ${report.gpu_attempt}`,
    `- WebGL 렌더러: ${standalone.renderer}${standalone.software_renderer ? " (소프트웨어 렌더러; 실제 GPU 성능으로 해석할 수 없음)" : ""}`,
    `- 단독: ${standalone.frames}프레임, p50 ${standalone.p50_ms?.toFixed(2)}ms, p95 ${standalone.p95_ms?.toFixed(2)}ms, 최대 ${standalone.max_ms?.toFixed(2)}ms`,
    `- JS 힙: ${standalone.js_heap_used_bytes ?? "측정 불가"} bytes`,
    `- GPU 메모리: ${standalone.gpu_memory_note}`,
    typeof concurrent === "string" ? `- Ollama 동시: ${concurrent}` : `- Ollama 동시(연속 요청 ${concurrent.ollama_requests}회): p50 ${concurrent.p50_ms?.toFixed(2)}ms, p95 ${concurrent.p95_ms?.toFixed(2)}ms, 최대 ${concurrent.max_ms?.toFixed(2)}ms`,
    typeof concurrent === "string" ? "" : `- Ollama 요청 소요: ${concurrent.ollama_elapsed_ms}ms${concurrent.ollama_error ? `, 오류: ${concurrent.ollama_error}` : ""}`,
    typeof concurrent === "string" ? "" : `- 동시 JS 힙: ${concurrent.js_heap_used_bytes ?? "측정 불가"} bytes`,
    typeof concurrent === "string" ? "" : `- 동시 측정 WebGL 렌더러: ${concurrent.renderer}`,
    "- 공개 경계 링크를 일반 브라우저 요청으로 읽었다.",
    "",
  ].join("\n"));
  console.log(`단독 p50 ${standalone.p50_ms?.toFixed(2)}ms / p95 ${standalone.p95_ms?.toFixed(2)}ms; Ollama: ${typeof concurrent === "string" ? concurrent : "측정 완료"}`);
  }
} finally {
  await browser?.close();
  server.kill();
}
