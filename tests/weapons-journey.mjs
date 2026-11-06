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
  report = {
    checks: [],
    errors: [],
    scope:
      "Focused weapon and journey fixtures; not a replacement for the full actual-input campaign routes.",
  };
p.on("pageerror", (e) => report.errors.push(e.stack));
const pass = (s) => {
  report.checks.push(s);
  console.log("PASS", s);
};
const state = () => p.evaluate(() => window.__EXFIL__.scene.snapshot());
const touch = (type, points) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
const center = async (id) => {
  const r = await p.locator("#" + id).boundingBox();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
async function slot(name) {
  await p.locator("#weapon-switch").tap();
  await p.getByRole("button", { name: "Equip " + name, exact: true }).tap();
}
async function fire(ms) {
  const c = await center("aim-stick");
  await touch("touchStart", [c]);
  await touch("touchMove", [{ x: c.x + 28, y: c.y }]);
  await p.waitForTimeout(ms);
  await touch("touchEnd", []);
}
try {
  await p.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1&renderer=canvas');
  await p.locator(".title-enter").tap();
  await p.locator("#new-operation").tap();
  await p.locator("#play").tap();
  await p.evaluate(() => {
    const s = window.__EXFIL__.scene;
    s.enemies.slice(1).forEach((e) => {
      e.hp = 0;
      e.sprite.setAlpha(0.1);
      e.label.setVisible(false);
    });
    const e = s.enemies[0];
    e.x = s.player.x + 38;
    e.y = s.player.y;
    e.hp = 60;
  });
  await fire(450);
  await p.waitForFunction(
    () => window.__EXFIL__.scene.droppedWeapons.length === 1,
  );
  assert.equal((await state()).drops[0].weapon, "ak47");
  const kills = (await state()).raid.kills;
  await p.evaluate(() => window.__EXFIL__.scene.enemies[0].damage(200));
  assert.equal((await state()).raid.kills, kills);
  assert.equal((await state()).drops.length, 1);
  pass("Real touch fire kills a bot; its carried weapon drops exactly once");
  await p.locator("#touch-interact").tap();
  await p.waitForFunction(
    () => window.__EXFIL__.scene.player.weapon === "ak47",
  );
  let s = await state();
  assert.equal(s.player.slots.primary, "ak47");
  assert.equal(s.player.ammo, 18);
  assert.ok(s.drops.some((d) => d.weapon === "m4" && !d.collected));
  assert.equal(s.player.slots.secondary, "usp");
  assert.equal(s.player.slots.knife, "knife");
  pass(
    "Pickup replaces only the primary slot, keeps dropped ammo and leaves the old gun on the ground",
  );
  async function tapDrop(weapon) {
    const point = await p.evaluate((weapon) => {
      const s = window.__EXFIL__.scene,
        d = s.droppedWeapons.find((d) => !d.collected && d.weapon === weapon),
        c = s.cameras.main;
      return {
        x: (d.x - c.worldView.x) * c.zoom,
        y: (d.y - c.worldView.y) * c.zoom,
      };
    }, weapon);
    await p.touchscreen.tap(point.x, point.y);
    await p.waitForFunction(
      (weapon) => window.__EXFIL__.scene.player.weapon === weapon,
      weapon,
    );
  }
  await tapDrop("m4");
  await tapDrop("ak47");
  assert.equal((await state()).player.ammo, 18);
  pass(
    "Nearby ground weapons can also be tapped directly without firing or blocking dock actions",
  );
  await slot("secondary");
  assert.equal((await state()).player.weapon, "usp");
  await slot("primary");
  assert.equal((await state()).player.weapon, "ak47");
  await slot("knife");
  assert.equal((await state()).player.weapon, "knife");
  pass("Phone slot selector equips primary, secondary and knife");
  async function distanceFor(slotName) {
    await slot(slotName);
    await p.evaluate(() => {
      const s = window.__EXFIL__.scene;
      s.player.x = 570;
      s.player.y = 1215;
    });
    const c = await center("move-stick");
    await touch("touchStart", [c]);
    await touch("touchMove", [{ x: c.x + 28, y: c.y }]);
    await p.waitForTimeout(500);
    await touch("touchEnd", []);
    return (await state()).player.x - 570;
  }
  const gunDistance = await distanceFor("primary"),
    knifeDistance = await distanceFor("knife");
  assert.ok(knifeDistance > gunDistance * 1.1);
  report.speed = { gunDistance, knifeDistance };
  pass("Actual joystick movement is faster with the knife equipped");
  await p.evaluate(() => {
    const s = window.__EXFIL__.scene,
      e = s.enemies[1];
    e.hp = 100;
    e.x = s.player.x + 40;
    e.y = s.player.y;
    e.state = "PATROL";
    e.sprite.setAlpha(1);
  });
  await fire(1100);
  assert.equal(await p.evaluate(() => window.__EXFIL__.scene.enemies[1].hp), 0);
  assert.equal((await state()).player.ammo, 0);
  pass("Knife slashes damage an enemy at melee range without consuming ammo");
  await p.screenshot({ path: "qa/three-slots.png" });
  // Travel fixture starts at the actual coast dock, with a non-default loadout.
  await p.locator("#pause-button").tap();
  await p.locator("#abandon").tap();
  await p.evaluate(() => {
    const a = window.__EXFIL__;
    a.progression.data.completedMissions = ["landing"];
    a.ui.selectedMission = "frequency";
    a.ui.showBriefing();
  });
  await p.locator("#play").tap();
  await p.evaluate(() => {
    const s = window.__EXFIL__.scene;
    s.player.x = 490;
    s.player.y = 1360;
    s.player.slots.primary = "ak47";
    s.loadout.ak47 = { ammo: 17, reserve: 39 };
    s.switchWeapon("primary");
    s.player.hp = 71;
  });
  await p.locator("#touch-interact").tap();
  await p.locator("#sail").tap();
  await p.locator("#journey-boat").waitFor();
  const initial = await p.locator("#journey-boat").getAttribute("transform");
  await p.waitForTimeout(600);
  assert.notEqual(
    await p.locator("#journey-boat").getAttribute("transform"),
    initial,
  );
  await p.screenshot({ path: "qa/animated-boat-journey.png" });
  await p.locator("#journey-pause").tap();
  const elapsed = (await state()).transit.elapsed;
  await p.waitForTimeout(350);
  assert.equal((await state()).transit.elapsed, elapsed);
  await p.locator("#resume").tap();
  await p.waitForFunction(
    () =>
      window.__EXFIL__.scene.sector === "ridge" &&
      !window.__EXFIL__.scene.transit,
  );
  assert.equal(await p.locator("#transit-panel").count(), 0);
  s = await state();
  assert.equal(s.player.slots.primary, "ak47");
  assert.equal(s.player.ammo, 17);
  assert.equal(s.player.reserve, 39);
  assert.equal(s.player.hp, 71);
  pass(
    "Boat visibly travels, pauses/resumes and preserves the three-slot loadout",
  );
  const c = await center("move-stick"),
    before = s.player.x;
  await touch("touchStart", [c]);
  await touch("touchMove", [{ x: c.x + 28, y: c.y }]);
  await p.waitForTimeout(300);
  await touch("touchEnd", []);
  assert.ok((await state()).player.x > before + 10);
  pass("Immediate touch movement after boat arrival is accepted");
  const desktop = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    }),
    q = await desktop.newPage();
  await q.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1&renderer=canvas');
  await q.locator(".title-enter").click();
  await q.locator("#new-operation").click();
  await q.locator("#play").click();
  await q.keyboard.press("3", { delay: 100 });
  assert.equal(
    await q.evaluate(() => window.__EXFIL__.scene.player.weapon),
    "knife",
  );
  await q.keyboard.press("q", { delay: 100 });
  assert.equal(
    await q.evaluate(() => window.__EXFIL__.scene.player.weapon),
    "m4",
  );
  await q.keyboard.press("q", { delay: 100 });
  assert.equal(
    await q.evaluate(() => window.__EXFIL__.scene.player.weapon),
    "knife",
  );
  pass("PC slot 3 and Q quick-switch alternate the last two equipped weapons");
  await desktop.close();
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.errors.push(e.stack);
  console.error(e);
  await p.screenshot({ path: "qa/weapons-journey-failure.png" });
  process.exitCode = 1;
} finally {
  writeFileSync(
    "qa/weapons-journey-report.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
