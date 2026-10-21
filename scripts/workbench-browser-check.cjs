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
    for (const [width, height] of [
      [320, 640],
      [360, 740],
      [390, 844],
      [768, 1024],
      [1024, 768],
      [1366, 768],
      [1920, 1080],
      [667, 375],
      [844, 390],
    ]) {
      console.log(`Checking ${width}×${height}`);
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width < 1024,
        isMobile: width < 700,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (error) => errors.push(error.message));
      const button = (name) => page.getByRole("button", { name, exact: true });
      await page.goto(url);
      await page.locator("canvas").waitFor();
      await page.waitForTimeout(250);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${width} initial overflow`,
      );
      await button("平移").click();
      await page.getByLabel("横向平移 滑块", { exact: true }).fill("2");
      const plot = await page.locator(".graph-stage").boundingBox();
      const tools = await page.locator(".function-actions").boundingBox();
      assert.ok(plot.height >= 70, `${width} plot remains usable with tools`);
      assert.ok(
        tools.y >= plot.y + plot.height - 1,
        `${width} tools do not cover curves`,
      );
      const collapse = page.getByLabel("收起函数操作", { exact: true });
      const target = await collapse.boundingBox();
      assert.ok(
        await page.evaluate(
          ({ x, y, width, height }) =>
            document
              .elementFromPoint(x + width / 2, y + height / 2)
              ?.closest("button")
              ?.getAttribute("aria-label") === "收起函数操作",
          target,
        ),
        `${width} collapse is unobstructed`,
      );
      await collapse.click();
      await button("添加为新函数").click();
      assert.equal(await page.locator(".function-item").count(), 4);
      await button("分析").click();
      const analysisFits = await page
        .locator(".analysis-options")
        .evaluate((el) => {
          const body = el
            .closest(".function-action-body")
            .getBoundingClientRect();
          return [...el.querySelectorAll("button")].every((button) => {
            const box = button.getBoundingClientRect();
            return box.top >= body.top && box.bottom <= body.bottom + 1;
          });
        });
      assert.ok(
        analysisFits,
        `${width} common analysis tools fit without scrolling`,
      );
      await button("零点").click();
      await page.locator(".analysis-result").waitFor();
      await button("设置").click();
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".settings-popover").count(), 0);
      assert.equal(
        await page.locator(".analysis-result").count(),
        1,
        "Escape dismisses only the top layer",
      );
      await collapse.click();
      await button("搜索工具").click();
      const search = page.getByRole("combobox", { name: "搜索工具名称" });
      await search.fill("找不到的工具");
      assert.ok(await page.locator(".command-empty").isVisible());
      await search.fill("奇偶");
      await search.press("ArrowDown");
      await search.press("Enter");
      await page.waitForTimeout(100);
      if (!(await page.locator(".analysis-result").count())) {
        console.log(
          "Search state",
          width,
          await page.locator(".function-actions").innerText(),
          await page.evaluate(() => window.history.state),
        );
        await page.screenshot({
          path: ".runtime/workbench-search-failure.png",
        });
      }
      assert.match(
        await page.locator(".analysis-result").innerText(),
        /偶函数/,
      );
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /打开数学键盘/ }).click();
      await button("7").click();
      assert.equal(
        await page.getByLabel("输入表达式", { exact: true }).inputValue(),
        "7",
      );
      const keyboard = await page.locator(".math-input-area").boundingBox();
      assert.ok(
        keyboard.x >= 0 &&
          keyboard.y >= 0 &&
          keyboard.x + keyboard.width <= width + 1 &&
          keyboard.y + keyboard.height <= height + 1,
        `${width} keyboard fits`,
      );
      await button("收起数学键盘").click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${width} final overflow`,
      );
      await page.screenshot({
        path: `.runtime/workbench-${width}x${height}.png`,
      });
      await context.close();
    }
    const page = await browser.newPage({
      viewport: { width: 1366, height: 900 },
    });
    page.on("pageerror", (error) => errors.push(error.message));
    const button = (name) => page.getByRole("button", { name, exact: true });
    await page.goto(url);
    const library = await page.evaluate(() =>
      localStorage.getItem("function-lab-v1"),
    );
    await button("放大").click();
    await button("分析").click();
    await button("零点").click();
    await button("设置").click();
    await page.getByText("网格", { exact: true }).first().click();
    await button("关闭").click();
    await page.waitForTimeout(400);
    const before = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("function-lab-workspace-v1")),
    );
    assert.ok(before.points.length > 0);
    assert.equal(before.grid, false);
    await page.reload();
    await page.locator("canvas").waitFor();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("function-lab-workspace-v1")),
    );
    assert.deepEqual(after, before, "reload restores the complete workspace");
    const normalizeLibrary = (raw) =>
      JSON.parse(raw).map((fn) => ({
        ...fn,
        bindings: fn.bindings || {},
        liveBindings: fn.liveBindings || {},
      }));
    assert.deepEqual(
      normalizeLibrary(
        await page.evaluate(() => localStorage.getItem("function-lab-v1")),
      ),
      normalizeLibrary(library),
      "workspace changes preserve the function library",
    );

    // Symbolic derivatives must not depend on whether the last tangent point is differentiable.
    await page.locator(".function-edit").first().click();
    const input = page.getByLabel("输入表达式", { exact: true });
    await input.fill("abs(x)");
    await input.press("Enter");
    await button("更多").click();
    await button("切线与法线").click();
    await page.getByLabel("切点横坐标", { exact: true }).fill("0");
    await button("更多").click();
    await button("求导").click();
    await button("添加为新函数").click();
    assert.equal(
      await page.locator(".function-item").count(),
      4,
      "derivative of abs(x) is generated away from its corner",
    );

    await button("设置").click();
    const downloadEvent = page.waitForEvent("download");
    await button("导出项目").click();
    const download = await downloadEvent;
    const exportPath = ".runtime/workbench-export.json";
    await download.saveAs(exportPath);
    const fs = require("node:fs");
    const exported = JSON.parse(fs.readFileSync(exportPath, "utf8"));
    assert.equal(exported.functions.length, 4);
    await page.locator('input[type="file"]').setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1,"functions":[{}]}'),
    });
    await page.waitForTimeout(200);
    assert.equal(
      await page.locator(".function-item").count(),
      4,
      "invalid imports preserve existing functions",
    );
    await button("设置").click();
    await page.locator('input[type="file"]').setInputFiles(exportPath);
    await page.waitForTimeout(200);
    assert.equal(
      await page.locator(".function-item").count(),
      4,
      "exported experiments remain importable",
    );
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      "workbench checks passed: 9 screen sizes, unobstructed controls, keyboard/search, layered Escape, persistence, derivative, import/export",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
