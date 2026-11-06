import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const live = process.env.EXFIL_LIVE_QA === "1";
const browser = await chromium.launch({
  channel: "chrome",
  headless: !live,
  slowMo: live ? 40 : 0,
  args: live
    ? [
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--disable-features=CalculateNativeWinOcclusion",
      ]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
const report = {
  checks: [],
  errors: [],
  scope:
    "Two complete missions use real keyboard/mouse, live guards and no state edits. Focused recovery/failure scenarios explicitly reposition actors through the development harness.",
};
const pass = (name, detail) => {
  report.checks.push({ name, detail });
  console.log("PASS", name, detail || "");
};
const state = (p) => p.evaluate(() => window.__EXFIL__.scene.snapshot());
async function setup() {
  const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.stack));
  page.on("response", (r) => {
    if (r.status() >= 400) report.errors.push(r.status() + " " + r.url());
  });
  await page.goto(
    (process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1' + (live ? "&renderer=canvas" : ""),
  );
  await page.getByRole("button", { name: "Continue to operations" }).click();
  return { page, context };
}
async function press(p, key) {
  await p.keyboard.down(key);
  await p.waitForTimeout(100);
  await p.keyboard.up(key);
}
async function drive(p, target) {
  const path = await p.evaluate(async (target) => {
    const g = await import("/src/systems/geometry.js");
    window.__testGeometry = g;
    return [...g.findPath(window.__EXFIL__.scene.player, target), target];
  }, target);
  assert.ok(path.length > 1, "Route exists");
  const points = path.filter(
    (p, i) =>
      !i ||
      i === path.length - 1 ||
      Math.sign(p.x - path[i - 1].x) !== Math.sign(path[i + 1].x - p.x) ||
      Math.sign(p.y - path[i - 1].y) !== Math.sign(path[i + 1].y - p.y),
  );
  let held = new Set(),
    ticks = 0;
  for (const point of points) {
    let stuck = 0,
      last;
    while (ticks++ < 1800) {
      const a = await p.evaluate(() => {
        const s = window.__EXFIL__.scene,
          p = s.player,
          c = s.cameras.main;
        const e = s.enemies
          .filter(
            (e) =>
              e.hp > 0 &&
              window.__testGeometry.clearSight(p, e) &&
              window.__testGeometry.distance(p, e) < 350,
          )
          .sort(
            (a, b) =>
              window.__testGeometry.distance(p, a) -
              window.__testGeometry.distance(p, b),
          )[0];
        return {
          x: p.x,
          y: p.y,
          hp: p.hp,
          done: s.done,
          paused: !!document.getElementById("pause-modal"),
          enemy: e
            ? {
                x: (e.x - c.worldView.x) * c.zoom,
                y: (e.y - c.worldView.y) * c.zoom,
              }
            : null,
        };
      });
      if (a.paused) {
        for (const k of held) await p.keyboard.up(k);
        held = new Set();
        await p.getByRole("button", { name: "RESUME OPERATION" }).click();
        continue;
      }
      assert.ok(a.hp > 0 && !a.done, "Operator alive on actual route");
      const dx = point.x - a.x,
        dy = point.y - a.y;
      if (Math.hypot(dx, dy) < 13) break;
      const next = new Set();
      if (!a.enemy) {
        if (Math.abs(dx) > 7) next.add(dx > 0 ? "d" : "a");
        if (Math.abs(dy) > 7) next.add(dy > 0 ? "s" : "w");
      }
      for (const k of held) if (!next.has(k)) await p.keyboard.up(k);
      for (const k of next) if (!held.has(k)) await p.keyboard.down(k);
      held = next;
      if (a.enemy) {
        await p.mouse.move(
          Math.max(1, Math.min(1365, a.enemy.x)),
          Math.max(1, Math.min(767, a.enemy.y)),
        );
        await p.mouse.down();
      } else await p.mouse.up();
      if (last && Math.hypot(a.x - last.x, a.y - last.y) < 0.15 && !a.enemy)
        stuck++;
      else stuck = 0;
      if (stuck > 25)
        throw Error("Route stuck: " + JSON.stringify({ a, point }));
      last = a;
      await p.waitForTimeout(90);
    }
  }
  for (const k of held) await p.keyboard.up(k);
  await p.mouse.up();
  const end = await state(p);
  assert.ok(
    Math.hypot(end.player.x - target.x, end.player.y - target.y) < 32,
    "Reached target with keyboard",
  );
}
async function focus(p, x, y) {
  await p.evaluate(
    ({ x, y }) => {
      const s = window.__EXFIL__.scene;
      Object.assign(s.player, { x, y });
      for (const e of s.enemies) {
        e.hp = 0;
        e.sprite.setAlpha(0.2);
        e.label.setVisible(false);
      }
    },
    { x, y },
  );
  await p.waitForTimeout(150);
}
async function deploy(p, mode = "solo") {
  await p.getByRole("button", { name: /NEW OPERATION|DEPLOY AGAIN/ }).click();
  if (mode === "squad") await p.locator("[data-mode=squad]").click();
  await p.getByRole("button", { name: "PLAY OPERATION" }).click();
  await p.locator("#health-value").waitFor();
}
try {
  const { page: p, context } = await setup();
  await p.getByRole("button", { name: "MISSION SELECTION" }).click();
  assert.ok(await p.locator("[data-mission=frequency]").isDisabled());
  pass("Mission 02 locked before successful Mission 01");
  await p.getByRole("button", { name: "BACK TO MENU" }).click();
  await deploy(p);
  await drive(p, { x: 475, y: 1020 });
  await press(p, "e");
  assert.equal((await state(p)).player.medkits, 1);
  pass("Optional medical objective recovered on actual route");
  await drive(p, { x: 995, y: 770 });
  await press(p, "e");
  assert.ok((await state(p)).raid.carried.includes("manifest"));
  await p.screenshot({ path: "qa/final-mission01-intel.png" });
  await drive(p, { x: 490, y: 1360 });
  await press(p, "e");
  await p
    .getByText("OPERATOR EXTRACTED", { exact: true })
    .waitFor({ timeout: 20000 });
  let result = await state(p);
  assert.ok(result.save.evidence.includes("manifest"));
  assert.ok(result.save.completedMissions.includes("landing"));
  assert.ok(result.save.signalFilter);
  assert.equal(result.raid.transmitted.length, 0);
  pass(
    "Mission 01 full carry route → rewards → scrambler and Mission 02 unlock",
    { elapsed: result.elapsed, hp: result.player.hp, xp: result.save.xp },
  );
  await p.screenshot({ path: "qa/final-mission01-results.png" });
  await p.reload();
  await p.getByRole("button", { name: "Continue to operations" }).click();
  await p.getByRole("button", { name: "MISSION SELECTION" }).click();
  assert.equal(await p.locator("[data-mission=frequency]").isDisabled(), false);
  await p.locator("[data-mission=frequency]").click();
  await p.locator("[data-mode=squad]").click();
  await p.getByRole("button", { name: "PLAY OPERATION" }).click();
  await p.waitForFunction(
    () => window.__EXFIL__.scene.mission.id === "frequency",
  );
  pass("Refresh retains unlock; Mission 02 launches with two squadmates");
  await drive(p, { x: 490, y: 1360 });
  const aboard = await state(p);
  await press(p, "e");
  await p.locator("#sail").click();
  await p.waitForFunction(
    () =>
      window.__EXFIL__.scene.sector === "ridge" &&
      !window.__EXFIL__.scene.transit,
  );
  const landed = await state(p);
  assert.equal(landed.player.hp, aboard.player.hp);
  assert.equal(landed.player.ammo, aboard.player.ammo);
  assert.equal(landed.player.reserve, aboard.player.reserve);
  assert.equal(landed.companions.filter((a) => a.hp > 0).length, 2);
  assert.ok(landed.companions.every((a) => a.x > 1200));
  pass("Boat moves all surviving passengers and preserves equipment");
  await drive(p, { x: 1770, y: 935 });
  await press(p, "e");
  assert.equal(
    await p.evaluate(() => window.__EXFIL__.scene.surveillanceOff),
    true,
  );
  pass("Distinct ridge route reaches and disables surveillance");
  await drive(p, { x: 1595, y: 1005 });
  await press(p, "e");
  assert.ok((await state(p)).raid.carried.includes("radioLogs"));
  await p.screenshot({ path: "qa/final-mission02-squad.png" });
  await p.keyboard.down("t");
  await p.waitForFunction(
    () => window.__EXFIL__.scene.raid.transmitted.includes("radioLogs"),
    null,
    { timeout: 15000 },
  );
  await p.keyboard.up("t");
  assert.ok((await state(p)).save.evidence.includes("radioLogs"));
  assert.ok(await p.evaluate(() => window.__EXFIL__.scene.reinforced));
  pass("Scrambler uplink secures radio logs and triggers response patrol");
  await drive(p, { x: 1280, y: 1132 });
  await press(p, "e");
  await p.locator("#sail").click();
  await p.waitForFunction(
    () =>
      window.__EXFIL__.scene.sector === "coast" &&
      !window.__EXFIL__.scene.transit,
  );
  await drive(p, { x: 490, y: 1360 });
  await press(p, "e");
  await p.locator("#safehouse").click();
  await p
    .getByText("OPERATOR EXTRACTED", { exact: true })
    .waitFor({ timeout: 20000 });
  result = await state(p);
  assert.ok(result.save.completedMissions.includes("frequency"));
  pass("Mission 02 full boat/ridge/transmit/return route completes", {
    elapsed: result.elapsed,
    hp: result.player.hp,
    squad: result.companions,
  });
  await p.screenshot({ path: "qa/final-mission02-results.png" });
  await context.close();

  const test = await setup(),
    q = test.page;
  await deploy(q);
  await focus(q, 570, 1215);
  await q.evaluate(() => window.__EXFIL__.scene.damage(100));
  assert.ok((await state(q)).downed);
  await q.keyboard.down("e");
  await q.waitForFunction(() => !window.__EXFIL__.scene.player.downed);
  await q.keyboard.up("e");
  assert.equal((await state(q)).player.selfKit, 0);
  assert.equal((await state(q)).player.revives, 1);
  await q.evaluate(() => window.__EXFIL__.scene.damage(100));
  await q.getByText("SIGNAL LOST", { exact: true }).waitFor();
  pass("Solo has one limited self-revive; second lethal hit fails");
  await test.context.close();
  const failed = await setup(),
    f = failed.page;
  await deploy(f);
  await focus(f, 995, 770);
  await press(f, "e");
  await f.evaluate(() => {
    const s = window.__EXFIL__.scene;
    s.player.selfKit = 0;
    s.damage(100);
  });
  assert.deepEqual((await state(f)).save.evidence, []);
  pass("Failure loses untransmitted evidence");
  await failed.context.close();
  const bank = await setup(),
    b = bank.page;
  await deploy(b);
  await focus(b, 995, 770);
  await press(b, "e");
  await b.keyboard.down("t");
  await b.waitForFunction(() => window.__EXFIL__.scene.transmission > 0.3);
  await b.keyboard.up("t");
  await b.waitForTimeout(150);
  assert.deepEqual((await state(b)).save.evidence, []);
  pass("Interrupted TX does not bank evidence");
  await b.keyboard.down("t");
  await b.waitForFunction(
    () => window.__EXFIL__.scene.raid.transmitted.includes("manifest"),
    null,
    { timeout: 16000 },
  );
  await b.keyboard.up("t");
  await b.evaluate(() => {
    const s = window.__EXFIL__.scene;
    s.player.selfKit = 0;
    s.damage(100);
  });
  assert.ok((await state(b)).save.evidence.includes("manifest"));
  assert.equal((await state(b)).save.completedMissions.length, 0);
  pass("Completed TX survives failure without unlocking next mission");
  await bank.context.close();
  const squad = await setup(),
    a = squad.page;
  await deploy(a, "squad");
  await focus(a, 570, 1215);
  await a.evaluate(() => {
    const s = window.__EXFIL__.scene;
    for (const c of s.companions) c.reposition(s.player);
    s.damage(100);
  });
  await a.waitForFunction(() => !window.__EXFIL__.scene.player.downed, null, {
    timeout: 15000,
  });
  assert.equal((await state(a)).done, false);
  assert.equal((await state(a)).player.revives, 1);
  assert.equal(
    (await state(a)).companions.reduce((n, c) => n + c.kit, 0),
    1,
  );
  pass("Available squadmate revives safely and consumes a kit");
  await focus(a, 710, 1185);
  const ammo = (await state(a)).player.reserve;
  await press(a, "e");
  assert.equal((await state(a)).player.reserve, ammo + 30);
  await press(a, "e");
  assert.equal((await state(a)).player.reserve, ammo + 30);
  pass("Ammo pickup cannot be collected twice");
  await press(a, "Escape");
  const paused = (await state(a)).elapsed;
  await a.waitForTimeout(300);
  assert.equal((await state(a)).elapsed, paused);
  await a.getByRole("button", { name: "RESUME OPERATION" }).click();
  pass("Pause freezes mission and squad state");
  await squad.context.close();
  assert.deepEqual(report.errors, []);
  pass("No missing assets or uncaught errors across campaign scenarios");
} catch (e) {
  report.failure = e.stack;
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync("qa/campaign-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
