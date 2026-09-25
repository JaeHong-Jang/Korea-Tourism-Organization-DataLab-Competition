// S1 필터·목록·KPI와 SVG 대체 지도의 선택 흐름 및 화면을 확인한다.
import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:5194";
const screens = resolve(process.cwd(), "../../reports/figures/screens");
const clock = "2026-10-18T12:00:00%2B09:00";
let server: ChildProcess;

// L4b의 전용 포트를 엄격하게 열어 다른 워크트리 서버를 재사용하지 않는다.
test.beforeAll(async () => {
	try {
		await fetch(origin);
		throw new Error("L4b S1 전용 포트가 이미 사용 중입니다.");
	} catch (error) {
		if (error instanceof Error && error.message.includes("이미 사용 중"))
			throw error;
	}
	server = spawn(
		process.execPath,
		[
			resolve(process.cwd(), "../../node_modules/vite/bin/vite.js"),
			"--host",
			"127.0.0.1",
			"--port",
			"5194",
			"--strictPort",
		],
		{ cwd: process.cwd(), stdio: "ignore" },
	);
	for (let attempt = 0; attempt < 60; attempt++) {
		if (server.exitCode !== null) break;
		try {
			if ((await fetch(origin)).ok) return;
		} catch {
			/* 기동 중인 서버를 기다린다. */
		}
		await new Promise((done) => setTimeout(done, 100));
	}
	throw new Error("L4b S1 테스트 서버를 시작하지 못했습니다.");
});
test.afterAll(() => server?.kill());

// 브라우저에서 Vite 모듈의 공개 스토어 상태를 읽어 화면 강조와 일치시키다.
async function selection(page: import("@playwright/test").Page) {
	return page.evaluate(async () => {
		const module = await import("/src/lib/selection-store.ts");
		const state = module.useSelectionStore.getState();
		return {
			festival: state.selectedFestivalId,
			sigungu: state.selectedSigunguCode,
		};
	});
}

// 필터를 합치면 목록과 KPI가 같은 2건을 보여 주고 카드 선택이 스토어에 남는다.
test("필터·목록·KPI와 선택", async ({ page }) => {
	await page.goto(`${origin}/?sceneFixture=1&theme=day&at=${clock}`);
	await expect(page.locator(".festival-list__items > li")).toHaveCount(30);
	await expect(page.locator(".scene-kpis__tiles")).toContainText("30건");
	await page.getByLabel("기간").selectOption("two-weeks");
	await expect(page.locator(".festival-list__items > li")).toHaveCount(14);
	await page.getByLabel("시도").selectOption("서울특별시");
	await page.getByRole("combobox", { name: "등급" }).selectOption("1");
	await expect(page.locator(".festival-list__items > li")).toHaveCount(2);
	await expect(page.locator(".scene-kpis__tiles")).toContainText("2건");
	await expect(page.locator(".festival-filters__actions")).toContainText(
		"적용 3개",
	);
	await page.locator(".festival-list__pick").first().click();
	await expect(page.locator(".festival-list__items > li").first()).toHaveClass(
		/is-selected/,
	);
	expect(await selection(page)).toEqual({
		festival: "e-scene-13",
		sigungu: "11110",
	});
	await page.locator(".festival-list__pick").first().press("ArrowDown");
	expect(await selection(page)).toEqual({
		festival: "e-scene-1",
		sigungu: "11110",
	});
	await page.getByRole("button", { name: "모두 초기화" }).click();
	await expect(page.locator(".festival-list__items > li")).toHaveCount(30);
	await expect(page.locator(".festival-filters__actions")).toContainText(
		"적용 0개",
	);
});

