const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.LAB_URL || "http://127.0.0.1:5173/";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const errors = [];
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 950 }],
    ["phone", { width: 390, height: 844 }],
    ["landscape", { width: 844, height: 390 }],
    ["tablet", { width: 820, height: 1180 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: name !== "desktop",
      isMobile: name === "phone" || name === "landscape",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__axisDraw = [];
      const draw = window.CanvasRenderingContext2D.prototype.fillText;
      window.CanvasRenderingContext2D.prototype.fillText = function (
        text,
        ...args
      ) {
        window.__axisDraw.push(String(text));
        if (window.__axisDraw.length > 3000) window.__axisDraw.shift();
        return draw.call(this, text, ...args);
      };
    });
    await page.goto(url);
    await page.locator("canvas").waitFor();
    await page.waitForFunction(
      () =>
        window.__axisDraw.some((text) => text.includes("π")) &&
        window.__axisDraw.includes("1") &&
        window.__axisDraw.includes("2"),
    );
    if (name === "desktop")
      await page.screenshot({ path: ".runtime/pi-axis-auto-desktop.png" });
    const data = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("function-lab-v1")),
    );
    const f = data[0].id,
      g = data[1].id;
    const button = (n) => page.getByRole("button", { name: n, exact: true });
    const select = page.getByLabel("正在操作的函数");
    await button("平移").click();
    const box = await page.locator(".function-actions").boundingBox();
    const save = await page.locator(".action-save").boundingBox();
    assert.ok(await button("添加为新函数").isDisabled());
    await page.getByLabel("横向平移 滑块", { exact: true }).fill("2");
    await button("平移").click();
    assert.equal(await page.locator(".function-action-body").count(), 1);
    assert.equal(
      await page.getByLabel("横向平移", { exact: true }).inputValue(),
      "2",
    );
    await select.selectOption(g);
    assert.equal(
      await page.getByLabel("横向平移", { exact: true }).inputValue(),
      "0",
    );
    await page.getByLabel("横向平移 滑块", { exact: true }).fill("4");
    await select.selectOption(f);
    assert.equal(
      await page.getByLabel("横向平移", { exact: true }).inputValue(),
      "2",
    );
    await page.waitForTimeout(100);
    assert.ok(await button("添加为新函数").isEnabled());
    for (const tool of ["对称", "复合", "更多", "平移"]) {
      await button(tool).click();
      const after = await page.locator(".function-actions").boundingBox();
      const afterSave = await page.locator(".action-save").boundingBox();
      assert.ok(
        Math.abs(after.height - box.height) < 1,
        tool + " height stable",
      );
      assert.ok(Math.abs(afterSave.y - save.y) < 1, tool + " footer stable");
    }
    await page.getByLabel("横向平移 滑块", { exact: true }).fill("3");
    await button("取消").click();
    assert.equal(
      await page.getByLabel("横向平移", { exact: true }).inputValue(),
      "0",
    );
    assert.ok(await button("添加为新函数").isDisabled());
    assert.ok(
      Math.abs(
        (await page.locator(".function-actions").boundingBox()).height -
          box.height,
      ) < 1,
    );
    await page.getByLabel("横向平移 滑块", { exact: true }).fill("1");
    await button("添加为新函数").click();
    assert.equal(await page.locator(".function-item").count(), 4);
    assert.equal(await select.inputValue(), f);
    assert.equal(await page.locator(".function-action-body").count(), 1);
    assert.ok(await button("添加为新函数").isDisabled());
    assert.match(await page.locator(".action-save").innerText(), /已添加/);
    await button("更多").click();
    const savedCount = await page.locator(".function-item").count();
    await button("奇偶性").click();
    await page.locator(".analysis-result p").waitFor();
    assert.match(
      await page.locator(".analysis-result p").innerText(),
      /偶函数/,
    );
    assert.equal(
      await page.locator(".function-item").count(),
      savedCount,
      "parity never adds functions",
    );
    assert.equal(
      await button("添加为新函数").count(),
      0,
      "analysis has no add-function button",
    );
    await button("对照 Y 轴对称").click();
    assert.equal(
      await page.locator(".function-item").count(),
      savedCount,
      "comparison is temporary",
    );
    await button("看图像").click();
    assert.equal(await page.locator(".function-action-body").count(), 0);
    assert.match(await page.locator(".action-save").innerText(), /对照虚线/);
    await button("查看结果").click();
    assert.equal(
      await button("对照 Y 轴对称").getAttribute("aria-pressed"),
      "true",
      "inspection preserves comparison",
    );
    await button("平移").click();
    await page.getByLabel("横向平移 滑块", { exact: true }).fill("2");
    await button("看图像").click();
    assert.equal(await page.locator(".function-action-body").count(), 0);
    assert.ok(
      await button("添加为新函数").isEnabled(),
      "inspection preserves draft and allows direct save",
    );
    assert.equal(await page.locator(".function-item").count(), savedCount);
    await button("添加为新函数").click();
    assert.equal(await page.locator(".function-item").count(), savedCount + 1);
    await button("更多").click();
    await button("定义域").click();
    await page.goBack();
    await page.waitForTimeout(150);
    assert.ok(
      await page.locator(".more-options").isVisible(),
      "back returns from subtool to more",
    );
    await button("设置").click();
    await page.evaluate(() => {
      window.__axisDraw = [];
    });
    await page.getByLabel("坐标标注", { exact: true }).selectOption("numeric");
    await page.waitForFunction(
      () =>
        document.querySelector("canvas").dataset.xAxisLabels === "numeric" &&
        window.__axisDraw.length > 4,
    );
    assert.ok(
      await page.evaluate(
        () => !window.__axisDraw.some((text) => text.includes("π")),
      ),
      "numeric mode draws numeric coordinates",
    );
    await page.getByLabel("坐标标注", { exact: true }).selectOption("pi");
    await page.waitForFunction(
      () => document.querySelector("canvas").dataset.yAxisLabels === "pi",
    );
    await page.getByLabel("坐标标注", { exact: true }).selectOption("auto");
    await page.goBack();
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".settings-popover").count(), 0);
    assert.equal(
      await page.locator(".function-action-body").count(),
      1,
      "settings back retains tools",
    );
    await page.getByRole("button", { name: /打开数学键盘/ }).click();
    assert.ok(await page.locator(".function-actions").isHidden());
    const keyboardBox = await page.locator(".math-input-area").boundingBox();
    for (const category of ["函数", "符号", "字母", "常用"]) {
      await page.getByRole("tab", { name: category, exact: true }).click();
      const nextBox = await page.locator(".math-input-area").boundingBox();
      assert.ok(
        Math.abs(nextBox.height - keyboardBox.height) < 2,
        "keyboard categories keep dock height",
      );
    }
    await page.goBack();
    await page.waitForTimeout(200);
    assert.equal(await page.locator(".keyboard").count(), 0);
    assert.equal(
      await page.locator(".function-action-body").count(),
      1,
      "keyboard back retains tools",
    );
    await page.screenshot({ path: ".runtime/interaction-" + name + ".png" });
    await page.goBack();
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".function-action-body").count(), 0);
    assert.ok(
      page.url().includes("127.0.0.1") || page.url().includes("function-lab"),
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "interaction checks passed: stable tool/keyboard frames, per-function memory, cancellation, save feedback and layered back",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
