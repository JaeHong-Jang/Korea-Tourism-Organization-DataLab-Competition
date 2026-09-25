// S5의 목록→재예보→실측→공유 화면을 계약 픽스처 기반 가짜 API로 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const fixture = (path: string) =>
	JSON.parse(
		readFileSync(
			resolve(process.cwd(), `../../packages/contracts/fixtures/${path}`),
			"utf8",
		),
	);
const event = fixture("event/valid-yeongjong.json");
const first = fixture("forecast-report/valid-yeongjong.json");
const comparison = {
	...fixture("reforecast-result/valid-weather-applied.json"),
	eventId: event.id,
};
const next = structuredClone(first);
next.forecastId = comparison.forecastId;
next.publishedAt = comparison.publishedAt;
next.forecast.peakConcurrent.p50 = comparison.peakConcurrent.after.p50;
next.forecast.dailyMean.p50 = comparison.dailyMean.after.p50;
const screens = resolve(process.cwd(), "../../reports/figures/screens");

// 모든 기록 경로를 실제 계약의 메서드·본문에 맞춰 응답한다.
test("S5 저장 행사에서 공유된 읽기 전용 예보서까지", async ({
	page,
	context,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	let snapshots = [first];
	let actualBody: Record<string, unknown> | null = null;
	const token = "sh-yeongjong2025abcd";
	await page.route("**/api/records/events", (route) =>
		route.fulfill({ json: [event] }),
	);
	await page.route(`**/api/records/events/${event.id}/snapshots`, (route) =>
		route.fulfill({ json: snapshots }),
	);
	await page.route(`**/api/events/${event.id}/reforecast`, (route) => {
		expect(route.request().method()).toBe("POST");
		snapshots = [next, first];
		return route.fulfill({ json: comparison });
	});
	await page.route("**/api/records/actuals", (route) => {
		expect(route.request().method()).toBe("POST");
		actualBody = route.request().postDataJSON();
		return route.fulfill({ json: { id: 1 } });
	});
	await page.route("**/api/records/shares", (route) => {
		expect(route.request().postDataJSON()).toEqual({
			forecastId: next.forecastId,
		});
		return route.fulfill({ json: { token } });
	});
	await page.route(`**/api/records/shares/${token}`, (route) =>
		route.fulfill({ json: next }),
	);

	// 선택 행의 발행 이력을 보고 재예보 카드가 계약 p50을 보여 주는지 확인한다.
	await page.goto("/my");
	await expect(page.getByRole("table").getByText(event.name)).toBeVisible();
	await expect(
		page.getByRole("list").getByText("21,000", { exact: false }),
	).toBeVisible();
	await page.screenshot({ path: resolve(screens, "T-409-list.png") });
	await page.getByRole("button", { name: "재예보", exact: true }).click();
	// 변화 카드 안의 숫자만 본다(같은 숫자가 이력 타임라인에도 나온다).
	const change = page.locator(".my-events-reforecast-card");
	await expect(change.getByText("18,500", { exact: false })).toBeVisible();
	await expect(change.getByText("46,000", { exact: false })).toBeVisible();
	await expect(
		page.getByRole("list").getByRole("link", { name: /18,500/ }),
	).toBeVisible();
	await page.screenshot({ path: resolve(screens, "T-409-reforecast.png") });

	// 지난 행사에 실측을 저장하고 공유 주소를 복사해 문서를 연다.
	await page.getByLabel("실측 항목").selectOption("peak");
	await page.getByLabel("인원").fill("18500");
	await page.getByLabel("출처").selectOption("사후집계");
	await page.getByLabel("범위").selectOption("행사장");
	await page.getByRole("button", { name: "실측 저장" }).click();
	await expect(page.getByRole("cell", { name: "실측 입력됨" })).toBeVisible();
	expect(actualBody).toMatchObject({
		eventId: event.id,
		actual: {
			value: 18500,
			unit: "명",
			timeUnit: "순간",
			spatialScope: "행사장",
			valueKind: "사후집계",
		},
	});
	await page.getByRole("button", { name: "공유 링크 만들기" }).click();
	await page.getByRole("button", { name: "주소 복사" }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
		`/s/${token}`,
	);
	await page.getByRole("link", { name: "공유 화면 열기" }).click();
	await expect(
		page.getByRole("heading", { name: "공유된 예보서" }),
	).toBeVisible();
	await expect(
		page.getByText("읽기 전용", { exact: false }).first(),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "재예보" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: /계획 초안/ })).toHaveCount(0);
	await page.screenshot({ path: resolve(screens, "T-409-shared.png") });
});
