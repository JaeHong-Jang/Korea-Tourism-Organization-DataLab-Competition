// 작업 화면 캡처: node shot.mjs <출력 폴더> <이름> <경로> [대기 ms] [너비] [높이]
import { chromium } from "@playwright/test";
const [out, name, path, wait = "8000", width = "1440", height = "900"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
page.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:5190${path}`, { waitUntil: "load" });
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: `${out}/${name}.png` });
await browser.close();
