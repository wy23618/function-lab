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
      [390, 844, true],
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
      const button = (name) => page.getByRole("button", { name, exact: true });
      const store = () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("function-lab-v1")),
        );
      const [f, g, h] = await store();
      const inner = page.getByLabel("复合的内函数", { exact: true });
      const outer = page.getByLabel("复合的外函数", { exact: true });
      await button("复合").click();
      await inner.selectOption(f.id);
      assert.match(
        await page.locator(".composition-formula").innerText(),
        /f\(f\(x\)\)/,
      );
      assert.equal(
        (await store()).length,
        3,
        "composition remains a preview until saved",
      );
      await inner.selectOption(g.id);
      await button("交换顺序").click();
      assert.match(
        await page.locator(".composition-formula").innerText(),
        /g\(f\(x\)\)/,
      );
      await outer.selectOption(h.id);
      await inner.selectOption(g.id);
      assert.match(
        await page.locator(".composition-formula").innerText(),
        /h\(g\(x\)\)/,
      );
      await page.locator(".composition-rules summary").click();
      assert.match(
        await page.locator(".composition-rules").innerText(),
        /复合不等于相乘/,
      );
      assert.match(
        await page.locator(".composition-rules").innerText(),
        /内函数定义域/,
      );
      await page.locator(".composition-rules summary").click();
      await outer.selectOption(f.id);
      await button("添加为新函数").click();
      const composed = (await store()).at(-1);
      assert.equal((await store()).length, 4);

      await page.locator(".function-delete-direct").first().click();
      let data = await store();
      assert.equal(data.length, 3);
      assert.equal(
        data.find((fn) => fn.id === composed.id).liveBindings.f,
        undefined,
        "deleting the source freezes its existing dependents",
      );
      await page
        .locator(".function-delete-feedback")
        .getByRole("button", { name: "撤销", exact: true })
        .click();
      data = await store();
      assert.equal(data.length, 4);
      assert.equal(
        data.find((fn) => fn.id === composed.id).liveBindings.f,
        f.id,
        "undo restores the original live dependency",
      );

      await page.locator(".function-formula").first().click();
      await page.locator(".function-delete-direct").nth(1).click();
      await page
        .getByText("来源函数已删除，请重新选择内函数或外函数。", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await inner.inputValue(),
        "",
        "a removed source is not silently replaced with another function",
      );
      assert.ok(await button("添加为新函数").isDisabled());
      await page
        .locator(".function-delete-feedback")
        .getByRole("button", { name: "撤销", exact: true })
        .click();
      await page.waitForFunction(
        () => !document.querySelector(".action-save .primary")?.disabled,
      );
      await page.getByLabel("收起函数操作", { exact: true }).click();

      const input = page.getByLabel("输入表达式", { exact: true });
      await input.dispatchEvent("compositionstart");
      await input.fill("２（x＋１");
      await input.press("Enter");
      assert.equal(
        (await store()).length,
        4,
        "IME confirmation does not submit a function",
      );
      await input.dispatchEvent("compositionend");
      await page.getByText("已补齐右括号", { exact: true }).waitFor();
      assert.equal(
        await input.inputValue(),
        "２（x＋１",
        "the editor does not rewrite the text while typing",
      );
      await button("添加函数").click();
      assert.equal((await store()).length, 5);
      assert.equal((await store()).at(-1).currentExpression, "2(x+1)");
      await input.fill("sin(");
      await button("添加函数").click();
      assert.equal(
        (await store()).length,
        5,
        "missing operands are never invented",
      );
      await input.fill("sin²x");
      await button("添加函数").click();
      assert.equal(
        (await store()).length,
        6,
        "valid corrected input can be submitted immediately",
      );
      assert.match((await store()).at(-1).currentExpression, /sin\(x\)/);
      if (!touch) {
        await page.locator(".function-item").last().focus();
        await page.keyboard.press("Delete");
        assert.equal((await store()).length, 5);
        await page
          .locator(".function-delete-feedback")
          .getByRole("button", { name: "撤销", exact: true })
          .click();
        assert.equal((await store()).length, 6);
      }
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `.runtime/comfortable-input-${width}x${height}.png`,
      });
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      "comfortable input checks passed: one-click delete/undo, live dependencies, missing sources, independent composition selectors, IME, tolerant input and safe retries in 3 layouts",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
