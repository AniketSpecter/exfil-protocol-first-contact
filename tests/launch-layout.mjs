import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--disable-gpu"],
  }),
  report = { checks: [], errors: [] };
const pass = (s) => {
  report.checks.push(s);
  console.log("PASS", s);
};
async function reachable(page, selector, scroll = false) {
  const el = page.locator(selector);
  if (scroll) await el.scrollIntoViewIfNeeded();
  const a = await el.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      x: r.x,
      y: r.y,
      right: r.right,
      bottom: r.bottom,
      hit: el === top || el.contains(top),
    };
  });
  assert.ok(
    a.x >= 0 &&
      a.y >= 0 &&
      a.right <= page.viewportSize().width + 0.5 &&
      a.bottom <= page.viewportSize().height + 0.5 &&
      a.hit,
    selector + " reachable " + JSON.stringify(a),
  );
}
try {
  for (const [w, h, touch] of [
    [1898, 939, false],
    [1280, 720, false],
    [800, 360, false],
    [800, 360, true],
    [667, 375, true],
    [844, 390, true],
    [390, 844, true],
  ]) {
    const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        hasTouch: touch,
        isMobile: touch,
      }),
      p = await ctx.newPage();
    p.on("pageerror", (e) => report.errors.push(e.stack));
    await p.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1&renderer=canvas');
    await p.locator(".title-enter").click();
    await p.locator(".official-logo").evaluate((im) => im.decode());
    assert.equal(
      await p
        .locator(".menu")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
      "No horizontal overflow",
    );
    for (const id of [
      "new-operation",
      "mission-select",
      "controls-menu",
      "settings-menu",
      "credits",
    ])
      await reachable(p, "#" + id, w < h);
    const projection = await p.locator(".menu-map svg").evaluate((svg) => {
      const image = svg.querySelector("image"),
        pin = svg.querySelector("circle");
      return {
        view: svg.getAttribute("viewBox"),
        aligned: ["a", "b", "c", "d", "e", "f"].every(
          (k) => image.getCTM()[k] === pin.getCTM()[k],
        ),
        images: svg.querySelectorAll("image").length,
      };
    });
    assert.ok(projection.aligned);
    assert.equal(projection.images, 1);
    assert.equal(projection.view, "240 120 1640 1340");
    if (w < h) await p.locator("#new-operation").scrollIntoViewIfNeeded();
    await p.screenshot({ path: `qa/launch-menu-${w}-${h}-${touch}.png` });
    pass(`Menu, map and navigation reachable at ${w}x${h} touch=${touch}`);
    await p.locator("#credits").click();
    assert.equal(await p.locator(".credit-section").count(), 4);
    assert.ok(
      await p
        .locator(".credits")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    );
    await reachable(p, "#credits-back", true);
    await reachable(p, "#reset-progress", true);
    await p.locator("#reset-progress").click();
    await p.locator("#cancel-reset").click();
    assert.equal(await p.locator("#reset-confirm").isVisible(), false);
    await p.screenshot({ path: `qa/launch-credits-${w}-${h}-${touch}.png` });
    await p.locator("#credits-back").click();
    pass(
      `Credits sections, safe reset cancellation and back navigation at ${w}x${h}`,
    );
    await ctx.close();
  }
  // Device emulation can be enabled after the page is already loaded.
  const ctx = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    }),
    p = await ctx.newPage();
  await p.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1&renderer=canvas');
  await p.locator(".title-enter").click();
  assert.equal(await p.evaluate(() => window.__EXFIL__.ui.touchMode), false);
  await p.locator("#new-operation").click();
  await p.locator("#play").click();
  assert.equal(await p.locator("#move-stick").count(), 0);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 400, y: 185 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await p.locator("#move-stick").waitFor();
  assert.equal(await p.evaluate(() => window.__EXFIL__.ui.touchMode), true);
  await reachable(p, "#move-stick");
  pass(
    "First touch after desktop load enables gameplay sticks without reloading",
  );
  await ctx.close();
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.errors.push(e.stack);
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync(
    "qa/launch-layout-report.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
