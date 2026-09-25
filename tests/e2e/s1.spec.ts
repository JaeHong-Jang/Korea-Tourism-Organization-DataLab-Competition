// S1 선택·상담 입력·데이터 모드·고지를 실제 브라우저 화면에서 확인한다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const output = resolve(process.cwd(), "../../reports/figures/screens");
const time = encodeURIComponent("2025-10-18T13:00:00+09:00");
const card = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../../packages/contracts/fixtures/festival-summary/valid-card.json",
    ),
    "utf8",
  ),
);

// 실제 버튼 경계가 장면 밖으로 나가거나 패널 아래에 숨지 않았는지 확인한다.
async function visibleTagsAreSafe(
  page: Page,
  requireOne = true,
): Promise<boolean> {
  return page
    .locator("button.scene-name-tag")
    .evaluateAll((buttons, requireOne) => {
      const stage = document
        .querySelector(".scene-stage")
        ?.getBoundingClientRect();
      const panels = Array.from(
        document.querySelectorAll(
          ".scene-left-rail, .scene-page > .scene-list, .scene-page > .scene-timeline, .scene-cta",
        ),
        (panel) => panel.getBoundingClientRect(),
      );
      return Boolean(
        stage &&
          (!requireOne || buttons.length > 0) &&
          buttons.every((button) => {
            const rect = button.getBoundingClientRect();
            return (
              rect.left >= stage.left &&
              rect.top >= stage.top &&
              rect.right <= stage.right &&
              rect.bottom <= stage.bottom &&
              panels.every(
                (other) =>
                  rect.right <= other.left ||
                  rect.left >= other.right ||
                  rect.bottom <= other.top ||
                  rect.top >= other.bottom,
              )
            );
          }) &&
          // 보이는 이름표끼리도 서로 겹치지 않는다(선택한 이름표가 먼저 자리를 잡는다)
          buttons.every((button, index) => {
            const rect = button.getBoundingClientRect();
            return buttons.slice(index + 1).every((other) => {
              const next = other.getBoundingClientRect();
              return (
                rect.right <= next.left ||
                rect.left >= next.right ||
                rect.bottom <= next.top ||
                rect.top >= next.bottom
              );
            });
          }),
      );
    }, requireOne);
}

