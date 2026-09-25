// 세 시범 행사장의 실제 타일과 시각 전환·모션 감소를 브라우저에서 확인한다.
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const screens = resolve(process.cwd(), "../../reports/figures/screens");
const report = JSON.parse(readFileSync(resolve(process.cwd(), "../../packages/contracts/fixtures/forecast-report/valid-yeongjong.json"), "utf8"));

// 가짜 눈 예보와 낮 슬라이더가 함께 적용된 행사장 견본을 캡처한다.
test("행사장 눈·낮 예보와 견본 시간 문구", async ({ page }) => {
	await page.route("**/api/weather?**", (route) => {
		const url = new URL(route.request().url());
		return route.fulfill({ json: {
			lat: Number(url.searchParams.get("lat")), lng: Number(url.searchParams.get("lng")),
			at: url.searchParams.get("at"), sky: "흐림", pty: "눈", temp: 2,
			pop: 70, source: "단기예보", fetchedAt: url.searchParams.get("at"),
		} });
	});
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto("/dev/venue/yeongjong?sceneQuality=high&venueHour=12");
	await expect(page.locator("html")).toHaveAttribute("data-venue-ready", "true", { timeout: 45_000 });
	await expect(page.locator(".venue-3d__heading span")).toContainText("낮 · 눈");
	await expect(page.locator(".venue-3d__time")).toContainText("견본은 개최 시간 없음");
	await expect(page.locator(".venue-3d__honest")).toContainText("날씨 효과 = 기상청 예보 기반 연출");
	mkdirSync(screens, { recursive: true });
	await page.screenshot({ path: resolve(screens, "T-435-venue-snow.png") });
});

// 고정된 화면 크기와 시각으로 세 장소의 낮·밤 캡처를 남긴다.
for (const key of ["yeongjong", "hangang", "suwon"] as const) {
  test(`${key} 타일 장면과 낮·밤`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/dev/venue/${key}?sceneQuality=low&venueHour=12`);
    await expect
      .poll(() => page.locator("html").getAttribute("data-venue-ready"), {
        timeout: 45000,
      })
      .toBe("true");
    expect(
      Number(await page.locator("html").getAttribute("data-venue-buildings")),
    ).toBeGreaterThan(0);
    expect(
      Number(await page.locator("html").getAttribute("data-venue-cars")),
    ).toBeGreaterThan(0);
    await expect(page.locator("html")).toHaveAttribute("data-venue-sky", "day");
    mkdirSync(screens, { recursive: true });
    await page.screenshot({ path: resolve(screens, `T-434-${key}-day.png`) });
    const slider = page.getByRole("slider", { name: /행사일 시간대/ });
    await slider.focus();
    await slider.press("End");
    await expect(page.locator("html")).toHaveAttribute(
      "data-venue-sky",
      "night",
    );
    await page.screenshot({ path: resolve(screens, `T-434-${key}-night.png`) });
  });
}

// 모션 감소 설정에서는 슬라이더를 움직여도 같은 차량 행렬이 유지된다.
test("모션 감소 시 차량 위치가 고정된다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/venue/hangang?sceneQuality=low&venueHour=12");
  await expect
    .poll(() => page.locator("html").getAttribute("data-venue-ready"), {
      timeout: 45000,
    })
    .toBe("true");
  const before = await page.evaluate(() => window.__crowdcastVenueVehicle?.());
  const slider = page.getByRole("slider", { name: /행사일 시간대/ });
  await slider.focus();
  await slider.press("End");
  await expect(page.locator("html")).toHaveAttribute("data-venue-sky", "night");
  const after = await page.evaluate(() => window.__crowdcastVenueVehicle?.());
  expect(after).toEqual(before);
});

// 행사장 설명은 슬라이더를 따라가고 저장 버튼은 후처리 결과를 PNG로 만든다.
test("행사장 시각 설명과 PNG 저장", async ({ page }) => {
	await page.goto("/dev/venue/yeongjong?sceneQuality=high&venueHour=12");
	await expect(page.locator("html")).toHaveAttribute(
		"data-venue-ready",
		"true",
		{ timeout: 45_000 },
	);
	await expect(page.locator(".venue-3d [aria-live=polite]")).toContainText(
		"시각 12:00",
	);
	await page.getByRole("slider", { name: /행사일 시간대/ }).fill("13");
	await expect(page.locator(".venue-3d [aria-live=polite]")).toContainText(
		"시각 13:00",
	);
	const download = page.waitForEvent("download");
	await page.getByRole("button", { name: "장면 저장" }).click();
	const saved = await download;
	expect(saved.suggestedFilename()).toMatch(
		/^crowdcast-venue-\d{8}-\d{4}\.png$/,
	);
	expect(readFileSync((await saved.path()) ?? "").length).toBeGreaterThan(1000);
});

// 예보서 탭에서 행사장 캔버스를 열 번 새로 만들고 렌더러 메모리 개수를 비교한다.
test("행사장 탭 전환 10회 뒤 GPU 메모리 수가 늘지 않는다", async ({ page }) => {
  await page.route("**/api/forecasts/f-yeongjong-2025", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(report) }),
  );
  await page.goto("/f/f-yeongjong-2025?sceneQuality=high&sceneDiagnostic=1");
  const venueTab = page.getByRole("tab", { name: "행사장 3D" });
  const reportTab = page.getByRole("tab", { name: "예보서" });
  await venueTab.click();
  await expect(page.locator("html")).toHaveAttribute("data-venue-ready", "true", { timeout: 45_000 });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const initial = await page.evaluate(() => window.__crowdcastSceneMemory?.());
  for (let index = 0; index < 10; index++) {
    await reportTab.click();
    await venueTab.click();
    await expect(page.locator("html")).toHaveAttribute("data-venue-ready", "true", { timeout: 45_000 });
  }
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const final = await page.evaluate(() => window.__crowdcastSceneMemory?.());
  expect(final?.geometries).toBeLessThanOrEqual(initial?.geometries ?? 0);
  expect(final?.textures).toBeLessThanOrEqual(initial?.textures ?? 0);
});
