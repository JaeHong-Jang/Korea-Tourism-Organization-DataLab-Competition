// 실제 3D 지도의 사람·차량·행사 흐름과 낮·밤 표현을 확인한다.
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const screens = resolve(process.cwd(), "../../reports/figures/screens");
const local = "127.0.0.1";

// 타일 로딩과 스타일 재그리기가 끝난 뒤 진단 지도에 접근한다.
async function mapReady(page: import("@playwright/test").Page) {
	await expect(
		page.getByRole("region", { name: "대한민국 행사 3D 지도" }),
	).toBeVisible();
	await expect(page.locator(".map-2d__hint")).toBeVisible({ timeout: 45_000 });
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const map = (
						window as Window & { __crowdcastMap?: import("maplibre-gl").Map }
					).__crowdcastMap;
					return Boolean(map?.areTilesLoaded());
				}),
			{ timeout: 45_000 },
		)
		.toBe(true);
}

// 클릭 가능한 행사와 같은 중심으로 옮겨 MapLibre 렌더 레이어를 검사한다.
async function city(
	page: import("@playwright/test").Page,
	lng: number,
	lat: number,
) {
	await page.evaluate(
		([longitude, latitude]) => {
			const map = (
				window as Window & { __crowdcastMap?: import("maplibre-gl").Map }
			).__crowdcastMap;
			map?.jumpTo({ center: [longitude, latitude], zoom: 15, pitch: 60 });
		},
		[lng, lat],
	);
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const map = (
						window as Window & { __crowdcastMap?: import("maplibre-gl").Map }
					).__crowdcastMap;
					return map?.areTilesLoaded()
						? map.queryRenderedFeatures({ layers: ["building-extrusion"] })
								.length
						: 0;
				}),
			{ timeout: 45_000 },
		)
		.toBeGreaterThan(0);
}

// 로컬 PMTiles만 읽으며 전국·도시·밤 장면을 저장하고 지도 클릭을 목록과 대조한다.
test("기본 3D 지도에서 서울·부산 건물과 행사·차량을 본다", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const external: string[] = [];
	page.on("request", (request) => {
		const url = request.url();
		if (/^https?:/.test(url) && new URL(url).hostname !== local)
			external.push(url);
	});
	await page.goto("/?sceneFixture=1&mapQuality=high&theme=day");
	await mapReady(page);
	await expect(page.getByRole("button", { name: "3D 지도" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.locator(".map-2d__honest")).toContainText(
		"사람·차량 움직임은 연출",
	);
	const limits = await page.evaluate(() => {
		const map = (
			window as Window & { __crowdcastMap?: import("maplibre-gl").Map }
		).__crowdcastMap;
		return {
			west: map?.getMaxBounds()?.getWest() ?? 0,
			foreignCountryLayer: Boolean(map?.getLayer("places_country")),
		};
	});
	expect(limits.west).toBeGreaterThan(125);
	expect(limits.foreignCountryLayer).toBe(false);
	await page.screenshot({ path: resolve(screens, "T-445-overview.png") });

	await city(page, 126.98, 37.56);
	await expect
		.poll(async () =>
			Number(await page.locator("html").getAttribute("data-map-vehicles")),
		)
		.toBeGreaterThan(0);
	await expect
		.poll(async () =>
			Number(await page.locator("html").getAttribute("data-map-people")),
		)
		.toBeGreaterThan(0);
	expect(
		Number(await page.locator("html").getAttribute("data-map-trains")),
	).toBeGreaterThanOrEqual(0);
	expect(await page.locator(".map-3d-label").count()).toBeLessThanOrEqual(30);
	const gatheredBefore = Number(
		await page.locator("html").getAttribute("data-map-gathering"),
	);
	await page.screenshot({ path: resolve(screens, "T-445-seoul-day.png") });
	const point = await page.evaluate(() => {
		const map = (
			window as Window & { __crowdcastMap?: import("maplibre-gl").Map }
		).__crowdcastMap;
		const pixel = map?.project([126.98, 37.56]);
		return { x: pixel?.x ?? 0, y: pixel?.y ?? 0 };
	});
	await page.mouse.click(point.x, point.y);
	await expect(
		page.getByRole("region", { name: "선택 행사 요약" }),
	).toContainText("견본 행사 2");
	await expect(
		page.locator(".festival-list__items li.is-selected"),
	).toContainText("견본 행사 2");
	await expect
		.poll(async () =>
			Number(await page.locator("html").getAttribute("data-map-gathering")),
		)
		.toBeGreaterThan(gatheredBefore);
	await page.screenshot({ path: resolve(screens, "T-445-festival.png") });
	await page.getByRole("button", { name: "위에서 보기" }).click();
	await expect(page.locator(".map-2d")).toHaveAttribute("data-map-mode", "top");
	await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
	await page.getByRole("button", { name: "3D 지도" }).click();

	await city(page, 129.08, 35.18);
	await expect
		.poll(async () =>
			Number(await page.locator("html").getAttribute("data-map-people")),
		)
		.toBeGreaterThan(0);
	await page.goto("/?sceneFixture=1&mapQuality=high&theme=night");
	await mapReady(page);
	await city(page, 126.98, 37.56);
	await page.screenshot({ path: resolve(screens, "T-445-seoul-night.png") });
	expect(external).toEqual([]);
});
