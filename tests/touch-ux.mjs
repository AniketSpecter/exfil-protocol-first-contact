import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--disable-gpu"],
  }),
  context = await browser.newContext({
    viewport: { width: 800, height: 360 },
    hasTouch: true,
    isMobile: true,
  }),
  p = await context.newPage(),
  cdp = await context.newCDPSession(p),
  report = { checks: [], errors: [] };
p.on("pageerror", (e) => report.errors.push(e.stack));
const pass = (s) => {
  report.checks.push(s);
  console.log("PASS", s);
};
async function touchOnly() {
  const keys = await p.locator(".controls-grid kbd:visible").allTextContents();
  assert.ok(keys.length);
  assert.ok(
    keys.every(
      (k) =>
        ![
          "WASD",
          "W A S D",
          "MOUSE",
          "E",
          "R",
          "H",
          "M",
          "SHIFT",
          "HOLD T",
          "HOLD E",
          "M / ESC",
          "1 / 2",
        ].includes(k),
    ),
    JSON.stringify(keys),
  );
}
try {
  await p.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1&renderer=canvas');
  await p.locator(".title-screen img").evaluate((im) => im.decode());
  await p.screenshot({ path: "qa/touch-title-800.png" });
  assert.ok(await p.locator(".title-touch-prompt").isVisible());
  await p.locator(".title-enter").tap();
  await p.locator("#controls-menu").tap();
  await touchOnly();
  await p.locator(".utility-close").tap();
  await p.locator("#credits").tap();
  assert.ok(await p.getByText("Aniket [UGZ]", { exact: true }).isVisible());
  await p.locator("#credits-back").tap();
  await p.locator("#new-operation").tap();
  await touchOnly();
  assert.equal(
    await p
      .locator(".steps")
      .innerText()
      .then((t) => /Hold T\b(?!X)/.test(t)),
    false,
  );
  pass(
    "Touch title, field manual and briefing have touch instructions; creator is Aniket [UGZ]",
  );
  await p.locator("#play").tap();
  assert.equal(await p.locator("#touch-interact").innerText(), "USE\nINTERACT");
  assert.equal(await p.locator("#touch-map").innerText(), "MAP\nOVERVIEW");
  await p.locator("#touch-map").tap();
  await p.locator("#pause-button").tap();
  await p.locator("#pause-controls").tap();
  await touchOnly();
  await p.locator(".utility-close").tap();
  await p.locator("#resume").tap();
  assert.ok(await p.locator("#map-overlay").isVisible());
  await p.locator("#touch-map").tap();
  assert.equal(await p.locator("#map-overlay").isVisible(), false);
  pass("Pause/resume preserves map visibility and uses touch instructions");
  const r = await p.locator("#move-stick").boundingBox(),
    x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 26, y }],
  });
  await p.waitForTimeout(150);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  assert.equal(await p.evaluate(() => window.__EXFIL__.scene.touch.moveX), 0);
  pass("Cancelled touch releases the movement stick");
  // Fixture isolates inventory/button behavior from route combat; full touch routes are a separate test.
  await p.evaluate(() => {
    const s = window.__EXFIL__.scene;
    s.player.hp = 50;
    s.player.medkits = 1;
  });
  await p.locator("#touch-heal").tap();
  assert.equal(
    await p.evaluate(() => window.__EXFIL__.scene.player.medkits),
    0,
  );
  assert.ok(await p.evaluate(() => window.__EXFIL__.scene.player.hp > 50));
  pass("Visible medkit button consumes one carried kit and heals");
  await p.setViewportSize({ width: 360, height: 800 });
  await p.locator("#pause-modal").waitFor();
  const before = await p.evaluate(() => window.__EXFIL__.scene.elapsed);
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => window.__EXFIL__.scene.elapsed), before);
  assert.ok(await p.locator(".orientation-hint").isVisible());
  await p.setViewportSize({ width: 800, height: 360 });
  await p.locator("#resume").tap();
  pass("Rotation pauses gameplay; landscape resume works");
  await p.locator("#pause-button").tap();
  await p.locator("#abandon").tap();
  await p.setViewportSize({ width: 360, height: 800 });
  await p.locator("#new-operation").tap();
  await p.locator("#play").tap();
  await p.locator("#pause-modal").waitFor();
  pass(
    "Starting a raid in portrait pauses immediately behind rotation guidance",
  );
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.errors.push(e.stack);
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync("qa/touch-ux-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
