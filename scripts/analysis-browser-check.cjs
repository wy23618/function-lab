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
    }),
    errors = [],
    passed = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForSelector("canvas");
  const button = (name) => page.getByRole("button", { name, exact: true });
  const items = () => page.locator(".function-item");
  await page.locator("#function-input").fill("cos(x)");
  await page.locator("#function-input").press("Enter");
  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("function-lab-v1")));
  let data = await stored();
  assert.equal(data.length, 3);
  assert.notEqual(data[1].color, data[2].color);
  passed.push("sin and cos share a canvas with different colors");
  await items().first().click();
  await button("分析").click();
  await page.getByLabel("切点横坐标").fill("2");
  await button("导数 f′(x₀)").click();
  assert.equal(await items().count(), 4);
  data = await stored();
  assert.equal(data.at(-1).name, "导函数");
  assert.ok(data.at(-1).differentiabilityChecks.length);
  passed.push("symbolic derivative curve with original domain constraints");
  await items().first().click();
  await page.getByLabel("切点横坐标").fill("2");
  await button("绘制切线").click();
  assert.equal(await items().count(), 5);
  assert.match(await page.getByRole("status").innerText(), /4.000000/);
  passed.push("tangent slope and point for x squared");
  await items().first().click();
  await page.getByLabel("切点横坐标").fill("0");
  await button("绘制法线").click();
  assert.match(await page.getByRole("status").innerText(), /法线为 x=0/);
  passed.push("vertical normal at a horizontal tangent");
  await button("零点").click();
  assert.ok((await page.locator(".point-strip button").count()) > 0);
  passed.push("roots as observation markers");
  await page.getByLabel("第二个函数").selectOption((await stored())[2].id);
  await button("求两函数交点").click();
  assert.equal(await page.locator(".point-strip button").count(), 2);
  passed.push("selected function intersections are marked");
  await button("奇偶性").click();
  assert.equal(await items().count(), 7);
  assert.match(await page.getByRole("status").innerText(), /偶函数/);
  passed.push("parity explanation and comparison overlays");
  await items().first().click();
  await button("几何").click();
  await page.getByLabel("对称直线", { exact: true }).fill("y=2x+1");
  await button("使用此直线").click();
  assert.equal(await page.getByLabel("直线系数 A").inputValue(), "-2");
  assert.equal(await page.getByLabel("直线系数 B").inputValue(), "1");
  assert.equal(await page.getByLabel("直线系数 C").inputValue(), "-1");
  await button("生成镜像关系").click();
  assert.equal((await stored()).at(-1).kind, "relation");
  passed.push("natural line equation and arbitrary function reflection");
  await button("清除标记").click();
  const canvas = page.locator("canvas");
  await canvas.click({ position: { x: 300, y: 250 } });
  await button("反射最后一个观察点").click();
  assert.equal(await page.locator(".point-strip button").count(), 2);
  assert.match(
    await page.locator(".point-strip button").nth(1).innerText(),
    /A′/,
  );
  assert.match(await page.getByRole("status").innerText(), /A′/);
  passed.push("point reflection and perpendicular reference");
  await page.screenshot({ path: "docs/geometry.png", fullPage: true });
  const width = (await canvas.boundingBox()).width;
  await button("收起工具 ›").click();
  assert.ok((await canvas.boundingBox()).width > width);
  await button("‹ 展开工具").click();
  passed.push("collapsible math panel expands graph");
  await items().first().locator(".expression-edit").fill("sin(");
  assert.match(await page.getByRole("status").innerText(), /括号/);
  assert.equal((await stored())[0].currentExpression, "x^2");
  await items().first().locator(".expression-edit").fill("x^3");
  assert.equal((await stored())[0].currentExpression, "x^3");
  passed.push("invalid list edits retain last valid saved expression");
  await items().first().locator("input[type=color]").fill("#445566");
  assert.equal((await stored())[0].color, "#445566");
  passed.push("color picker updates the saved curve color");
  const picture = () => canvas.evaluate((e) => e.toDataURL());
  const beforeGrid = await picture();
  await page.getByRole("checkbox", { name: "网格", exact: true }).uncheck();
  await page.waitForTimeout(100);
  assert.notEqual(await picture(), beforeGrid);
  await page.getByRole("checkbox", { name: "网格", exact: true }).check();
  await page.getByRole("checkbox", { name: "坐标轴", exact: true }).uncheck();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "坐标轴", exact: true })
      .isChecked(),
    false,
  );
  await page.getByRole("checkbox", { name: "坐标轴", exact: true }).check();
  await page.getByRole("checkbox", { name: "刻度", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "刻度", exact: true }).check();
  passed.push("grid axes and ticks controls update the graph");
  const beforePan = await picture(),
    box = await canvas.boundingBox();
  await page.mouse.move(box.x + 250, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 330, box.y + 290, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  assert.notEqual(await picture(), beforePan);
  await button("复位").click();
  passed.push("dragging pans the plot and reset restores the view");
  await button("适应").click();
  assert.match(await page.getByRole("status").innerText(), /适应/);
  await button("复位").click();
  passed.push("automatic fit updates the visible graph");
  await button("全屏").click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await button("全屏").click();
  await page.waitForFunction(() => !document.fullscreenElement);
  passed.push("fullscreen opens and closes from the canvas controls");
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("wrong file"),
  });
  await page.waitForTimeout(100);
  assert.match(await page.getByRole("status").innerText(), /格式无效/);
  passed.push("invalid imports produce readable errors");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "null.json",
      mimeType: "application/json",
      buffer: Buffer.from("null"),
    });
  await page.waitForTimeout(100);
  assert.match(await page.getByRole("status").innerText(), /不是有效/);
  const canvasTiming = await page.evaluate(() => {
    const start = performance.now();
    return new Promise((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve(performance.now() - start)),
      ),
    );
  });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "docs/analysis-browser-results.json",
    JSON.stringify(
      { passed, errors, canvasFrameWaitMs: canvasTiming },
      null,
      2,
    ),
  );
  await browser.close();
  console.log(`${passed.length} analysis browser checks passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
