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
			`http://127.0.0.1:5184/?theme=${scene.sky}&at=2025-10-18T${scene.time}+09:00`,
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
		await expect(
			page.getByText("인원 규모는 예보값 비례 · 움직임은 연출"),
		).toBeVisible();
		await page.evaluate(() => document.fonts.ready);
		await page.screenshot({
			path: resolve(output, `T-431-scene-${scene.sky}.png`),
		});
	});
}

// WebGL2를 제공하지 않는 브라우저는 캔버스 대신 목록 안내를 보여 준다.
test("WebGL2 대체 안내", async ({ page }) => {
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
			return kind === "webgl2" ? null : original.call(this, kind, ...args);
		} as typeof original;
	});
	await page.goto("http://127.0.0.1:5184/");
	await expect(
		page.getByText("3D를 쓸 수 없는 환경이에요 — 목록으로 보기"),
	).toBeVisible();
});

// 진단 모드에서 품질 단계마다 실제 캔버스 픽셀 비율이 달라지는지 확인한다.
test("품질 단계의 DPR을 캔버스에 적용한다", async ({ page }) => {
	for (const [quality, expected] of [
		["high", 1],
		["medium", 0.85],
		["low", 0.65],
	] as const) {
		await page.goto(`http://127.0.0.1:5184/?sceneQuality=${quality}`);
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
			.locator("canvas")
			.evaluate((canvas) => canvas.width / canvas.clientWidth);
		expect(actual).toBeCloseTo(expected, 2);
	}
	await page.goto("http://127.0.0.1:5184/?sceneDiagnostic=1&sceneQuality=high");
	await expect(page.locator("html")).toHaveAttribute(
		"data-scene-ready",
		"true",
		{ timeout: 30_000 },
	);
	await page.evaluate(() => window.__crowdcastRegress?.());
	await page.waitForFunction(() => {
		const canvas = document.querySelector("canvas");
		return canvas && canvas.width / canvas.clientWidth < 0.75;
	});
});

// 타일을 반복해서 올렸다 내려도 렌더러의 형상·텍스처 수가 늘지 않아야 한다.
test("타일 재마운트 후 GPU 형상 수가 유지된다", async ({ page }) => {
	await page.goto("http://127.0.0.1:5184/?sceneDiagnostic=1&sceneQuality=high");
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
