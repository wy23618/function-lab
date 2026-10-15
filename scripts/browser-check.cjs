const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForSelector("canvas");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "docs/desktop.png", fullPage: true });
  assert.equal(await page.locator(".function-item").count(), 2);
  await page.getByLabel("输入表达式", { exact: true }).fill("1/(x-2)");
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".function-item").count(), 2);
  await page.getByLabel("输入表达式", { exact: true }).press("Enter");
  assert.equal(await page.locator(".function-item").count(), 3);
  await page
    .getByRole("button", { name: "关于 Y 轴对称", exact: true })
    .click();
  assert.equal(await page.locator(".function-item").count(), 4);
  await page.getByRole("button", { name: "↶ 撤销", exact: true }).click();
  assert.equal(await page.locator(".function-item").count(), 3);
  await page.getByRole("button", { name: "↷ 重做", exact: true }).click();
  assert.equal(await page.locator(".function-item").count(), 4);
  await page.locator(".function-item").first().click();
  await page.getByRole("button", { name: "反函数", exact: true }).click();
  assert.equal(await page.locator(".function-item").count(), 4);
  assert.match(await page.getByRole("status").innerText(), /定义域/);
  await page.getByRole("button", { name: "分析", exact: true }).click();
  await page.locator("#domain").fill("x≥0");
  await page.getByRole("button", { name: "应用定义域", exact: true }).click();
  await page.getByRole("button", { name: "反函数", exact: true }).click();
  assert.equal(await page.locator(".function-item").count(), 5);
  assert.match(
    await page.locator(".function-item").last().innerText(),
    /反函数/,
  );
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog").locator("input").fill("切线");
  await page.getByRole("dialog").getByRole("button", { name: "切线" }).click();
  assert.equal(await page.locator(".function-item").count(), 6);
  await page.locator("canvas").click({ position: { x: 300, y: 200 } });
  assert.ok((await page.locator(".point-strip button").count()) > 0);
  const before = await page.locator("canvas").boundingBox();
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2,
  );
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(100);
  await page.reload();
  assert.equal(await page.locator(".function-item").count(), 6);
  await page.locator("#function-input").fill("e^(Πx)");
  await page.locator("#function-input").press("Enter");
  assert.equal(await page.locator(".function-item").count(), 7);
  assert.equal(
    await page
      .locator(".function-item")
      .last()
      .locator(".expression-edit")
      .inputValue(),
    "e^(pi*x)",
  );
  assert.equal(await page.locator(".explanation.error").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: "docs/mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "docs/browser-results.json",
    JSON.stringify({ passed: true, checks: 13, errors }, null, 2),
  );
  await browser.close();
  console.log("Browser workflow checks passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
