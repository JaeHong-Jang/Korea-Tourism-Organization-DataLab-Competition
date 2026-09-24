// 계약 SSE를 POST 응답으로 흘려 상담 질문과 숫자 발행 전 단계를 검사한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SseEvent } from "@crowdcast/contracts/types";
import { expect, type Page, test } from "@playwright/test";

const fixture = (name: string): SseEvent[] =>
	JSON.parse(
		readFileSync(
			resolve(
				process.cwd(),
				"../../packages/contracts/fixtures-sse",
				`${name}.json`,
			),
			"utf8",
		),
	);
const output = resolve(process.cwd(), "../../reports/figures/screens");
const frames = (events: SseEvent[]) =>
	events
		.map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
		.join("");

// 첫 응답은 카드 확인 질문으로 끝나고 답 뒤에는 정상 계약 예보를 전송한다.
async function routeConsult(
	page: Page,
	result: "valid-new-forecast" | "valid-gate-a-failed",
) {
	let calls = 0;
	await page.route("**/api/team/sessions", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ sessionId: "s-demo-0001" }),
		}),
	);
	await page.route("**/api/team/sessions/*/steps", (route) =>
		route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
	);
	await page.route("**/api/team/sessions/*/messages", async (route) => {
		calls++;
		const initial = fixture("valid-new-forecast").slice(0, 4);
		const asking = [
			...initial,
			{
				event: "ask",
				seq: 4,
				data: {
					field: "hostType",
					question: "주최 유형을 확인해 주세요.",
					options: ["지자체", "민간", "대학", "기타"].map((value) => ({
						label: value,
						value,
					})),
				},
			},
			{
				event: "done",
				seq: 5,
				data: { sessionId: "s-demo-0001", forecastId: null },
			},
		] as SseEvent[];
		await route.fulfill({
			status: 200,
			contentType: "text/event-stream",
			body: frames(calls % 2 === 1 ? asking : fixture(result)),
		});
	});
	return () => calls;
}

// 예시, 주최 버튼 두 번으로 수치 카드가 나오고 발행 전 문장은 보이지 않는다.
test("질문 뒤 숫자 카드와 테마별 화면", async ({ page }) => {
	const count = await routeConsult(page, "valid-new-forecast");
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
	await page.screenshot({
		path: resolve(output, "T-405-consult-start-day.png"),
		fullPage: true,
	});
	await page
		.getByRole("button", {
			name: "10월 18일 영종 씨사이드파크에서 불꽃축제를 해요",
		})
		.click();
	await expect(page.getByText("주최 유형을 확인해 주세요.")).toBeVisible();
	await page.screenshot({
		path: resolve(output, "T-405-consult-asking-day.png"),
		fullPage: true,
	});
	await page.getByRole("button", { name: "지자체", exact: true }).click();
	await expect(page.getByText("순간 최대", { exact: true })).toBeVisible();
	await expect(page.locator(".key-number strong").first()).toBeVisible();
	expect(count()).toBe(2);
	await page.screenshot({
		path: resolve(output, "T-405-consult-forecast-day.png"),
		fullPage: true,
	});
	await page.goto("/consult?theme=night&at=2026-10-18T19:00+09:00");
	await page
		.getByRole("button", {
			name: "10월 18일 영종 씨사이드파크에서 불꽃축제를 해요",
		})
		.click();
	await page.getByRole("button", { name: "지자체", exact: true }).click();
	await expect(page.locator(".key-number strong").first()).toBeVisible();
	await page.screenshot({
		path: resolve(output, "T-405-consult-forecast-night.png"),
		fullPage: true,
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({
		path: resolve(output, "T-405-consult-mobile.png"),
		fullPage: true,
	});
});

// 게이트 A 실패 응답에는 수치가 없고 오류와 위반 사유가 남는다.
test("게이트 A 실패는 숫자 카드를 열지 않는다", async ({ page }) => {
	await routeConsult(page, "valid-gate-a-failed");
	await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
	await page
		.getByRole("button", {
			name: "10월 18일 영종 씨사이드파크에서 불꽃축제를 해요",
		})
		.click();
	await page.getByRole("button", { name: "지자체", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText(
		"분석 결과 검사를 통과하지 못해",
	);
	await expect(page.getByText("순간 최대", { exact: true })).toHaveCount(0);
	await expect(page.getByText("위반 · 게이트 A")).toBeVisible();
});

// 잘못된 순서가 들어오면 숫자 대신 계약 오류 카드를 보여 준다.
for (const name of [
	"invalid-forecast-before-gate-a",
	"invalid-forecast-after-failed-gate",
	"invalid-ask-after-gate-a",
]) {
	test(`${name} 오류 카드`, async ({ page }) => {
		await page.route("**/api/team/sessions", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ sessionId: "s-demo-0001" }),
			}),
		);
		await page.route("**/api/team/sessions/*/messages", (route) =>
			route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				body: frames(fixture(name)),
			}),
		);
		await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
		await page
			.getByRole("button", {
				name: "10월 18일 영종 씨사이드파크에서 불꽃축제를 해요",
			})
			.click();
		await expect(page.getByRole("alert")).toContainText("SSE 순서 위반");
		await expect(page.locator(".key-number strong")).toHaveCount(0);
	});
}

// 스키마가 맞지 않는 SSE도 같은 오류 상태로 알려 준다.
test("계약 위반 SSE 오류 카드", async ({ page }) => {
	await page.route("**/api/team/sessions", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ sessionId: "s-demo-0001" }),
		}),
	);
	await page.route("**/api/team/sessions/*/messages", (route) =>
		route.fulfill({
			status: 200,
			contentType: "text/event-stream",
			body: 'event: forecast\ndata: {"event":"forecast","seq":0,"data":{"id":"f-bad"}}\n\n',
		}),
	);
	await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
	await page
		.getByRole("button", {
			name: "10월 18일 영종 씨사이드파크에서 불꽃축제를 해요",
		})
		.click();
	await expect(page.getByRole("alert")).toContainText("SSE 계약 위반");
});

// 선택지 대신 직접 입력한 주최 답도 같은 세션의 answer 필드로 보낸다.
test("직접 입력 답을 같은 세션에 보낸다", async ({ page }) => {
	const messages: { text: string; answer?: { hostType?: string } }[] = [];
	await page.route("**/api/team/sessions", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ sessionId: "s-demo-0001" }),
		}),
	);
	await page.route("**/api/team/sessions/*/messages", async (route) => {
		messages.push(route.request().postDataJSON());
		const initial = fixture("valid-new-forecast").slice(0, 4);
		const asking = [
			...initial,
			{
				event: "ask",
				seq: 4,
				data: {
					field: "hostType",
					question: "주최 유형을 확인해 주세요.",
					options: [],
				},
			},
			{
				event: "done",
				seq: 5,
				data: { sessionId: "s-demo-0001", forecastId: null },
			},
		] as SseEvent[];
		await route.fulfill({
			status: 200,
			contentType: "text/event-stream",
			body: frames(
				messages.length === 1 ? asking : fixture("valid-new-forecast"),
			),
		});
	});
	await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
	await page
		.getByRole("button", {
			name: "10월 18일 영종 씨사이드파크에서 불꽃축제를 해요",
		})
		.click();
	await expect(page.getByText("주최 유형을 확인해 주세요.")).toBeVisible();
	await page
		.getByRole("textbox", { name: "행사를 설명해 주세요" })
		.fill("민간");
	await page.getByRole("button", { name: "보내기" }).click();
	await expect(page.locator(".key-number strong").first()).toBeVisible();
	expect(messages[1]).toEqual({ text: "민간", answer: { hostType: "민간" } });
});