// 견본 모드에서 목록 선택과 장면 이름표 선택은 하나의 행사 ID를 공유한다.
test("견본 선택, 해제, 상담 입력, 데이터 모드", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?sceneFixture=1&theme=day&at=${time}`);
  await expect(page.locator("html")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 30_000 },
  );
  await expect(page.locator(".scene-honest-notices")).toContainText(
    "골든 사례 0건 — 사례 재현 검증 전 임시 사용",
  );
  await expect(page.locator(".scene-honest-notices")).toContainText(
    "작은 행사는 크게 예보될 수 있어요",
  );
  await expect(page.locator(".scene-honest-notices")).toContainText(
    "견본 데이터",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(output, "T-433-s1-day.png") });

  // 타임라인이 커져도 이름표가 새 패널 경계 안에 남지 않게 한다.
  await page.getByText("주간 타임라인 펼치기").click();
  await expect.poll(() => visibleTagsAreSafe(page, false)).toBe(true);
  await page.getByText("주간 타임라인 펼치기").click();

  // 목록 선택은 장면 포커스와 요약 구간을 함께 갱신한다.
  await page
    .locator(".festival-list__pick")
    .filter({ hasText: "견본 행사 20" })
    .click();
  await expect(
    page.locator(".scene-stage section[data-focus-id]"),
  ).toHaveAttribute("data-focus-id", "e-scene-20");
  await expect(
    page.getByRole("region", { name: "선택 행사 요약" }),
  ).toContainText("견본 행사 20");
  await expect(
    page.getByRole("region", { name: "선택 행사 요약" }),
  ).toContainText("표본 한계로 구간 기준 표시");
  await expect.poll(() => visibleTagsAreSafe(page)).toBe(true);
  await page.screenshot({ path: resolve(output, "T-433-s1-selected.png") });

  // 전체 판으로 돌아온 뒤 패널에 가리지 않는 이름표를 골라 목록과 동기화한다.
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".scene-stage section[data-focus-id]"),
  ).toHaveAttribute("data-focus-id", "");
  await expect.poll(() => visibleTagsAreSafe(page)).toBe(true);
  const tag = page.locator("button.scene-name-tag").first();
  await expect(tag).toBeVisible();
  const tagName = await tag.getAttribute("aria-label");
  await tag.click();
  const chosenName = tagName?.replace(/ 선택$/, "") ?? "";
  await expect(
    page.locator(".festival-list__pick").filter({ hasText: chosenName }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".festival-list__items li.is-selected"),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".scene-stage section[data-focus-id]"),
  ).toHaveAttribute("data-focus-id", "");
  await expect(page.locator(".festival-summary__empty")).toBeVisible();

  // 상담 링크는 문장을 채우고 서버 전송은 시작하지 않는다.
  await page
    .locator(".festival-list__pick")
    .filter({ hasText: "견본 행사 20" })
    .click();
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") posts++;
  });
  await page.getByRole("link", { name: "예보 상담에서 자세히 보기" }).click();
  await expect(page.locator("#consult-text")).toHaveValue(/견본 행사 20/);
  expect(posts).toBe(0);
  await page.goBack();
  await page.getByRole("button", { name: "데이터 모드 꺼짐" }).click();
  await expect(
    page.getByRole("button", { name: "데이터 모드 켜짐" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".scene-legend")).toContainText(
    "타일 색·높이 = 기간 안 예보 순간 최대(p50) 합",
  );
  await expect(page).toHaveURL(/data=1/);
  await page.screenshot({ path: resolve(output, "T-433-s1-data.png") });
});

// 노트북 크기의 판과 밤 노출을 서로 다른 캡처로 검토한다.
test("밤과 노트북 장면 캡처", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    `/?sceneFixture=1&theme=night&at=${encodeURIComponent("2025-10-18T21:00:00+09:00")}`,
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 30_000 },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(output, "T-433-s1-night.png") });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: resolve(output, "T-433-s1-laptop.png") });
  const panelsOverlap = await page.evaluate(() => {
    const filter = document
      .querySelector(".scene-filter")
      ?.getBoundingClientRect();
    const legend = document
      .querySelector(".scene-legend")
      ?.getBoundingClientRect();
    return Boolean(filter && legend && filter.bottom > legend.top);
  });
  expect(panelsOverlap).toBe(false);
  await expect(
    page.getByRole("button", { name: "데이터 모드 꺼짐" }),
  ).toBeVisible();
});

// 실제 경로는 모의 API를 읽고 SVG 대체도 요약·상담 흐름을 공유한다.
test("실제 API와 SVG 선택 고지", async ({ page }) => {
  await page.route("**/api/festivals", async (route) =>
    route.fulfill({ json: [{ ...card, modelVerdict: undefined }] }),
  );
  await page.goto(`/?forceSvg=1&data=1&at=${time}`);
  await expect(page.locator(".festival-list__pick")).toHaveCount(1);
  await expect(page.locator(".scene-svg-notices")).not.toContainText(
    "골든 사례 0건",
  );
  await expect(page.locator(".scene-svg-notices")).toContainText(
    "작은 행사는 크게 예보될 수 있어요",
  );
  await expect(page.locator(".scene-svg-notices")).not.toContainText(
    "견본 데이터",
  );
  await expect(
    page.getByRole("button", { name: "데이터 모드 꺼짐" }),
  ).toBeDisabled();
  await expect(page.locator(".scene-svg-notices")).toContainText(
    "SVG 지도에서는 데이터 모드를 사용할 수 없어요",
  );
  await page.locator(".svg-korea-map__event").click();
  await expect(
    page.getByRole("region", { name: "선택 행사 요약" }),
  ).toContainText(card.name);
  await expect(page.locator(".festival-list__pick")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator(".svg-korea-map svg").click({ position: { x: 5, y: 5 } });
  await expect(page.locator(".festival-summary__empty")).toBeVisible();
  await page.locator(".svg-korea-map__event").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".festival-summary__empty")).toBeVisible();
});
