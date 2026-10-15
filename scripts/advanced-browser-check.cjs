const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");

(async () => {
  await fs.mkdir(".runtime/test-results", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const failures = [],
    passed = [],
    pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:5173/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("canvas");
  const items = () => page.locator(".function-item");
  const button = (name) => page.getByRole("button", { name, exact: true });
  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("function-lab-v1")));
  async function check(name, task) {
    try {
      await task();
      passed.push(name);
    } catch (error) {
      failures.push({ name, error: error.message });
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }
  await check("translation preview and keep", async () => {
    const before = await items().count();
    await page.getByLabel("横向 a 滑块", { exact: true }).fill("2");
    assert.equal(await items().count(), before);
    assert.match(await page.getByRole("status").innerText(), /变换预览/);
    assert.ok(await button("保留新函数").isVisible());
    await button("保留新函数").click();
    assert.equal(await items().count(), before + 1);
    const functions = await stored();
    assert.match(functions.at(-1).currentExpression, /2/);
    assert.equal(functions.at(-1).transformHistory.at(-1).label, "平移");
  });
  await check("stretching and absolute value", async () => {
    await items().first().click();
    const before = await items().count();
    await page.getByLabel("纵向 A", { exact: true }).fill("2");
    await page.getByLabel("横向 B", { exact: true }).fill("0.5");
    assert.equal(await items().count(), before);
    await button("生成伸缩函数").click();
    assert.equal(await items().count(), before + 1);
    await button("|f(x)|").click();
    assert.equal(await items().count(), before + 2);
    const functions = await stored();
    assert.match(functions.at(-1).currentExpression, /abs/);
  });
  await check("geometric reflection and history", async () => {
    await items().first().click();
    await button("几何").click();
    await button("y = x").click();
    await button("生成镜像关系").click();
    assert.equal((await stored()).at(-1).kind, "relation");
    assert.match(
      await page.locator(".right-panel .section-heading").innerText(),
      /当前：关系/,
    );
    await button("历史").click();
    assert.ok((await page.locator(".history-item").count()) > 0);
    assert.match(
      await page.locator(".history-item").last().innerText(),
      /对称|反射/,
    );
  });
  await check("parentheses keyboard input", async () => {
    const keyboard = page.locator(".keyboard");
    const left = keyboard.getByRole("button", { name: "(", exact: true });
    const right = keyboard.getByRole("button", { name: ")", exact: true });
    assert.ok(await left.isVisible());
    assert.ok(await right.isVisible());
    await page.locator("#function-input").fill("");
    await left.click();
    await keyboard.getByRole("button", { name: "x", exact: true }).click();
    await right.click();
    assert.equal(await page.locator("#function-input").inputValue(), "(x)");
    await page.locator("#function-input").fill("");
  });
  await check("locked edit and delete", async () => {
    const item = items().first();
    await item.getByRole("button", { name: "锁定", exact: true }).click();
    assert.ok(await item.locator(".expression-edit").isDisabled());
    assert.ok(
      await item
        .getByRole("button", { name: "删除", exact: true })
        .isDisabled(),
    );
    await item.getByRole("button", { name: "解锁", exact: true }).click();
    assert.ok(await item.locator(".expression-edit").isEnabled());
    assert.ok(
      await item.getByRole("button", { name: "删除", exact: true }).isEnabled(),
    );
  });
  await check("hide solo and show all", async () => {
    await items()
      .first()
      .getByRole("button", { name: /显示隐藏/ })
      .click();
    assert.equal((await stored())[0].visible, false);
    await items()
      .last()
      .getByRole("button", { name: "只看此项", exact: true })
      .click();
    assert.equal((await stored()).filter((fn) => fn.visible).length, 1);
    await button("显示全部").click();
    assert.equal(
      (await stored()).filter((fn) => fn.visible).length,
      await items().count(),
    );
  });
  await check("readable invalid-expression error", async () => {
    await page.locator("#function-input").fill("sin(");
    await page.waitForTimeout(350);
    const status = page.getByRole("status");
    assert.match(await status.innerText(), /检查输入/);
    assert.ok((await status.locator("p").innerText()).length > 3);
    assert.ok(await status.isVisible());
    await page.locator("#function-input").fill("");
  });
  await check("Ctrl K search and Enter dispatch", async () => {
    await items().first().click();
    const before = await items().count();
    await page.keyboard.press("Control+k");
    const input = page.getByRole("dialog").locator("input");
    await input.fill("关于 Y 轴");
    await input.press("Enter");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await items().count(), before + 1);
  });
  await check("download and import JSON roundtrip", async () => {
    const before = await stored();
    const downloadPromise = page.waitForEvent("download");
    await button("导出实验").click();
    const download = await downloadPromise;
    const payload = await fs.readFile(await download.path());
    assert.equal(
      JSON.parse(payload.toString()).functions.length,
      before.length,
    );
    await items()
      .first()
      .getByRole("button", { name: "删除", exact: true })
      .click();
    assert.equal(await items().count(), before.length - 1);
    await page.locator("input[type=file]").setInputFiles({
      name: "roundtrip.json",
      mimeType: "application/json",
      buffer: payload,
    });
    await page.waitForTimeout(150);
    assert.deepEqual(await stored(), before);
    assert.match(await page.getByRole("status").innerText(), /实验已导入/);
  });
  await check("mobile canvas fills stage without overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const stage = await page.locator(".graph-stage").boundingBox(),
      canvas = await page.locator("canvas").boundingBox();
    assert.ok(
      Math.abs(canvas.width - stage.width) < 2 &&
        Math.abs(canvas.height - stage.height) < 2,
      `stage ${JSON.stringify(stage)} canvas ${JSON.stringify(canvas)}`,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  });
  if (pageErrors.length)
    failures.push({
      name: "uncaught browser errors",
      error: pageErrors.join("; "),
    });
  await fs.writeFile(
    ".runtime/test-results/advanced-browser-results.json",
    JSON.stringify({ passed, failures }, null, 2),
  );
  await browser.close();
  console.log(
    `${passed.length} advanced checks passed; ${failures.length} failed`,
  );
  if (failures.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
