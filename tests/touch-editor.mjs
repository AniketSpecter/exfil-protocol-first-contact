import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--disable-gpu"],
  }),
  ctx = await browser.newContext({
    viewport: { width: 800, height: 360 },
    hasTouch: true,
    isMobile: true,
  }),
  p = await ctx.newPage(),
  cdp = await ctx.newCDPSession(p),
  report = { checks: [], errors: [] };
p.on("pageerror", (e) => report.errors.push(e.stack));
const pass = (s) => {
  report.checks.push(s);
  console.log("PASS", s);
};
const center = async (selector) => {
  const r = await p.locator(selector).boundingBox();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
async function drag(selector, to) {
  const from = await center(selector);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [from],
  });
  for (let n = 1; n <= 6; n++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * n) / 6,
          y: from.y + ((to.y - from.y) * n) / 6,
        },
      ],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await p.waitForFunction(
    () =>
      !document.querySelector("#touch-editor").classList.contains("dragging"),
  );
}
const saved = () =>
  p.evaluate(() => JSON.parse(localStorage.getItem("exfil.touch-layout.v1")));
try {
  await p.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1&renderer=canvas');
  await p.locator(".title-enter").tap();
  await p.locator("#settings-menu").tap();
  await p.locator("#customize-touch").tap();
  assert.equal(await p.locator(".editor-control").count(), 10);
  await drag('[data-control="move-stick"]', { x: 80, y: 110 });
  await p.locator("#editor-save").tap();
  await p.locator("#touch-editor").waitFor({ state: "detached" });
  const first = await saved();
  assert.ok(Math.abs(first.positions["move-stick"].x - 0.1) < 0.02);
  pass(
    "Settings editor supports real touch dragging and saves normalized positions",
  );
  await p.locator(".utility-close").tap();
  await p.locator("#new-operation").tap();
  await p.locator("#play").tap();
  let r = await center("#move-stick");
  assert.ok(Math.abs(r.x - 80) < 2 && Math.abs(r.y - 110) < 2);
  const before = await p.evaluate(() => window.__EXFIL__.scene.player.x);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [r],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: r.x + 28, y: r.y }],
  });
  await p.waitForTimeout(350);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.ok(
    (await p.evaluate(() => window.__EXFIL__.scene.player.x)) > before + 15,
  );
  pass("Repositioned movement stick actually controls the operator");
  await p.locator("#pause-button").tap();
  const elapsed = await p.evaluate(() => window.__EXFIL__.scene.elapsed);
  await p.locator("#pause-customize").tap();
  await drag('[data-control="touch-heal"]', { x: 180, y: 100 });
  await p.waitForTimeout(350);
  assert.equal(await p.evaluate(() => window.__EXFIL__.scene.elapsed), elapsed);
  await p.locator("#editor-cancel").tap();
  assert.deepEqual(await saved(), first);
  assert.ok(await p.locator("#pause-modal").isVisible());
  pass("Pause editor freezes gameplay and Cancel preserves the saved layout");
  await p.locator("#pause-customize").tap();
  await p.locator("#editor-selected").selectOption("touch-reload");
  await p.locator("#editor-size").evaluate((el) => {
    el.value = "125";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await p.locator("#editor-opacity").evaluate((el) => {
    el.value = "60";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await p.locator("#editor-save").tap();
  await p.locator("#touch-editor").waitFor({ state: "detached" });
  assert.equal((await saved()).positions["touch-reload"].size, 1.25);
  assert.equal((await saved()).opacity, 0.6);
  await p.locator("#resume").tap();
  assert.equal(
    await p.locator("#touch-reload").evaluate((el) => el.style.opacity),
    "0.6",
  );
  pass("Per-control size and opacity apply to the real HUD");
  await p.setViewportSize({ width: 1024, height: 768 });
  r = await center("#move-stick");
  assert.ok(Math.abs(r.x - 102.4) < 2 && Math.abs(r.y - 234.67) < 2);
  pass("Saved control positions adapt to another landscape screen size");
  await p.reload();
  await p.locator(".title-enter").tap();
  await p.locator("#new-operation").tap();
  await p.locator("#play").tap();
  r = await center("#move-stick");
  assert.ok(Math.abs(r.x - 102.4) < 2);
  pass("Reload retains customized controls");
  await p.locator("#pause-button").tap();
  await p.locator("#pause-customize").tap();
  await p.locator("#editor-reset").tap();
  await p.locator("#editor-save").tap();
  await p.locator("#touch-editor").waitFor({ state: "detached" });
  await p.locator("#resume").tap();
  assert.deepEqual((await saved()).positions, {});
  assert.equal(
    await p.locator("#move-stick").evaluate((el) => el.style.left),
    "",
  );
  pass("Restore defaults removes custom geometry and returns the standard HUD");
  await p.screenshot({ path: "qa/touch-editor-restored.png" });
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.errors.push(e.stack);
  console.error(e);
  await p.screenshot({ path: "qa/touch-editor-failure.png" });
  process.exitCode = 1;
} finally {
  writeFileSync("qa/touch-editor-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
