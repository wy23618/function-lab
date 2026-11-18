const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const url = process.env.LAB_URL || "http://127.0.0.1:5173/";
const pause = (page) => page.waitForTimeout(180);
const input = (page) => page.getByLabel("输入表达式", { exact: true });
async function source(page, text) {
  await input(page).fill(text);
  const hide = page.getByRole("button", { name: "收起数学键盘", exact: true });
  if (await hide.isVisible()) await hide.click();
}
const probe = (page) => page.getByLabel("观察点数值", { exact: true });
const values = (page) =>
  page.locator(".study-readout strong").allTextContents();
const near = (value, expected, tolerance = 1e-4) =>
  assert.ok(
    Math.abs(Number(value) - expected) < tolerance,
    `${value} ≈ ${expected}`,
  );
async function mode(page, name) {
  await page.getByRole("tab", { name, exact: true }).click();
  await pause(page);
}
async function drag(page, context, from, to, touch) {
  if (!touch) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  } else {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [from],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [to],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  }
  await pause(page);
}
(async () => {
  fs.mkdirSync(".runtime/calculus", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.LAB_BROWSER ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const errors = [];
  try {
    for (const size of [
      { width: 1440, height: 950 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      const touch = size.width < 900;
      const context = await browser.newContext({
        viewport: size,
        hasTouch: touch,
        isMobile: touch,
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      // One composer feeds all views, without adding a second input.
      await source(page, "x^8");
      await mode(page, "导数");
      await page.getByLabel("求导阶数", { exact: true }).fill("8");
      await probe(page).fill("1");
      await pause(page);
      const derivative = await values(page);
      near(derivative[0], 40320);
      near(derivative[1], 40320);
      near(await page.locator(".readout-link b").innerText(), 40320);
      assert.equal(
        await page
          .locator('.study-studio input[aria-label="输入表达式"]')
          .count(),
        0,
      );
      await page
        .getByRole("button", { name: "求导阶数减一阶", exact: true })
        .click();
      assert.equal(
        await page.getByLabel("求导阶数", { exact: true }).inputValue(),
        "7",
      );
      await source(page, "sin(x)");
      await mode(page, "积分");
      await probe(page).fill(String(Math.PI));
      await pause(page);
      near((await values(page))[1], 2);
      near((await values(page))[2], 2);
      let canvas = await page.locator(".study-plot canvas").boundingBox();
      assert.ok(
        canvas.height > 95 && canvas.y + canvas.height <= size.height,
        "plot stays within viewport",
      );
      const readout = await page.locator(".study-readout").boundingBox();
      assert.ok(
        readout.y + readout.height <= size.height,
        "values stay visible",
      );
      const old = await probe(page).inputValue();
      await drag(
        page,
        context,
        {
          x: canvas.x + canvas.width * 0.55,
          y: canvas.y + canvas.height * 0.67,
        },
        {
          x: canvas.x + canvas.width * 0.65,
          y: canvas.y + canvas.height * 0.67,
        },
        touch,
      );
      assert.notEqual(await probe(page).inputValue(), old, "drag moves probe");
      // Drag a on the baseline; its field and the accumulation function update together.
      const viewport = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("function-lab-workspace-v1") || "null"),
      );
      const anchor = await page
        .getByLabel("积分下限 a", { exact: true })
        .inputValue();
      const view = viewport?.viewport || { cx: 0, cy: 0, scale: 55 };
      const base = {
        x: canvas.x + canvas.width / 2 - view.cx * view.scale,
        y: canvas.y + canvas.height / 2 + view.cy * view.scale,
      };
      await drag(page, context, base, { x: base.x + 30, y: base.y }, touch);
      assert.notEqual(
        await page.getByLabel("积分下限 a", { exact: true }).inputValue(),
        anchor,
        "dragging a updates the single lower bound",
      );
      await page.getByLabel("积分下限 a", { exact: true }).fill("0");
      await page.getByRole("button", { name: "分析", exact: true }).click();
      await page.getByLabel("积分常数 C", { exact: true }).fill("3");
      await page.getByRole("button", { name: "收起研究分析" }).click();
      await probe(page).fill(String(Math.PI));
      near((await values(page))[1], 5);
      near((await values(page))[2], 2);
      await page.getByLabel("积分下限 a", { exact: true }).fill("1");
      await probe(page).fill("1");
      near((await values(page))[1], 3);
      near((await values(page))[2], 0);
      assert.equal(anchor, "0");
      await page.getByRole("button", { name: "变上限", exact: true }).click();
      await page.getByLabel("积分下限 a", { exact: true }).fill("0");
      await page
        .getByLabel("积分上限 b", { exact: true })
        .fill(String(2 * Math.PI));
      await probe(page).fill("1");
      near((await values(page))[2], 0);
      await page.getByLabel("积分上限 b", { exact: true }).fill("4.6");
      await pause(page);
      await page.screenshot({
        path: `.runtime/calculus/integral-${size.width}.png`,
      });
      // A jump has two one-sided slopes, while an isolated reassignment has one limit slope.
      await source(page, "x<0 ? -1 : 2");
      await page.getByLabel("积分下限 a", { exact: true }).fill("-1");
      await page.getByLabel("积分上限 b", { exact: true }).fill("1");
      await probe(page).fill("0");
      await pause(page);
      assert.match(
        await page.locator(".study-insight").innerText(),
        /左右斜率分别为 -1、2/,
      );
      await source(page, "x==0 ? 7 : sin(x)/x");
      await pause(page);
      assert.match(
        await page.locator(".study-insight").innerText(),
        /可去间断/,
      );
      near((await values(page))[0], 7);
      await source(page, "1/x");
      await pause(page);
      assert.equal((await values(page))[2], "未定义");
      assert.match(
        await page.locator(".study-insight").innerText(),
        /未确认收敛/,
      );
      await source(page, "exp(-x)");
      await page.getByLabel("积分下限 a", { exact: true }).fill("0");
      await page.getByLabel("积分上限 b", { exact: true }).fill("∞");
      await pause(page);
      near((await values(page))[2], 1);
      await source(page, "sin(x)");
      await mode(page, "泰勒");
      await probe(page).fill("1.5");
      await page.getByLabel("泰勒阶数", { exact: true }).fill("7");
      await pause(page);
      const taylor = await values(page);
      near(taylor[0], Math.sin(1.5));
      assert.ok(Number(taylor[2]) < 0.001);
      await page.screenshot({
        path: `.runtime/calculus/taylor-${size.width}.png`,
      });
      await page.getByRole("button", { name: "分析", exact: true }).click();
      assert.equal(
        await page.getByRole("button", { name: /采用 \d+ 阶泰勒/ }).count(),
        13,
      );
      await page.getByLabel("泰勒多点求值").fill("0, pi/2, 2");
      assert.match(await page.locator(".study-drawer").innerText(), /pi\/2/);
      await page.getByRole("button", { name: "收起研究分析" }).click();
      await page.getByLabel("泰勒展开点", { exact: true }).fill("1");
      await probe(page).fill("1");
      near((await values(page))[2], 0);
      // Reverse-axis equations support calculus with respect to y, including vertical lines.
      await source(page, "x=y^2");
      await mode(page, "导数");
      await page.getByLabel("求导阶数", { exact: true }).fill("1");
      await probe(page).fill("2");
      near((await values(page))[0], 4);
      near((await values(page))[1], 4);
      assert.match(
        await page.locator(".study-source").innerText(),
        /以 y 为自变量/,
      );
      canvas = await page.locator(".study-plot canvas").boundingBox();
      const oldY = await probe(page).inputValue();
      await drag(
        page,
        context,
        { x: canvas.x + canvas.width * 0.6, y: canvas.y + canvas.height * 0.4 },
        { x: canvas.x + canvas.width * 0.6, y: canvas.y + canvas.height * 0.6 },
        touch,
      );
      assert.notEqual(await probe(page).inputValue(), oldY);
      await source(page, "x=2");
      await probe(page).fill("1");
      await pause(page);
      near((await values(page))[0], 2);
      near((await values(page))[1], 0);
      // Saving a draft first persists its source and gives the derivative a stable link.
      await source(page, "x^3");
      const before = await page.locator(".function-item").count();
      await page.getByRole("button", { name: "保存当前研究曲线" }).click();
      await pause(page);
      assert.equal(await page.locator(".function-item").count(), before + 2);
      const stored = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("function-lab-v1")),
      );
      assert.ok(stored.at(-1).calculusLink);
      assert.equal(stored.at(-1).calculusLink.sourceId, stored.at(-2).id);
      const sourceRow = page.locator(".function-item").nth(before);
      await sourceRow.getByRole("button", { name: /编辑/ }).click();
      await source(page, "x^4");
      await page.getByRole("button", { name: "保存函数", exact: true }).click();
      await page
        .locator(".function-item")
        .last()
        .locator(".function-formula")
        .click();
      await probe(page).fill("2");
      await pause(page);
      near((await values(page))[0], 32);
      near((await values(page))[1], 48);
      await mode(page, "画图");
      await mode(page, "导数");
      assert.equal(
        await page.getByLabel("求导阶数", { exact: true }).inputValue(),
        "1",
      );
      await page.reload();
      await mode(page, "泰勒");
      assert.equal(
        await page.getByLabel("泰勒阶数", { exact: true }).inputValue(),
        "7",
      );
      assert.equal(
        await page.getByLabel("泰勒展开点", { exact: true }).inputValue(),
        "1",
      );
      await source(page, "a*x^2");
      await input(page).press("Enter");
      await pause(page);
      await page.getByLabel("参数 a 数值", { exact: true }).fill("3");
      await mode(page, "导数");
      await probe(page).fill("2");
      await pause(page);
      near((await values(page))[0], 12);
      near((await values(page))[1], 12);
      await source(page, "x^9");
      await page
        .locator(".function-item")
        .first()
        .locator(".function-formula")
        .click();
      assert.equal(
        await input(page).inputValue(),
        "x^9",
        "selecting a saved curve keeps the draft",
      );
      assert.doesNotMatch(
        await page.locator(".study-source").innerText(),
        /输入预览/,
        "selection chooses the studied function",
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      console.log(
        `Connected calculus flows passed: ${size.width} × ${size.height}`,
      );
      await context.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
