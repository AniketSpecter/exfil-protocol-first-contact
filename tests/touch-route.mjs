import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const live = process.env.EXFIL_LIVE_QA === "1";
const browser = await chromium.launch({
  channel: "chrome",
  headless: !live,
  args: [
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-features=CalculateNativeWinOcclusion",
  ],
});
const context = await browser.newContext({
    viewport: { width: 800, height: 360 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  }),
  page = await context.newPage(),
  cdp = await context.newCDPSession(page);
const report = {
  checks: [],
  errors: [],
  scope:
    "Complete Mission 01 and Mission 02 using CDP touch controls, live guards and read-only route/state inspection. No actor repositioning, invulnerability, enemy removal or save edits.",
};
page.on("pageerror", (e) => report.errors.push(e.stack));
page.on("response", (r) => {
  if (r.status() >= 400) report.errors.push(r.status() + " " + r.url());
});
const pass = (s) => {
  report.checks.push(s);
  console.log("PASS", s);
};
const state = () => page.evaluate(() => window.__EXFIL__.scene.snapshot());
const touch = (type, points) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p, i) => ({
      ...p,
      id: i,
      radiusX: 7,
      radiusY: 7,
      force: 1,
    })),
  });
async function drive(target) {
  const path = await page.evaluate(async (target) => {
    const g = await import("/src/systems/geometry.js");
    window.__touchGeometry = g;
    return [...g.findPath(window.__EXFIL__.scene.player, target), target];
  }, target);
  assert.ok(path.length > 1);
  const points = path.filter(
    (p, i) =>
      !i ||
      i === path.length - 1 ||
      Math.sign(p.x - path[i - 1].x) !== Math.sign(path[i + 1].x - p.x) ||
      Math.sign(p.y - path[i - 1].y) !== Math.sign(path[i + 1].y - p.y),
  );
  const sticks = await page.locator(".touch-stick").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  let active = false,
    ticks = 0;
  for (const point of points) {
    let stuck = 0,
      last;
    while (ticks++ < 1800) {
      const a = await page.evaluate(() => {
        const s = window.__EXFIL__.scene,
          p = s.player,
          g = window.__touchGeometry,
          e = s.enemies
            .filter(
              (e) => e.hp > 0 && g.clearSight(p, e) && g.distance(p, e) < 350,
            )
            .sort((a, b) => g.distance(p, a) - g.distance(p, b))[0];
        return {
          x: p.x,
          y: p.y,
          hp: p.hp,
          done: s.done,
          paused: !!document.querySelector("#pause-modal"),
          enemy: e ? { x: e.x, y: e.y } : null,
        };
      });
      if (a.paused) {
        if (active) await touch("touchEnd", []);
        active = false;
        await page.locator("#resume").tap();
        continue;
      }
      assert.ok(a.hp > 0 && !a.done, "Alive on real touch route");
      const dx = point.x - a.x,
        dy = point.y - a.y,
        d = Math.hypot(dx, dy);
      if (d < 12) break;
      const moving = !a.enemy,
        angle = a.enemy ? Math.atan2(a.enemy.y - a.y, a.enemy.x - a.x) : 0;
      const gesture = [
        {
          x: sticks[0].x + (moving ? (dx / d) * 30 : 0),
          y: sticks[0].y + (moving ? (dy / d) * 30 : 0),
        },
        {
          x: sticks[1].x + (a.enemy ? Math.cos(angle) * 30 : 0),
          y: sticks[1].y + (a.enemy ? Math.sin(angle) * 30 : 0),
        },
      ];
      if (!active) {
        await touch("touchStart", sticks);
        active = true;
      }
      await touch("touchMove", gesture);
      if (last && moving && Math.hypot(a.x - last.x, a.y - last.y) < 0.15)
        stuck++;
      else stuck = 0;
      if (stuck > 35)
        throw Error("Touch route stuck " + JSON.stringify({ a, point }));
      last = a;
      await page.waitForTimeout(90);
    }
  }
  if (active) await touch("touchEnd", []);
  const end = await state();
  assert.ok(
    Math.hypot(end.player.x - target.x, end.player.y - target.y) < 32,
    "Reached objective through touch only",
  );
}
try {
  await page.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1&renderer=canvas');
  await page.locator(".title-enter").tap();
  await page.locator("#new-operation").tap();
  await page.locator("#play").tap();
  await page.locator("#move-stick").waitFor();
  await drive({ x: 475, y: 1020 });
  await page.locator("#touch-interact").tap();
  await page.waitForFunction(() => window.__EXFIL__.scene.player.medkits === 1);
  assert.equal((await state()).player.medkits, 1);
  pass("Touch movement/combat reaches optional medical cache with live guards");
  await drive({ x: 995, y: 770 });
  await page.locator("#touch-interact").tap();
  await page.waitForFunction(() =>
    window.__EXFIL__.scene.raid.carried.includes("manifest"),
  );
  await page.screenshot({ path: "qa/touch-route-manifest.png" });
  pass("Touch-only route reaches and collects the manifest");
  await drive({ x: 490, y: 1360 });
  await page.locator("#touch-interact").tap();
  await page
    .getByText("OPERATOR EXTRACTED", { exact: true })
    .waitFor({ timeout: 20000 });
  report.mission01 = await state();
  pass("Full touch Mission 01 extracts and unlocks Mission 02");
  await page.locator("#replay").tap();
  await page.locator("[data-mode=squad]").tap();
  await page.locator("#play").tap();
  await drive({ x: 490, y: 1360 });
  await page.locator("#touch-interact").tap();
  await page.locator("#sail").tap();
  await page.waitForFunction(
    () =>
      window.__EXFIL__.scene.sector === "ridge" &&
      !window.__EXFIL__.scene.transit,
  );
  await drive({ x: 1770, y: 935 });
  await page.locator("#touch-interact").tap();
  await page.waitForFunction(() => window.__EXFIL__.scene.surveillanceOff);
  assert.ok(await page.evaluate(() => window.__EXFIL__.scene.surveillanceOff));
  await drive({ x: 1595, y: 1005 });
  await page.locator("#touch-interact").tap();
  await page.waitForFunction(() =>
    window.__EXFIL__.scene.raid.carried.includes("radioLogs"),
  );
  pass(
    "Touch-only boat/ridge route disables surveillance and recovers radio logs",
  );
  const r = await page.locator("#touch-transmit").boundingBox();
  await touch("touchStart", [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }]);
  await page.waitForFunction(
    () => window.__EXFIL__.scene.raid.transmitted.includes("radioLogs"),
    null,
    { timeout: 15000 },
  );
  await touch("touchEnd", []);
  await drive({ x: 1280, y: 1132 });
  await page.locator("#touch-interact").tap();
  await page.locator("#sail").tap();
  await page.waitForFunction(
    () =>
      window.__EXFIL__.scene.sector === "coast" &&
      !window.__EXFIL__.scene.transit,
  );
  await drive({ x: 490, y: 1360 });
  await page.locator("#touch-interact").tap();
  await page.locator("#safehouse").tap();
  await page
    .getByText("OPERATOR EXTRACTED", { exact: true })
    .waitFor({ timeout: 20000 });
  report.mission02 = await state();
  pass("Full touch Mission 02 uplinks, returns by boat and extracts");
  await page.screenshot({ path: "qa/touch-route-results.png" });
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.errors.push(e.stack);
  console.error(e);
  await page.screenshot({ path: "qa/touch-route-failure.png" });
  process.exitCode = 1;
} finally {
  writeFileSync("qa/touch-route-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
