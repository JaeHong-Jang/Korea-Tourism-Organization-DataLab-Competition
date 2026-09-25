// 고정 시각의 낮·노을·밤 장면을 첫 렌더 뒤 같은 해상도로 저장한다.
import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const output = resolve(process.cwd(), "../../reports/figures/screens");
let server: ChildProcess;

test.use({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });

// 다른 웹 레인의 5173 서버와 충돌하지 않게 장면 테스트 전용 서버를 띄운다.
test.beforeAll(async () => {
  server = spawn(
    process.execPath,
    [
      resolve(process.cwd(), "../../node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5184",
      "--strictPort",
    ],
    { cwd: process.cwd(), stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:5184/");
      if (response.ok) return;
    } catch {
      /* 서버 시작을 기다린다. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("장면 테스트 서버를 시작하지 못했습니다.");
});

test.afterAll(() => server?.kill());

// 공개 경계 링크를 일반 브라우저 요청으로 읽고 렌더 완료 뒤 캡처한다.
for (const scene of [
  { sky: "day", time: "13:00" },
  { sky: "dusk", time: "18:00" },
  { sky: "night", time: "21:00" },
] as const) {
  test(`${scene.sky} 장면 캡처`, async ({ page }) => {
    await page.goto(
      `http://127.0.0.1:5184/?view=miniature&theme=${scene.sky}&at=2025-10-18T${scene.time}+09:00`,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-scene-sky",
      scene.sky,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-scene-ready",
      "true",
      { timeout: 30_000 },
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.locator(".scene-legend")).toContainText("움직임은 연출");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: resolve(output, `T-431-scene-${scene.sky}.png`),
    });
  });
}

// 견본 30건이 있는 낮·밤 장면에서 군중과 범례의 축척을 함께 확인한다.
for (const scene of [
  { sky: "day", time: "13:00" },
  { sky: "night", time: "21:00" },
] as const) {
  test(`T-432 견본 ${scene.sky} 장면`, async ({ page }) => {
    await page.goto(
      `http://127.0.0.1:5184/?sceneFixture=1&view=miniature&sceneQuality=high&theme=${scene.sky}&at=2025-10-18T${scene.time}+09:00`,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-scene-ready",
      "true",
      { timeout: 30_000 },
    );
    const count = Number(
      await page.locator("html").getAttribute("data-scene-doll-count"),
    );
    const scale = Number(
      await page.locator("html").getAttribute("data-scene-people-per-doll"),
    );
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(2000);
    await expect(page.locator(".scene-legend")).toContainText(
      `인형 1개 = ${scale.toLocaleString("ko-KR")}명`,
    );
    await expect(page.locator(".scene-legend__grade")).toHaveCount(4);
    await expect(page.locator(".festival-list__items li")).toHaveCount(30);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: resolve(output, `T-432-scene-${scene.sky}.png`),
    });
    if (scene.sky === "day") {
      await page.goto("http://127.0.0.1:5184/?sceneFixture=1&view=miniature&sceneQuality=high&sceneFocus=26470&theme=day&at=2025-10-18T13:00+09:00");
      await expect(page.locator("html")).toHaveAttribute("data-scene-ready", "true", { timeout: 30_000 });
      await expect(page.locator(".scene-name-tag:not(.scene-name-tag--far)").first()).toBeVisible();
      await page.screenshot({ path: resolve(output, "T-432-scene-close.png") });
    }
  });
}

// 쿼리가 없으면 견본 인형과 모형을 장면에 넣지 않는다.
test("견본 쿼리가 없는 장면은 군중이 비어 있다", async ({ page }) => {
  await page.goto("http://127.0.0.1:5184/?view=miniature&theme=day&at=2025-10-18T13:00+09:00");
  await expect(page.locator("html")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 30_000 },
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-scene-doll-count",
    "0",
  );
  await expect(page.locator(".festival-list__items li")).toHaveCount(0);
});

// WebGL2를 제공하지 않는 브라우저는 캔버스 대신 SVG 전국 지도와 같은 행사 목록을 보여 준다(M1-F1-f — T-404).
test("WebGL2 대체 안내", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === "webgl2" ? null : original.call(this, kind, ...args);
    } as typeof original;
  });
  await page.goto("http://127.0.0.1:5184/?sceneFixture=1&view=miniature");
  await expect(page.locator(".svg-korea-map")).toBeVisible();
  await expect(
    page.locator(".scene-stage canvas, .assistant-whale canvas"),
  ).toHaveCount(0);
  await expect(
    page.locator(".festival-list__items li"),
  ).toHaveCount(30);
  await expect(
    page.locator(".festival-list__items li .festival-list__pick").first(),
  ).toBeVisible();
});

// 진단 모드에서 품질 단계마다 실제 캔버스 픽셀 비율이 달라지는지 확인한다.
test("품질 단계의 DPR을 캔버스에 적용한다", async ({ page }) => {
  // 장면을 네 번 새로 여는 테스트라 전체 실행 부하(소프트웨어 렌더러)에서는 30초를 넘길 수 있다.
  test.setTimeout(60_000);
  for (const [quality, expected] of [
    ["high", 1],
    ["medium", 0.85],
    ["low", 0.65],
  ] as const) {
    await page.goto(`http://127.0.0.1:5184/?view=miniature&sceneQuality=${quality}`);
    await expect(page.locator("html")).toHaveAttribute(
      "data-scene-quality",
      quality,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-scene-ready",
      "true",
      { timeout: 30_000 },
    );
    const actual = await page
      .locator(".scene-stage canvas")
      .evaluate((canvas) => canvas.width / canvas.clientWidth);
    expect(actual).toBeCloseTo(expected, 2);
  }
  await page.goto("http://127.0.0.1:5184/?view=miniature&sceneDiagnostic=1&sceneQuality=high");
  await expect(page.locator("html")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 30_000 },
  );
  await page.evaluate(() => window.__crowdcastRegress?.());
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".scene-stage canvas");
    return canvas && canvas.width / canvas.clientWidth < 0.75;
  });
});

// Canvas가 다시 렌더돼도(창 크기 변경) 낮은 품질의 DPR이 1로 되돌아가지 않아야 한다.
test("낮은 품질 DPR이 재렌더 뒤에도 유지된다", async ({ page }) => {
  await page.goto("http://127.0.0.1:5184/?view=miniature&sceneQuality=low");
  await expect(page.locator("html")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 30_000 },
  );
  const ratio = () =>
    page
      .locator(".scene-stage canvas")
      .evaluate((canvas) => canvas.width / canvas.clientWidth);
  expect(await ratio()).toBeCloseTo(0.65, 2);
  await page.setViewportSize({ width: 1180, height: 720 });
  await page.waitForTimeout(300);
  expect(await ratio()).toBeCloseTo(0.65, 2);
});

// 타일을 반복해서 올렸다 내려도 렌더러의 형상·텍스처 수가 늘지 않아야 한다.
test("타일 재마운트 후 GPU 형상 수가 유지된다", async ({ page }) => {
  await page.goto("http://127.0.0.1:5184/?view=miniature&sceneDiagnostic=1&sceneQuality=high");
  await expect(page.locator("html")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 30_000 },
  );
  const initial = await page.evaluate(() => window.__crowdcastSceneMemory?.());
  expect(initial).toBeTruthy();
  for (let index = 0; index < 3; index++) {
    await page.evaluate(() => window.__crowdcastToggleLand?.(false));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__crowdcastToggleLand?.(true));
    await page.waitForTimeout(100);
  }
  const final = await page.evaluate(() => window.__crowdcastSceneMemory?.());
  expect(final?.geometries).toBeLessThanOrEqual(initial?.geometries ?? 0);
  expect(final?.textures).toBeLessThanOrEqual(initial?.textures ?? 0);
});

// 느린 프레임을 연속 주입하면 자동 품질이 낮음으로 내려가고 후처리와 DPR을 함께 낮춘다.
test("자동 품질 강등은 후처리와 DPR을 줄인다", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
  });
  await page.goto("http://127.0.0.1:5184/?sceneFixture=1&view=miniature&sceneDiagnostic=1");
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
		{ timeout: 30_000 },
	);
	await page.evaluate(() => window.__crowdcastFeedFrame?.(45, 360));
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-quality",
		"low",
	);
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-effects",
		"off",
	);
	const dpr = await page
		.locator(".scene-stage canvas")
		.evaluate((canvas) => canvas.width / canvas.clientWidth);
	expect(dpr).toBeLessThanOrEqual(0.66);
});

// 데이터 모드로 땅 타일을 다섯 번 다시 만든 뒤 형상·텍스처가 원래 개수로 돌아온다.
test("데이터 모드 전환 5회 뒤 GPU 리소스 수가 늘지 않는다", async ({ page }) => {
	await page.goto(
		"http://127.0.0.1:5184/?sceneFixture=1&view=miniature&sceneQuality=high&sceneDiagnostic=1",
	);
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
		{ timeout: 30_000 },
	);
	const memory = () => page.evaluate(() => window.__crowdcastSceneMemory?.());
	const initial = await memory();
	// 데이터 모드는 땅 모형을 다시 만들어 부하가 크면 전환에 몇 초가 걸린다.
	test.setTimeout(150_000);
	const toggle = page.getByRole("button", { name: "데이터 모드" });
	for (let index = 0; index < 5; index++) {
		for (const pressed of ["true", "false"]) {
			await toggle.click();
			await expect(toggle).toHaveAttribute("aria-pressed", pressed, {
				timeout: 30_000,
			});
			await expect(page.locator("html")).toHaveAttribute(
				"data-scene-ready",
				"true",
				{ timeout: 30_000 },
			);
		}
	}
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
	);
	const final = await memory();
	expect(final?.geometries).toBeLessThanOrEqual(initial?.geometries ?? 0);
	expect(final?.textures).toBeLessThanOrEqual(initial?.textures ?? 0);
});

