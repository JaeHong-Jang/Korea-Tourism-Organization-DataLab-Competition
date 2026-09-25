// 계약 SSE를 POST 응답으로 흘려 되묻기와 숫자 발행 전 단계를 검사한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SseEvent } from "@crowdcast/contracts/types";
import { expect, type Page, test } from "@playwright/test";

const example =
	"10월 18일 19시부터 21시까지 영종 씨사이드파크에서 인천 중구가 여는 불꽃축제를 해요";
const output = resolve(process.cwd(), "../../reports/figures/screens");
const recordedAsking = readFileSync(
	resolve(process.cwd(), "../../tests/e2e/fixtures/consult-yeongjong-live-1.sse"),
	"utf8",
);
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
const frames = (events: SseEvent[]) =>
	events
		.map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
		.join("");

// 대화 서랍의 공용 입력칸에서 행사 설명을 보낸다.
async function sendExample(page: Page) {
	await page.getByLabel("행사를 설명해 주세요").fill(example);
	await page.getByRole("button", { name: "보내기" }).click();
}

// 별도 폼 회귀 검사는 주최·시각·위험 질문을 한 응답에 모은다.
function asking(): SseEvent[] {
	const asks = [
		{
			field: "hostType",
			question: "주최 유형을 확인해 주세요.",
			options: ["지자체", "민간", "대학", "기타"].map((value) => ({
				label: value,
				value,
			})),
		},
		{
			field: "time",
			question: "행사의 시작·종료 날짜와 시각을 함께 입력해 주세요.",
			options: [],
		},
		{
			field: "hazards",
			question:
				"위험요소를 확인해 주세요. 여러 항목을 선택할 수 있고, 없으면 ‘해당 없어요’를 골라 주세요.",
			options: [
				{ label: "폭죽 써요", value: "폭죽" },
				{ label: "해당 없어요", value: "[]" },
			],
		},
	];
	const prefix = fixture("valid-new-forecast").slice(0, 4);
	const draft = structuredClone(prefix[3].data) as Record<string, unknown>;
	draft.hazards = [];
	draft.hostType = null;
	draft.startsAt = null;
	draft.endsAt = null;
	draft.missing = ["startsAt", "endsAt"];
	prefix[3] = { ...prefix[3], data: draft };
	return [
		...prefix,
		...asks.map((data, index) => ({
			event: "ask",
			seq: prefix.length + index,
			data,
		})),
		{
			event: "done",
			seq: prefix.length + asks.length,
			data: { sessionId: "s-demo-0001", forecastId: null },
		},
	] as SseEvent[];
}

// 첫 응답은 질문으로 끝나고 답을 보내면 계약 픽스처의 결과를 재생한다.
async function routeConsult(
	page: Page,
	result: "valid-new-forecast" | "valid-gate-a-failed",
	three = false,
) {
	const messages: { text: string; answer?: Record<string, unknown> }[] = [];
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
	await page.route("**/api/team/sessions/*/messages", (route) => {
		messages.push(route.request().postDataJSON());
		return route.fulfill({
			status: 200,
			contentType: "text/event-stream",
			body: messages.length % 2
				? three
					? frames(asking())
					: recordedAsking
				: frames(fixture(result)),
		});
	});
	return messages;
}

// 예시·위험 선택·답하기의 세 번 클릭으로 숫자 카드까지 간다.
test("질문 뒤 숫자 카드와 테마별 화면", async ({ page }) => {
	const messages = await routeConsult(page, "valid-new-forecast");
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
	await page.screenshot({
		path: resolve(output, "T-405-consult-start-day.png"),
		fullPage: true,
	});
	await sendExample(page);
	await expect(
		page.getByText("위험요소를 확인해 주세요.", { exact: false }),
	).toBeVisible();
	await page.screenshot({
		path: resolve(output, "T-405-consult-asking-day.png"),
		fullPage: true,
	});
	await page.getByRole("checkbox", { name: "폭죽 써요" }).click();
	await page.getByRole("button", { name: "보내기" }).click();
	await expect(page.locator(".key-number strong").first()).toBeVisible();
	expect(messages[1].answer).toEqual({ hazards: ["폭죽"] });
	await expect(page.getByText("게이트 publish")).toHaveCount(0);
	await expect(page.getByText("2025-10-18T19:00:00+09:00")).toHaveCount(0);
	await page.screenshot({
		path: resolve(output, "T-405-consult-forecast-day.png"),
		fullPage: true,
	});
	await page.locator(".consult-field").first().click();
	await expect(
		page.getByText("고치려면 새 상담을 시작해 주세요."),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "새 상담" })).toBeVisible();
	await page.goto("/consult?theme=night&at=2026-10-18T19:00+09:00");
	await sendExample(page);
	await page.getByRole("checkbox", { name: "폭죽 써요" }).click();
	await page.getByRole("button", { name: "보내기" }).click();
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

