import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

assert.ok(process.env.LH_PREVIEW_CHAT_ID, 'Set LH_PREVIEW_CHAT_ID to a disposable test course');
const origin = process.env.LH_PREVIEW_URL ?? "http://127.0.0.1:32179";
const output = "/tmp/learnharness-personal-review";
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(origin + "/chat/" + process.env.LH_PREVIEW_CHAT_ID, { waitUntil: "networkidle2" });
  await page.waitForSelector('[data-testid="composer"], [data-testid="question-dock"]');
  assert.equal(await page.evaluate(() => document.documentElement.lang), "zh-CN");
  const reveal = await page.$('[data-testid="teach-check-reveal"]');
  if (reveal) await reveal.click();
  await page.screenshot({ path: output + "/desktop-light.png" });
  const metrics = await page.evaluate(() => {
    const prose = document.querySelector(".lh-prose");
    return {
      background: getComputedStyle(document.body).backgroundColor,
      font: prose && getComputedStyle(prose).fontFamily,
      lineHeight: prose && getComputedStyle(prose).lineHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      text: document.body.innerText.slice(-1600),
    };
  });
  assert.equal(metrics.overflow, false);
  const themeResponse = await page.evaluate(async () => {
    const response = await fetch("/api/settings/appearance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "dark" }),
    });
    return response.status;
  });
  assert.equal(themeResponse, 200);
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.screenshot({ path: output + "/desktop-dark.png" });
  await page.evaluate(async () => {
    await fetch("/api/settings/appearance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "light" }),
    });
    localStorage.setItem("lh:sidebar-open", "0");
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: output + "/mobile-light.png" });
  console.log(JSON.stringify({ metrics, errors, output }, null, 2));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
