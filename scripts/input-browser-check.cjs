const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  fs.mkdirSync(".runtime/test-results", { recursive: true });
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
  const add = async (text) => {
    await page.locator("#function-input").fill(text);
    await page.locator("#function-input").press("Enter");
  };
  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("function-lab-v1")));
  await add("sinx");
  assert.equal((await stored()).at(-1).currentExpression, "sin(x)");
  passed.push("compact sinx");
  await add("u(t)=m*t+n");
  let data = await stored();
  assert.equal(data.at(-1).variable, "t");
  assert.deepEqual(data.at(-1).parameters, { m: 1, n: 1 });
  await page.getByLabel("参数 m", { exact: true }).fill("3");
  await page.getByLabel("参数 n", { exact: true }).fill("2");
  data = await stored();
  assert.deepEqual(data.at(-1).parameters, { m: 3, n: 2 });
  passed.push("t variable with adjustable m and n");
  await page.getByRole("button", { name: "生成平移函数", exact: true }).click();
  assert.equal((await stored()).at(-1).variable, "t");
  passed.push("transforms retain variable and parameters");
  await add("v(m)=sin(m^2)");
  assert.equal((await stored()).at(-1).variable, "m");
  passed.push("nested built-in composition and arbitrary variable");
  await add("w(t)=u(v(t))");
  data = await stored();
  assert.ok(data.at(-1).bindings.u && data.at(-1).bindings.v);
  passed.push("named composite function snapshots");
  await page.getByRole("button", { name: "分析", exact: true }).click();
  await page.locator("#domain").fill("t>=0");
  await page.getByRole("button", { name: /应用定义域/ }).click();
  assert.equal((await stored()).at(-1).domain.min, 0);
  passed.push("variable-specific domain");
  await page.reload();
  assert.equal((await stored()).at(-1).bindings.u.parameters.m, 3);
  passed.push("composition survives persistence");
  await page.locator(".function-item").nth(3).click();
  await page.screenshot({ path: ".runtime/test-results/input.png", fullPage: true });
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  passed.push("mobile parameter layout without horizontal overflow");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    ".runtime/test-results/input-browser-results.json",
    JSON.stringify({ passed, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed, errors }));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
