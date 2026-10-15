const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.LAB_URL || "http://127.0.0.1:5173/";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const errors = [];
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector("canvas");
  await page.waitForTimeout(650);
  const store = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("function-lab-v1")));
  const items = () => page.locator(".function-item");
  assert.equal(await items().count(), 3);
  assert.equal(await page.locator(".graph-legend > button").count(), 3);
  assert.ok((await page.locator(".curve-label").count()) >= 2);
  assert.ok(
    (await page.locator(".curve-label").first().innerText()).match(
      /^[a-z]\(x\)$/,
    ),
  );
  const style = await page
    .locator(".curve-label")
    .first()
    .evaluate((el) => ({
      font: parseFloat(window.getComputedStyle(el).fontSize),
      bg: window.getComputedStyle(el).backgroundColor,
    }));
  assert.ok(style.font >= 18);
  assert.equal(style.bg, "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: ".runtime/redesign-desktop.png" });
  await page.getByRole("button", { name: "对称", exact: true }).click();
  assert.equal(await page.locator(".right-panel").count(), 0);
  await page.getByRole("button", { name: "Y 轴", exact: true }).click();
  assert.equal(await items().count(), 3);
  await page.getByRole("button", { name: "添加为新函数", exact: true }).click();
  assert.equal(await items().count(), 4);
  const data = await store();
  const f = data[0];
  await page.getByLabel("正在操作的函数").selectOption(f.id);
  await page.getByRole("button", { name: "复合", exact: true }).click();
  assert.match(await page.locator(".composition-order").innerText(), /先算 g/);
  assert.match(await page.locator(".composition-order").innerText(), /再算 f/);
  await page.getByRole("button", { name: "交换顺序" }).click();
  assert.match(await page.locator(".composition-order").innerText(), /先算 f/);
  await page.getByRole("button", { name: "交换顺序" }).click();
  await page.screenshot({ path: ".runtime/redesign-composition.png" });
  await page.getByRole("button", { name: "添加为新函数", exact: true }).click();
  assert.equal(await items().count(), 5);
  const composed = (await store()).at(-1);
  assert.match(composed.currentExpression, /f\(g\(x\)\)/);
  await items().first().locator(".function-formula").click();
  await page.getByLabel("输入表达式", { exact: true }).fill("x^3");
  await page.getByLabel("输入表达式", { exact: true }).press("Enter");
  await page.waitForTimeout(350);
  assert.equal((await store()).at(-1).bindings.f.currentExpression, "x^3");
  const compositeAlias = (await store()).at(-1).alias;
  await items().first().locator(".function-formula").click();
  await page
    .getByLabel("输入表达式", { exact: true })
    .fill(`${compositeAlias}(x)`);
  await page.getByLabel("输入表达式", { exact: true }).press("Enter");
  await page.waitForTimeout(400);
  assert.equal(
    (await store())[0].currentExpression,
    "x^3",
    "cyclic edit preserves the original function",
  );
  assert.match(await page.locator(".input-error").innerText(), /循环/);
  await page.getByLabel("输入表达式", { exact: true }).fill("f(x)=x^3");
  await page.getByLabel("输入表达式", { exact: true }).press("Enter");
  await page.waitForTimeout(300);
  assert.equal(
    await page.locator(".input-error").count(),
    0,
    "editing an existing named function is valid",
  );
  await items().first().locator(".function-delete").click();
  assert.equal(await items().count(), 4);
  const frozen = (await store()).at(-1);
  assert.ok(!frozen.liveBindings.f);
  assert.ok(!frozen.currentExpression.includes("f("));
  await page.getByRole("button", { name: "设置", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "对函数进行操作" }).count(),
    0,
  );
  await page.getByRole("button", { name: "设置", exact: true }).click();
  for (const [name, viewport] of [
    ["portrait", { width: 390, height: 844 }],
    ["landscape", { width: 844, height: 390 }],
    ["tablet", { width: 820, height: 1180 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: name !== "tablet",
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(url);
    await p
      .locator(".curve-label")
      .first()
      .waitFor({ state: "visible", timeout: 8000 });
    assert.ok(
      (await p.locator(".curve-label").count()) > 0,
      name + " curve names visible",
    );
    assert.equal(await p.locator(".graph-legend > button").count(), 3);
    assert.ok((await p.locator(".graph-stage").boundingBox()).height >= 150);
    await p.getByRole("button", { name: "平移", exact: true }).click();
    await p.getByLabel("横向平移 滑块", { exact: true }).fill("2");
    assert.equal(await p.locator(".function-item").count(), 3);
    await p.getByRole("button", { name: "添加为新函数", exact: true }).click();
    await p.getByRole("button", { name: "复合", exact: true }).click();
    await p.locator(".action-save").waitFor({ state: "visible" });
    const saveBounds = await p.locator(".action-save").boundingBox();
    const graphBounds = await p.locator(".graph-stage").boundingBox();
    assert.ok(
      saveBounds.y >= graphBounds.y &&
        saveBounds.y + saveBounds.height <= graphBounds.y + graphBounds.height,
      name + " save controls stay on the graph",
    );
    await p.screenshot({ path: ".runtime/redesign-" + name + ".png" });
    await p.getByRole("button", { name: "收起函数操作" }).click();
    await p.getByRole("button", { name: /打开数学键盘/ }).click();
    assert.ok(
      await p
        .getByRole("button", { name: "收起数学键盘", exact: true })
        .isVisible(),
    );
    assert.equal(
      await p
        .getByRole("button", { name: "收起数学键盘", exact: true })
        .innerText(),
      "收起",
    );
    await p.getByRole("button", { name: "7", exact: true }).click();
    await p
      .getByRole("button", { name: "退格删除一个字符", exact: true })
      .click();
    assert.equal(
      await p.getByLabel("输入表达式", { exact: true }).inputValue(),
      "",
    );
    await p.screenshot({ path: ".runtime/redesign-keyboard-" + name + ".png" });
    await p.getByRole("button", { name: "收起数学键盘", exact: true }).click();
    const canvas = await p.locator("canvas").boundingBox();
    await p.mouse.move(
      canvas.x + canvas.width / 2,
      canvas.y + canvas.height / 2,
    );
    await p.mouse.down();
    await p.mouse.move(
      canvas.x + canvas.width / 2 + 35,
      canvas.y + canvas.height / 2 + 20,
      { steps: 4 },
    );
    assert.equal(await p.locator(".curve-label").count(), 0);
    await p.mouse.up();
    await p.waitForTimeout(500);
    assert.ok((await p.locator(".curve-label").count()) > 0);
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      name + " no horizontal overflow",
    );
    await context.close();
  }
  const rotatedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const rotated = await rotatedContext.newPage();
  rotated.on("pageerror", (e) => errors.push(e.message));
  await rotated.addInitScript(() => {
    window.HTMLElement.prototype.requestFullscreen = () =>
      Promise.reject(new Error("unsupported"));
  });
  await rotated.goto(url);
  await rotated.getByRole("button", { name: "横屏看图", exact: true }).click();
  await rotated.locator(".manual-landscape").waitFor();
  await rotated
    .locator(".curve-label")
    .first()
    .waitFor({ state: "visible", timeout: 8000 });
  await rotated.getByRole("button", { name: "复合", exact: true }).click();
  await rotated.locator(".action-save").waitFor({ state: "visible" });
  await rotated.screenshot({ path: ".runtime/redesign-manual-landscape.png" });
  await rotated.goBack();
  await rotated.waitForTimeout(250);
  assert.equal(
    await rotated.locator(".function-action-body").count(),
    0,
    "browser back closes operations",
  );
  assert.equal(await rotated.locator(".composition-formula").count(), 0);
  assert.equal(
    await rotated.locator(".manual-landscape").count(),
    1,
    "back retains the underlying landscape mode",
  );
  await rotated
    .getByRole("button", { name: "关闭横屏提示", exact: true })
    .click();
  await rotated.getByRole("button", { name: /打开数学键盘/ }).click();
  const keyboardRect = await rotated.locator(".math-input-area").boundingBox();
  assert.ok(
    keyboardRect.x >= -1 &&
      keyboardRect.y >= -1 &&
      keyboardRect.x + keyboardRect.width <= 391 &&
      keyboardRect.y + keyboardRect.height <= 845,
    "rotated keyboard stays in the viewport",
  );
  await rotated.getByRole("button", { name: "7", exact: true }).click();
  await rotated.screenshot({
    path: ".runtime/interaction-manual-keyboard.png",
  });
  await rotated.goBack();
  await rotated.waitForTimeout(150);
  assert.equal(
    await rotated.locator(".manual-landscape").count(),
    1,
    "keyboard back retains landscape mode",
  );
  assert.ok(
    rotated.url().includes("function-lab") ||
      rotated.url().includes("127.0.0.1"),
    "back stays in the app",
  );
  await rotatedContext.close();
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "redesign browser checks passed: names, composition, updates/deletion, settings, touch layouts and keyboard",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
