import { chromium } from "@playwright/test";
const [out, path] = process.argv.slice(2);
const browser = await chromium.launch();
for (const theme of ["night", "day"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 200)));
  const t = Date.now();
  await page.goto(`http://127.0.0.1:5190${path}?theme=${theme}`, { waitUntil: "load" });
  await page.waitForSelector(".knowledge-graph__canvas canvas", { timeout: 60000 });
  console.log(theme, "canvas after", Date.now() - t, "ms");
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 230)); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/graph-${theme}.png`, fullPage: false });
  if (theme === "night") {
    await page.getByLabel("노드 검색").fill("자체 규칙");
    await page.locator(".knowledge-graph__results button").first().click();
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 230)); await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/graph-night-selected.png` });
  }
  await page.close();
}
await browser.close();
