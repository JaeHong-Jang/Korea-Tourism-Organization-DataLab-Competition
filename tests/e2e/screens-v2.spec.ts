// 서식4와 발표 검토용 화면을 상태별 독립 테스트로 고정 캡처한다.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  type CaptureVariant,
  consultExample,
  routeScreensV2,
} from "./fixtures/screens-v2-routes";
import { sendConsultDescription } from "./fixtures/start-consult";

const output = resolve(process.cwd(), "../../reports/figures/screens/v2");
const sizes = [
  { width: 1440, height: 900, label: "1440x900" },
  { width: 1280, height: 800, label: "1280x800" },
  { width: 390, height: 844, label: "390x844" },
] as const;
const themes = ["day", "night"] as const;

type Scene = {
  screen: string;
  state: string;
  path: string;
  variant?: CaptureVariant;
};

// 메뉴와 발표 흐름에 필요한 상태를 한 건당 하나의 재실행 단위로 둔다.
const scenes: Scene[] = [
  { screen: "g", state: "header", path: "/validation" },
  { screen: "s1", state: "3d", path: "/?sceneFixture=1&view=miniature&sceneQuality=high" },
  { screen: "s1", state: "svg", path: "/?sceneFixture=1&forceSvg=1" },
  {
    screen: "s1",
    state: "selected",
    path: "/?sceneFixture=1&view=miniature&sceneQuality=high",
  },
  {
    screen: "s1",
    state: "data",
    path: "/?sceneFixture=1&view=miniature&sceneQuality=high&data=1",
  },
  { screen: "s2", state: "start", path: "/consult" },
  { screen: "s2", state: "stream-end", path: "/consult" },
  { screen: "s2", state: "whatif", path: "/consult", variant: "whatif" },
  { screen: "s3", state: "report", path: "/f/f-yeongjong-2025" },
  { screen: "s3", state: "drawer", path: "/f/f-yeongjong-2025" },
  { screen: "s3", state: "map", path: "/f/f-yeongjong-2025" },
  {
    screen: "s3",
    state: "venue",
    path: "/f/f-yeongjong-2025?sceneQuality=low",
  },
  { screen: "s4", state: "editor", path: "/f/f-yeongjong-2025/plan" },
  { screen: "s5", state: "list", path: "/my" },
  { screen: "s5", state: "reforecast", path: "/my", variant: "reforecast" },
  { screen: "s5", state: "shared", path: "/s/sh-yeongjong2025abcd" },
  { screen: "s6", state: "validation", path: "/validation" },
  { screen: "s7", state: "insights", path: "/insights" },
  { screen: "s8", state: "ops", path: "/ops" },
  { screen: "s5", state: "empty", path: "/my", variant: "empty" },
  { screen: "s8", state: "error", path: "/ops", variant: "error" },
];

// 같은 한국 시각을 주소에 넣고 장면 진단 플래그를 보존한다.
function captureUrl(scene: Scene, theme: "day" | "night"): string {
  const at =
    theme === "day" ? "2026-10-18T12:00:00+09:00" : "2026-10-18T21:00:00+09:00";
  const [pathname, query = ""] = scene.path.split("?");
  const search = new URLSearchParams(query);
  search.set("theme", theme);
  search.set("at", at);
  if (scene.state === "venue")
    search.set("venueHour", theme === "day" ? "12" : "21");
  return `${pathname}?${search.toString()}`;
}

// 모바일 목록은 접힌 패널을 열어 선택 카드가 화면에 드러나게 한다.
async function selectFestival(page: Page, mobile: boolean) {
  if (mobile)
    await page
      .getByRole("navigation", { name: "미니 대한민국 정보" })
      .getByRole("button", { name: "행사 목록" })
      .click();
  await page.locator(".festival-list__pick").first().click();
  await expect(
    page.getByRole("region", { name: "선택 행사 요약" }),
  ).toBeVisible();
}

