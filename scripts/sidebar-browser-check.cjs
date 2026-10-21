const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.LAB_URL || "http://127.0.0.1:5173/";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.LAB_BROWSER ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  try {
    const errors = [];
    for (const [width, height, touch] of [
      [1440, 900, false],
      [1366, 768, false],
      [390, 844, true],
      [320, 640, true],
      [844, 390, true],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: touch,
        isMobile: touch,
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      await page.locator("canvas").waitFor();
      const input = page.getByLabel("输入表达式", { exact: true });
      const row = (index) => page.locator(".function-item").nth(index);
      const button = (name) => page.getByRole("button", { name, exact: true });
      const store = () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("function-lab-v1")),
        );
      const originals = await store();

      await row(1).locator(".function-formula").click();
      assert.equal(
        await page.locator(".keyboard").count(),
        0,
        "selecting a function never opens the keyboard",
      );
      assert.equal(
        await input.inputValue(),
        "",
        "selection does not load a formula into the editor",
      );
      assert.equal(
        await page.locator("canvas").getAttribute("data-selected-function"),
        originals[1].id,
      );
      assert.match(
        await page.locator(".graph-selection").innerText(),
        /g\(x\).*sin/s,
        "plot identifies the selected curve",
      );
      await row(1).locator(".function-edit").click();
      assert.equal(await input.inputValue(), "sin(x)");
      assert.match(
        await page.locator(".composer-context").innerText(),
        /编辑 g/,
      );
      if (!touch) await button("打开数学键盘").click();
      assert.ok(await button("收起数学键盘").isVisible());
      assert.equal(
        await page.locator(".composer-submit").count(),
        1,
        "only one save/add action exists",
      );
      assert.ok(await button("保存函数").isVisible());
      await input.fill("sin(x)+2");
      const keyboardToggle = await page
        .locator(".keyboard-toggle")
        .boundingBox();
      for (const category of ["函数", "符号", "字母", "常用"]) {
        await page.getByRole("tab", { name: category, exact: true }).click();
        const next = await page.locator(".keyboard-toggle").boundingBox();
        assert.ok(
          Math.abs(keyboardToggle.y - next.y) < 2,
          "the keyboard close control does not move between categories",
        );
      }
      await button("收起数学键盘").click();
      assert.equal(
        await input.inputValue(),
        "sin(x)+2",
        "closing preserves the edit draft",
      );
      await row(2).locator(".function-formula").click();
      assert.equal(await page.locator(".keyboard").count(), 0);
      assert.equal(
        await input.inputValue(),
        "sin(x)+2",
        "viewing another curve preserves unsaved input",
      );
      assert.match(
        await page.locator(".graph-selection").innerText(),
        /h\(x\)/,
      );
      // The editor explicitly still targets g, even while the user inspects h.
      assert.match(
        await page.locator(".composer-context").innerText(),
        /编辑 g/,
      );
      await button("保存函数").click();
      const saved = await store();
      assert.equal(saved.length, originals.length);
      assert.equal(saved[1].currentExpression, "sin(x)+2");
      assert.equal(saved[2].currentExpression, originals[2].currentExpression);

      await row(0).locator(".function-edit").click();
      await input.fill("x^3");
      await button("取消编辑").click();
      assert.equal(
        (await store())[0].currentExpression,
        "x^2",
        "cancel never modifies the existing function",
      );
      await button("添加函数").waitFor();
      await input.fill("x^3");
      await button("添加函数").click();
      assert.equal((await store()).length, 4);
      assert.equal(await input.inputValue(), "");
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `.runtime/sidebar-verified-${width}x${height}.png`,
      });
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      "sidebar checks passed: selection/edit separation, curve identification, one save action, stable keyboard controls, draft preservation, cancel and add across 5 layouts",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