// 기록 조회가 실패하면 오류를 유지하고 명시적 재시도로 다시 조회한다.
test("펫 기록 조회 실패 뒤 다시 불러온다", async ({ page }) => {
	await routeConsult(page, "valid-new-forecast");
	let reads = 0;
	await page.route("**/api/team/sessions/*/steps", (route) => {
		reads++;
		return route.fulfill({
			status: reads === 1 ? 503 : 200,
			contentType: "application/json",
			body: reads === 1 ? "{}" : "[]",
		});
	});
	await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
	await sendExample(page);
	await page.getByRole("button", { name: "받아쓰기 작업 기록 열기" }).click();
	await expect(
		page.getByRole("button", { name: "다시 불러오기" }),
	).toBeVisible();
	await page.getByRole("button", { name: "다시 불러오기" }).click();
	await expect(page.getByText("아직 기록이 없어요.")).toBeVisible();
	expect(reads).toBe(2);
});

// 서버가 부분 답을 거절해도 선택과 질문을 보존해 같은 폼에서 다시 답한다.
test("400 응답 뒤 되묻기 폼을 유지한다", async ({ page }) => {
	const messages = await routeConsult(page, "valid-new-forecast");
	let rejected = false;
	await page.route("**/api/team/sessions/*/messages", (route) => {
		if (messages.length === 1 && !rejected) {
			rejected = true;
			return route.fulfill({ status: 400, body: "{}" });
		}
		return route.fallback();
	});
	await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
	await sendExample(page);
	await page.getByRole("checkbox", { name: "폭죽 써요" }).click();
	await page.getByRole("button", { name: "보내기" }).click();
	await expect(page.getByRole("alert")).toContainText("고쳐서 다시 보내 주세요");
	await expect(page.getByRole("checkbox", { name: "폭죽 써요" })).toBeChecked();
	await page.getByRole("button", { name: "보내기" }).click();
	await expect(page.locator(".key-number strong").first()).toBeVisible();
});

// 게이트웨이 수동 기록의 주최·시각·위험 질문도 한 메시지로 답한다.
test("세 종류의 질문을 한 번에 답한다", async ({ page }) => {
	const messages = await routeConsult(page, "valid-new-forecast", true);
	await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
	await sendExample(page);
	await page.getByRole("button", { name: "지자체", exact: true }).click();
	await page.getByLabel("행사 날짜").fill("2026-10-18");
	await page.getByRole("checkbox", { name: "폭죽 써요" }).click();
	await page.getByRole("button", { name: "보내기" }).click();
	await expect(page.locator(".key-number strong").first()).toBeVisible();
	expect(messages).toHaveLength(2);
	expect(messages[1].answer).toEqual({
		hostType: "지자체",
		startsAt: "2026-10-18T19:00:00+09:00",
		endsAt: "2026-10-18T21:00:00+09:00",
		hazards: ["폭죽"],
	});
});

// 검사 실패에서는 오류와 게이트 위반만 보이고 수치가 없다.
test("게이트 A 실패는 숫자 카드를 열지 않는다", async ({ page }) => {
	await routeConsult(page, "valid-gate-a-failed");
	await page.goto("/consult?theme=day&at=2026-10-18T12:00+09:00");
	await sendExample(page);
	await page.getByRole("checkbox", { name: "폭죽 써요" }).click();
	await page.getByRole("button", { name: "보내기" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"분석 결과 검사를 통과하지 못해",
	);
	await expect(page.getByText("순간 최대", { exact: true })).toHaveCount(0);
	await expect(page.getByText("위반 · 분석 검증")).toBeVisible();
});

// 순서 위반 픽스처는 숫자 이벤트가 있어도 오류 카드가 우선한다.
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
		await sendExample(page);
		await expect(page.getByRole("alert")).toContainText("순서 검사");
		await expect(page.locator(".key-number strong")).toHaveCount(0);
	});
}

// 스키마가 맞지 않는 이벤트도 계약 오류로 알린다.
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
	await sendExample(page);
	await expect(page.getByRole("alert")).toContainText("형식 검사");
});
