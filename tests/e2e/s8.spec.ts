// 계약 픽스처로 운영 실행·평가·최신성 및 카드별 오류를 확인한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const screens = resolve(process.cwd(), "../../reports/figures/screens");
const run = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../../packages/contracts/fixtures/pipeline-run/valid-running.json",
    ),
    "utf8",
  ),
);
const status = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../../packages/contracts/fixtures/ops-status/valid-example.json",
    ),
    "utf8",
  ),
);
const failed = {
  ...run,
  runId: "run-20260928-0300",
  startedAt: "2026-09-28T03:00:00+09:00",
  finishedAt: "2026-09-28T03:02:00+09:00",
  status: "failed",
  summary: "수집 게이트 실패",
  stages: [
    {
      ...run.stages[0],
      status: "failed",
      gate: { passed: false, message: "결측률 초과" },
    },
  ],
};

// 실행·상태 엔드포인트는 서로 독립적으로 실패하게 구성한다.
async function fakeOps(
  page: Page,
  runs: unknown,
  ops = status,
  runsCode = 200,
) {
  await page.route("**/api/ops/runs", (route) =>
    route.fulfill({
      status: runsCode,
      contentType: "application/json",
      body: JSON.stringify(runs),
    }),
  );
  await page.route("**/api/ops/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ops),
    }),
  );
}

// 최신 실행을 펼쳐 실패 게이트와 해시 복사, 평가·최신성 값을 확인한다.
test("S8 실행 상세와 운영 상태", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await fakeOps(page, [run, failed]);
  await page.goto("/ops?theme=day");
  const rows = page.locator(".ops-run");
  await expect(rows).toHaveCount(2);
  // 요약 칸은 어느 단계에서 왜 멈췄는지를 한 줄로 보여 준다.
  await expect(rows.first()).toContainText("수집에서 멈췄어요 — 결측률 초과");
  await rows.first().getByText("단계 펼치기").click();
  await expect(rows.first().locator(".ops-stage--failed")).toContainText(
    "결측률 초과",
  );
  await rows
    .first()
    .getByRole("button", { name: /해시 복사/ })
    .click();
  await expect(
    rows.first().locator(".ops-artifacts [role=status]"),
  ).toContainText("복사했어요");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    run.stages[0].artifacts[0].sha256,
  );
  await expect(page.locator('[data-feature="M8-F2"]')).toContainText(
    "근거 없는 발행",
  );
  await expect(page.locator('[data-feature="M8-F3"]')).toContainText(
    "마지막 수집",
  );
  await page.screenshot({
    path: resolve(screens, "T-410-ops.png"),
    fullPage: true,
  });
});

// 실행 상류만 실패하면 평가와 최신성은 정상 데이터를 그대로 보여 준다.
test("S8 상류 오류는 실행 카드에만 나타난다", async ({ page }) => {
  await fakeOps(page, {}, status, 503);
  await page.goto("/ops");
  await expect(page.locator('[data-feature="M8-F1"]')).toContainText(
    "실행 기록을 확인할 수 없어요",
  );
  await expect(page.locator('[data-feature="M8-F2"]')).toContainText("24건");
  await expect(page.locator('[data-feature="M8-F3"]')).toContainText("v0.1.0");
});

// 실행 목록이 비면 펫과 실행 명령을 남기고 계약 오류는 수치를 막는다.
test("S8 빈 실행과 계약 오류", async ({ page }) => {
  await fakeOps(page, []);
  await page.goto("/ops");
  await expect(page.locator('[data-feature="M8-F1"]')).toContainText(
    "새로고침",
  );
  await fakeOps(page, [{ ...run, status: "unknown" }]);
  await page.reload();
  await expect(page.locator('[data-feature="M8-F1"]')).toContainText(
    "실행 기록을 확인할 수 없어요",
  );
  await expect(page.locator('[data-feature="M8-F2"]')).toContainText(
    "근거 없는 발행",
  );
});

// 평가 필드만 깨진 상태 응답은 최신성의 유효한 값까지 숨기지 않는다.
test("S8 평가 계약 오류는 최신성 카드에 영향을 주지 않는다", async ({
  page,
}) => {
  await fakeOps(page, [run], {
    ...status,
    evals: { ...status.evals, cases: "24" },
  });
  await page.goto("/ops");
  await expect(page.locator('[data-feature="M8-F2"]')).toContainText(
    "평가 결과를 확인할 수 없어요",
  );
  await expect(page.locator('[data-feature="M8-F3"]')).toContainText("v0.1.0");
});

// 가짜 평가 API는 여덟 검사와 초 단위 지연·사용 모델 미검증을 함께 보여 준다.
test("S8 평가 상세와 가짜 실행·모델 검증 상태", async ({ page }) => {
  await fakeOps(page, [run], {
    ...status,
    model: { ...status.model, verdict: "미검증" },
    evals: {
      ...status.evals,
      mode: "fake",
      checks: Object.fromEntries(
        ["sequence", "evidence", "numbers", "interval", "ask", "intent", "publication", "execution"]
          .map((key) => [key, { passed: 19, total: 20 }]),
      ),
      latencySeconds: {
        forecast: { n: 9, p50: 5.32, p95: 7.61 },
        publishedDone: { n: 10, p50: 11.45, p95: 14.64 },
      },
    },
  });
  await page.goto("/ops");
  const evaluation = page.locator('[data-feature="M8-F2"]');
  await expect(evaluation.getByText("가짜 서비스 실행")).toBeVisible();
  await expect(evaluation).toContainText("서식4에 사용하지 마세요");
  await expect(evaluation.locator(".ops-checks tbody tr")).toHaveCount(8);
  await expect(evaluation.getByRole("row", { name: /숫자 일치/ })).toContainText("19 / 20");
  await expect(evaluation).toContainText("p50 5.3초 · p95 7.6초");
  await expect(evaluation).toContainText("p50 11.4초 · p95 14.6초");
  const freshness = page.locator('[data-feature="M8-F3"]');
  await expect(freshness.getByText("미검증", { exact: true })).toBeVisible();
  await expect(freshness).toContainText("골든 사례 0건 — 사례 재현 검증 전 임시 사용");
});
