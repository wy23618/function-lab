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
    for (const [width, height, rotated] of [
      [1440, 900, false],
      [768, 1024, false],
      [390, 844, false],
      [320, 640, false],
      [844, 390, false],
      [390, 844, true],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        isMobile: width < 1000,
        hasTouch: width < 1000,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      if (rotated)
        await page.addInitScript(() => {
          Object.defineProperty(window.screen.orientation, "lock", {
            configurable: true,
            value: undefined,
          });
        });
      await page.goto(url);
      await page.locator("canvas").waitFor();
      const button = (name) => page.getByRole("button", { name, exact: true });
      const view = async () => {
        await page.waitForTimeout(700);
        return page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("function-lab-workspace-v1"))
              .viewport,
        );
      };
      const assertSurface = async (fullscreen) => {
        await page.waitForTimeout(200);
        const measured = await page.evaluate(() => {
          const canvas = document.querySelector("canvas");
          const panel = document
            .querySelector(".graph-panel")
            .getBoundingClientRect();
          return {
            width: panel.width,
            height: panel.height,
            windowWidth: innerWidth,
            windowHeight: window.innerHeight,
            pixelWidth: canvas.width,
            pixelHeight: canvas.height,
            cssWidth: canvas.clientWidth,
            cssHeight: canvas.clientHeight,
            ratio: window.devicePixelRatio,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
          };
        });
        assert.ok(
          Math.abs(measured.pixelWidth / measured.ratio - measured.cssWidth) <=
            1,
          "canvas width stays sharp",
        );
        assert.ok(
          Math.abs(
            measured.pixelHeight / measured.ratio - measured.cssHeight,
          ) <= 1,
          "canvas height stays sharp",
        );
        assert.equal(measured.overflow, false, "no page overflow");
        if (fullscreen) {
          assert.ok(
            Math.abs(measured.width - measured.windowWidth) <= 1,
            "fullscreen fills width",
          );
          assert.ok(
            Math.abs(measured.height - measured.windowHeight) <= 1,
            "fullscreen fills height",
          );
        }
      };
      if (rotated) {
        await button("横屏看图").click();
        await page.locator(".manual-landscape").waitFor();
      }
      const original = await view();
      for (let cycle = 0; cycle < 2; cycle++) {
        await button("全屏").click();
        await page.waitForFunction(() => !!document.fullscreenElement);
        await assertSurface(true);
        assert.deepEqual(
          await view(),
          original,
          "entering fullscreen preserves the camera",
        );
        await button("退出全屏").click();
        await page.waitForFunction(() => !document.fullscreenElement);
        assert.deepEqual(
          await view(),
          original,
          "exiting fullscreen preserves the camera",
        );
      }
      await button("全屏").click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await button("适应视图").click();
      const fitted = await view();
      assert.ok(fitted.scale > 20, "fit keeps coordinate values readable");
      assert.ok(
        Math.abs(fitted.cy) < 10,
        "fit does not send the origin far away",
      );
      await button("退出全屏").click();
      await page.waitForFunction(() => !document.fullscreenElement);
      assert.deepEqual(
        await view(),
        fitted,
        "fit then fullscreen exit does not shift the camera",
      );
      await button("适应视图").click();
      const normalFit = await view();
      assert.ok(normalFit.scale > 20);
      assert.ok(Math.abs(normalFit.cy) < 10);
      await button("复位").click();
      assert.deepEqual(await view(), original);
      await assertSurface(false);
      assert.deepEqual(errors, []);
      console.log(
        `${width}×${height}${rotated ? " rotated" : ""}: fullscreen, fit, exit and reset passed`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