// 준비 신호와 상태 고유의 텍스트를 기다려 로딩 화면이 섞이지 않게 한다.
async function prepareScene(page: Page, scene: Scene, mobile: boolean) {
  const key = `${scene.screen}-${scene.state}`;
  if (scene.screen === "s1") {
    if (["3d", "selected", "data"].includes(scene.state))
      await expect(page.locator("html")).toHaveAttribute(
        "data-scene-ready",
        "true",
        { timeout: 45_000 },
      );
    if (scene.state === "svg")
      await expect(page.locator(".svg-korea-map")).toBeVisible();
    if (scene.state === "selected") await selectFestival(page, mobile);
    if (scene.state === "data") {
      if (mobile)
        await page
          .getByRole("navigation", { name: "미니 대한민국 정보" })
          .getByRole("button", { name: "범례" })
          .click();
      await expect(
        page.getByRole("button", { name: "데이터 모드" }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    return;
  }
  if (scene.screen === "s2") {
    await expect(
      page.getByRole("complementary", { name: "고래 봇 대화" }),
    ).toBeVisible();
    if (scene.state !== "start") {
      await sendConsultDescription(page, consultExample);
      await expect(page.locator(".key-number strong").first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: "일요일이면?" }),
      ).toBeVisible();
      if (scene.state === "whatif") {
        await page.getByRole("button", { name: "일요일이면?" }).click();
        await expect(
          page.getByRole("region", { name: "원래 예보와 바뀐 예보 비교" }),
        ).toBeVisible();
      }
    }
    return;
  }
  if (scene.screen === "s3") {
    await expect(page.getByRole("tab", { name: "예보서" })).toBeVisible();
    if (scene.state === "drawer") {
      await page
        .locator('a[href="#evidence-ev-rule-legal-hazard"]')
        .first()
        .click();
      await expect(
        page.getByRole("dialog", { name: "근거 서랍" }),
      ).toBeVisible();
    }
    if (scene.state === "map") {
      await page.getByRole("tab", { name: "근거 정리" }).click();
      await expect(
        page.getByRole("region", { name: "근거 정리" }),
      ).toBeVisible();
    }
    if (scene.state === "venue") {
      await page.getByRole("tab", { name: "행사장 3D" }).click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-venue-ready",
        "true",
        { timeout: 45_000 },
      );
    }
    return;
  }
  if (key === "s4-editor")
    await expect(
      page.getByRole("navigation", { name: "계획 초안 목차" }),
    ).toBeVisible();
  if (key === "s5-list" || key === "s5-reforecast") {
    await expect(
      page.getByRole("table").getByText("영종 씨사이드파크 불꽃축제"),
    ).toBeVisible();
    if (scene.state === "reforecast") {
      await page.getByRole("button", { name: "재예보", exact: true }).click();
      await expect(page.locator(".my-events-reforecast-card")).toContainText(
        "18,500",
      );
    }
  }
  if (key === "s5-shared")
    await expect(
      page.getByRole("heading", { name: "공유된 예보서" }),
    ).toBeVisible();
  if (key === "s5-empty")
    await expect(
      page.getByText("상담에서 예보를 저장하면 여기에 모여요"),
    ).toBeVisible();
  if (scene.screen === "s6" || scene.screen === "g") {
    await expect(page.locator('[data-feature="M6-F1"]')).toContainText("49.3%");
    await expect(page.locator('[data-feature="M6-F5"]')).toContainText(
      "근거 연결률",
    );
    await expect(page.locator('[data-feature="M6-F4"]')).toContainText(
      "9/29 사전 등록 뒤",
    );
  }
  if (scene.screen === "s7") {
    await expect(page.locator('[data-insight="I2"]')).toContainText(
      "14,500명/일",
    );
    await expect(page.locator('[data-insight="I1"]')).toContainText(
      "인사이트는 데이터 수집이 끝나면",
    );
    await expect(page.locator('[data-feature="M7-F2"] table')).toBeVisible();
  }
  if (key === "s8-ops") {
    await expect(page.locator(".ops-run").first()).toBeVisible();
    await expect(page.locator('[data-feature="M8-F2"]')).toContainText(
      "근거 없는 발행",
    );
    await expect(page.locator('[data-feature="M8-F3"]')).toContainText(
      "마지막 수집",
    );
  }
  if (key === "s8-error")
    await expect(page.locator('[data-feature="M8-F1"]')).toContainText(
      "실행 기록을 확인할 수 없어요",
    );
}

// 스크린샷 전에 폰트와 두 번의 그리기 프레임을 끝낸다.
async function settlePage(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.decode().catch(() => undefined),
      ),
    );
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}

// 화면마다 별도 테스트를 만들어 실패한 상태만 골라 재실행할 수 있다.
for (const scene of scenes) {
  for (const size of sizes) {
    for (const theme of themes) {
      test(`${scene.screen}-${scene.state} ${size.label} ${theme} @screens-v2 @${scene.screen} @${size.label} @${theme}`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await routeScreensV2(page, scene.variant);
        await page.goto(captureUrl(scene, theme));
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await prepareScene(page, scene, size.width === 390);
        await settlePage(page);
        mkdirSync(output, { recursive: true });
        const image = resolve(
          output,
          `${scene.screen}-${scene.state}-${size.label}-${theme}.png`,
        );
        const screenshot = {
          path: image,
          animations: "disabled" as const,
          caret: "hide" as const,
        };
        if (scene.screen === "g")
          await page.locator(".site-header").screenshot(screenshot);
        else await page.screenshot({ ...screenshot, fullPage: true });
      });
    }
  }
}
