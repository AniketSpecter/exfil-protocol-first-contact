import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
  }),
  report = {
    checks: [],
    errors: [],
    scope:
      "Focused fixture-based recovery/transport checks, not complete playthroughs.",
  };
const pass = (name) => {
  report.checks.push(name);
  console.log("PASS", name);
};
async function setup(mode = "solo", mission = "landing") {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  if (mission === "frequency")
    await ctx.addInitScript(() =>
      localStorage.setItem(
        "exfil.first-contact.v1",
        JSON.stringify({
          version: 1,
          xp: 650,
          completions: 1,
          completedMissions: ["landing"],
          lastMission: "frequency",
          signalFilter: true,
          evidence: ["manifest"],
        }),
      ),
    );
  const p = await ctx.newPage();
  p.on("pageerror", (e) => report.errors.push(e.stack));
  await p.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1');
  await p.getByRole("button", { name: "Continue to operations" }).click();
  await p.getByRole("button", { name: /NEW OPERATION|DEPLOY AGAIN/ }).click();
  await p.locator("[data-mode=" + mode + "]").click();
  await p.getByRole("button", { name: "PLAY OPERATION" }).click();
  await p.locator("#health-value").waitFor();
  return { ctx, p };
}
try {
  const one = await setup();
  await one.p.evaluate(() => {
    const s = window.__EXFIL__.scene;
    for (const e of s.enemies) e.hp = 0;
    s.damage(100);
    s.bleedout = 0.2;
  });
  await one.p.getByText("SIGNAL LOST", { exact: true }).waitFor();
  pass("Bleed-out fails a raid if no revive is completed");
  await one.ctx.close();
  const safe = await setup();
  await safe.p.evaluate(() => {
    const s = window.__EXFIL__.scene;
    for (const e of s.enemies) e.hp = 0;
    const e = s.enemies[0];
    Object.assign(e, {
      x: 570,
      y: 1120,
      hp: 1000,
      state: "ENGAGE",
      suspicion: 1,
      angle: Math.PI / 2,
      cooldown: 999,
    });
    s.damage(100);
  });
  await safe.p.keyboard.down("e");
  await safe.p.waitForTimeout(600);
  assert.equal(
    await safe.p.evaluate(() => window.__EXFIL__.scene.reviveProgress),
    0,
  );
  await safe.p.evaluate(() => (window.__EXFIL__.scene.enemies[0].hp = 0));
  await safe.p.waitForFunction(
    () => !window.__EXFIL__.scene.player.downed,
    null,
    { timeout: 15000 },
  );
  await safe.p.keyboard.up("e");
  assert.equal(await safe.p.evaluate(() => window.__EXFIL__.scene.done), false);
  pass(
    "Direct hostile contact blocks solo revive; removing the threat allows recovery",
  );
  await safe.ctx.close();
  const lost = await setup("squad");
  await lost.p.evaluate(() => {
    const s = window.__EXFIL__.scene;
    for (const e of s.enemies) e.hp = 0;
    for (const a of s.companions) a.damage(80);
    s.damage(100);
  });
  await lost.p.getByText("SIGNAL LOST", { exact: true }).waitFor();
  pass("A lost squad cannot supply unlimited revival");
  await lost.ctx.close();
  const boat = await setup("squad", "frequency");
  await boat.p.evaluate(() => {
    const s = window.__EXFIL__.scene;
    for (const e of s.enemies) e.hp = 0;
    Object.assign(s.player, {
      x: 490,
      y: 1360,
      hp: 63,
      ammo: 17,
      reserve: 51,
      medkits: 2,
    });
    s.raid.carried = ["radioLogs"];
    s.companions[1].damage(80);
  });
  await boat.p.keyboard.press("e");
  await boat.p.locator("#sail").click();
  await boat.p.waitForFunction(
    () =>
      window.__EXFIL__.scene.sector === "ridge" &&
      !window.__EXFIL__.scene.transit,
  );
  const data = await boat.p.evaluate(() => window.__EXFIL__.scene.snapshot());
  assert.equal(data.player.hp, 63);
  assert.equal(data.player.ammo, 17);
  assert.equal(data.player.reserve, 51);
  assert.equal(data.player.medkits, 2);
  assert.ok(data.raid.carried.includes("radioLogs"));
  assert.ok(data.companions[0].x > 1200);
  assert.ok(data.companions[1].x < 1200);
  pass(
    "Boat preserves damaged loadout, medkits and intel; only surviving passengers move",
  );
  await boat.ctx.close();
  assert.deepEqual(report.errors, []);
  pass("No uncaught errors in recovery and passenger failure paths");
} catch (e) {
  report.failure = e.stack;
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync("qa/recovery-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
