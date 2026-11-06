import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--disable-gpu"],
  }),
  report = {
    checks: [],
    errors: [],
    scope:
      "Responsive screen fixtures. Gameplay routes are covered separately.",
  };
async function action(p, id) {
  const r = await p.locator(id).evaluate((el) => {
    const r = el.getBoundingClientRect(),
      t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      x: r.x,
      y: r.y,
      right: r.right,
      bottom: r.bottom,
      hit: t === el || el.contains(t),
    };
  });
  const v = p.viewportSize();
  assert.ok(
    r.x >= 0 &&
      r.y >= 0 &&
      r.right <= v.width + 0.5 &&
      r.bottom <= v.height + 0.5 &&
      r.hit,
    id + " initially visible " + JSON.stringify(r),
  );
}
async function fits(p, selector, label) {
  assert.ok(
    await p
      .locator(selector)
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    label + " no horizontal overflow",
  );
  report.checks.push(label);
}
try {
  for (const [width, height] of [
    [360, 800],
    [800, 360],
    [667, 375],
    [1024, 768],
  ]) {
    const ctx = await browser.newContext({
        viewport: { width, height },
        hasTouch: true,
        isMobile: true,
      }),
      p = await ctx.newPage();
    p.on("pageerror", (e) => report.errors.push(e.stack));
    await p.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1&renderer=canvas');
    await p.locator(".title-enter").tap();
    await p.locator("#credits").tap();
    await action(p, "#credits-back");
    await action(p, "#reset-progress");
    await fits(p, ".credits", `Credits ${width}x${height}`);
    assert.ok(
      await p
        .locator(".credit-section p")
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 13),
    );
    await p.locator("#reset-progress").tap();
    await p.locator("#cancel-reset").tap();
    await p.screenshot({ path: `qa/responsive-credits-${width}.png` });
    await p.locator("#credits-back").tap();
    await p.locator("#mission-select").tap();
    await action(p, "#operations-back");
    await fits(p, ".operations", `Mission selection ${width}x${height}`);
    await p.locator("#operations-back").tap();
    await p.locator("#settings-menu").tap();
    await action(p, ".utility-close");
    await fits(p, ".pause-panel", `Settings ${width}x${height}`);
    await p.locator(".utility-close").tap();
    await p.locator("#new-operation").tap();
    await action(p, "#play");
    await action(p, "#back");
    await fits(p, ".briefing", `Briefing ${width}x${height}`);
    await p.locator("#play").tap();
    await p.waitForFunction(() => window.__EXFIL__.scene.player);
    await p.evaluate(() => window.__EXFIL__.scene.finish(true));
    await action(p, "#replay");
    await action(p, "#menu");
    await fits(p, ".results", `Results ${width}x${height}`);
    await p.screenshot({ path: `qa/responsive-results-${width}.png` });
    await ctx.close();
    console.log("PASS screen set", width, height);
  }
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.errors.push(e.stack);
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync("qa/mobile-pages-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