// 강제 SVG 보기에서도 지도 점과 카드가 동일한 행사·지역을 선택한다.
test("SVG 대체 지도에서 선택과 필터", async ({ page }) => {
	await page.goto(`${origin}/?sceneFixture=1&forceSvg=1&theme=day&at=${clock}`);
	await expect(
		page.getByRole("img", {
			name: "행사와 시군구를 선택할 수 있는 SVG 전국 지도",
		}),
	).toBeVisible();
	await expect(page.locator(".svg-korea-map__event")).toHaveCount(30);
	await page.getByRole("button", { name: "견본 행사 1, 1등급 선택" }).click();
	expect(await selection(page)).toEqual({
		festival: "e-scene-1",
		sigungu: "11110",
	});
	await expect(
		page.locator(".festival-list__items li.is-selected"),
	).toHaveCount(1);
	await page
		.getByRole("button", { name: /서울특별시 .* 선택/ })
		.first()
		.click();
	expect((await selection(page)).festival).toBeNull();
	await expect(
		page.getByRole("region", { name: "선택 행사 요약" }),
	).toHaveCount(0);
	await page.getByRole("button", { name: "견본 행사 1, 1등급 선택" }).click();
	await page
		.getByRole("button", { name: /서울특별시 .* 선택/ })
		.first()
		.press("Enter");
	expect((await selection(page)).festival).toBeNull();
	await page.getByLabel("시도").selectOption("부산광역시");
	await expect(page.locator(".svg-korea-map__event")).toHaveCount(5);
	await expect(page.locator(".festival-list__items > li")).toHaveCount(5);
	await expect(
		page.locator(".festival-list__items > li").first(),
	).toBeInViewport();
	await page.screenshot({ path: resolve(screens, "T-404-s1-svg.png") });
	await page
		.getByRole("button", { name: /대구광역시 .* 선택/ })
		.first()
		.click();
	await expect(page.getByLabel("시도")).toHaveValue("대구광역시");
	await expect(page.locator(".festival-list__items > li")).toHaveCount(0);
});

// 접으면 목록 본문과 요약이 사라지고 패널 높이가 줄어든 채 새로고침 뒤에도 유지된다.
test("행사 목록 접기와 기억", async ({ page }) => {
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto(`${origin}/?sceneFixture=1&forceSvg=1&theme=day&at=${clock}`);
	await expect(page.locator(".festival-list__items > li")).toHaveCount(30);
	const panel = page.locator('[data-feature="M1-F3"]');
	const before = await panel.boundingBox();
	await page.getByRole("button", { name: "목록 접기" }).click();
	await expect(page.locator(".festival-list__body")).toBeHidden();
	await expect(
		page.getByRole("button", { name: "목록 펼치기" }),
	).toHaveAttribute("aria-expanded", "false");
	const after = await panel.boundingBox();
	expect(before && after && after.height < before.height).toBe(true);
	await page.screenshot({ path: resolve(screens, "T-407b-s1-collapsed.png") });
	await page.reload();
	await expect(page.locator(".festival-list__body")).toBeHidden();
	await expect(
		page.getByRole("button", { name: "목록 펼치기" }),
	).toHaveAttribute("aria-expanded", "false");
});

// 낮과 밤, 모바일의 패널 배치를 같은 진단 자료로 저장한다.
for (const theme of ["day", "night"] as const) {
	test(`${theme} 패널 화면`, async ({ page }) => {
		await page.setViewportSize({ width: 1366, height: 768 });
		await page.goto(`${origin}/?sceneFixture=1&theme=${theme}&at=${clock}`);
		await expect(page.locator(".festival-list__items > li")).toHaveCount(30);
		await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
		await expect(page.locator("html")).toHaveAttribute(
			"data-scene-ready",
			"true",
			{ timeout: 30_000 },
		);
		await page.evaluate(() => document.fonts.ready);
		await page.screenshot({ path: resolve(screens, `T-404-s1-${theme}.png`) });
	});
}

test("모바일 패널 화면", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(`${origin}/?sceneFixture=1&forceSvg=1&theme=day&at=${clock}`);
	await expect(page.locator(".festival-list__items > li")).toHaveCount(30);
	const map = await page.locator(".scene-stage").boundingBox();
	const filter = await page.locator(".scene-filter").boundingBox();
	expect(map && filter && map.y + map.height <= filter.y).toBe(true);
	await page.getByRole("button", { name: "견본 행사 5, 1등급 선택" }).click();
	expect(await selection(page)).toEqual({
		festival: "e-scene-5",
		sigungu: "50110",
	});
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({
		path: resolve(screens, "T-404-s1-mobile.png"),
		fullPage: true,
	});
});
