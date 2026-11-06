import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const live = process.env.EXFIL_LIVE_QA === "1";
const browser = await chromium.launch({
  channel: "chrome",
  headless: !live,
  slowMo: live ? 80 : 0,
  args: live
    ? [
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--disable-features=CalculateNativeWinOcclusion",
        "--window-position=70,70",
      ]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
});
const page = await context.newPage(),
  cdp = await context.newCDPSession(page),
  report = {
    checks: [],
    errors: [],
    scope:
      "Chromium touch emulation. Physical Android and iOS Safari testing remains unperformed.",
  };
page.on("pageerror", (e) => report.errors.push(e.stack));
page.on("console", (m) => {
  if (m.type() === "error")
    report.errors.push(m.text() + " " + JSON.stringify(m.location()));
});
page.on("response", (r) => {
  if (r.status() >= 400) report.errors.push(r.status() + " " + r.url());
});
const pass = (name) => {
  console.log("PASS", name);
  report.checks.push(name);
};
const state = () => page.evaluate(() => window.__EXFIL__.scene.snapshot());
const touch = (type, points) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p, i) => ({
      ...p,
      id: p.id ?? i,
      radiusX: 8,
      radiusY: 8,
      force: 1,
    })),
  });
const center = async (selector) => {
  const r = await page.locator(selector).boundingBox();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
async function position(x, y) {
  await page.evaluate(
    ({ x, y }) => {
      const s = window.__EXFIL__.scene;
      s.player.x = x;
      s.player.y = y;
      for (const e of s.enemies) {
        e.hp = 0;
        e.sprite.setAlpha(0.2);
        e.label.setText("");
      }
    },
    { x, y },
  );
  await page.waitForTimeout(100);
}
try {
  await page.goto(
    (process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/?qa=1' + (live ? "&renderer=canvas" : ""),
  );
  await page.getByRole("button", { name: "Continue to operations" }).click();
  await page
    .getByRole("button", { name: "NEW OPERATION" })
    .waitFor({ timeout: 25000 });
  assert.equal(await page.evaluate(() => window.__EXFIL__.ui.touchMode), true);
  await page.screenshot({ path: "qa/mobile-menu-844.png" });
  pass("Landscape menu at 844 Ã— 390");
  await page.getByRole("button", { name: "NEW OPERATION" }).tap();
  await page.screenshot({ path: "qa/mobile-briefing.png" });
  await page.getByRole("button", { name: "PLAY OPERATION" }).tap();
  await page.locator("#move-stick").waitFor();
  const move = await center("#move-stick"),
    aim = await center("#aim-stick");
  const before = await state();
  await touch("touchStart", [move]);
  await touch("touchMove", [{ x: move.x + 30, y: move.y }]);
  await page.waitForTimeout(500);
  await touch("touchEnd", []);
  assert.ok((await state()).player.x > before.player.x + 10);
  assert.equal(
    await page.evaluate(() => window.__EXFIL__.scene.touch.moveX),
    0,
  );
  pass("Real touch movement joystick and release");
  const ammo = (await state()).player.ammo;
  await touch("touchStart", [aim]);
  await touch("touchMove", [{ x: aim.x + 30, y: aim.y }]);
  await page.waitForTimeout(500);
  await touch("touchEnd", []);
  assert.ok((await state()).player.ammo < ammo);
  assert.equal(
    await page.evaluate(() => window.__EXFIL__.scene.touch.fire),
    false,
  );
  pass("Aim stick rotates and fires; release stops fire");
  const start = (await state()).player;
  await touch("touchStart", [
    { ...move, id: 0 },
    { ...aim, id: 1 },
  ]);
  await touch("touchMove", [
    { x: move.x, y: move.y - 28, id: 0 },
    { x: aim.x + 28, y: aim.y, id: 1 },
  ]);
  await page.waitForTimeout(450);
  await touch("touchEnd", []);
  const both = (await state()).player;
  assert.ok(both.y < start.y - 10);
  assert.ok(both.ammo < start.ammo);
  pass("Simultaneous two-thumb movement and firing");
  await page.getByRole("button", { name: "Reload", exact: true }).tap();
  await page.waitForFunction(
    () => window.__EXFIL__.scene.player.ammo === 30,
    null,
    { timeout: 12000 },
  );
  pass("Touch reload");
  await page.getByRole("button", { name: "Switch weapon", exact: true }).tap();
  await page
    .getByRole("button", { name: "Equip secondary", exact: true })
    .tap();
  assert.equal((await state()).player.weapon, "usp");
  await page.getByRole("button", { name: "Switch weapon", exact: true }).tap();
  await page.getByRole("button", { name: "Equip primary", exact: true }).tap();
  assert.equal((await state()).player.weapon, "m4");
  pass("Touch weapon switching");
  await page.getByRole("button", { name: "Toggle quiet movement" }).tap();
  assert.equal(
    await page.evaluate(() => window.__EXFIL__.scene.touch.quiet),
    true,
  );
  pass("Touch quiet movement toggle");
  await page.getByRole("button", { name: "Toggle tactical map" }).tap();
  assert.equal(await page.locator("#map-overlay").isVisible(), true);
  await page.getByRole("button", { name: "Toggle tactical map" }).tap();
  pass("Touch map toggle");
  await position(995, 770);
  await page.getByRole("button", { name: "Interact", exact: true }).tap();
  await page.waitForFunction(() =>
    window.__EXFIL__.scene.raid.carried.includes("manifest"),
  );
  await page.screenshot({ path: "qa/mobile-gameplay-844.png" });
  pass("Touch intel collection");
  const tx = await center("#touch-transmit");
  await touch("touchStart", [tx]);
  await page.waitForFunction(() => window.__EXFIL__.scene.transmission > 0.5);
  await touch("touchEnd", []);
  await page.waitForTimeout(150);
  assert.equal((await state()).transmission, 0);
  pass("Touch transmission release cancels");
  await touch("touchStart", [tx]);
  await page.waitForFunction(
    () => window.__EXFIL__.scene.raid.transmitted.includes("manifest"),
    null,
    { timeout: 20000 },
  );
  await touch("touchEnd", []);
  pass("Touch hold TX banks evidence");
  await page.locator("#pause-button").tap();
  const elapsed = (await state()).elapsed;
  await page.waitForTimeout(300);
  assert.equal((await state()).elapsed, elapsed);
  await page.getByRole("button", { name: "RESUME OPERATION" }).tap();
  pass("Touch pause and resume");
  await position(490, 1360);
  await page.getByRole("button", { name: "Interact", exact: true }).tap();
  await page
    .getByText("OPERATOR EXTRACTED", { exact: true })
    .waitFor({ timeout: 20000 });
  assert.equal((await state()).save.completions, 1);
  pass("Touch extraction and results");
  await page.screenshot({ path: "qa/mobile-results.png" });
  await page
    .getByRole("button", { name: /NEXT CONTRACT|REPLAY CONTRACT/ })
    .tap();
  await page.locator("[data-mode=squad]").tap();
  await page.getByRole("button", { name: "PLAY OPERATION" }).tap();
  await position(490, 1360);
  await page.getByRole("button", { name: "Interact", exact: true }).tap();
  await page.locator("#sail").tap();
  await page.waitForFunction(
    () =>
      window.__EXFIL__.scene.sector === "ridge" &&
      !window.__EXFIL__.scene.transit,
  );
  assert.equal((await state()).companions.filter((a) => a.hp > 0).length, 2);
  pass("Touch destination selection and boat passengers");
  await position(1595, 1005);
  await page.getByRole("button", { name: "Interact", exact: true }).tap();
  await page.waitForFunction(() =>
    window.__EXFIL__.scene.raid.carried.includes("radioLogs"),
  );
  assert.ok((await state()).raid.carried.includes("radioLogs"));
  await position(1280, 1132);
  await page.getByRole("button", { name: "Interact", exact: true }).tap();
  await page.locator("#sail").tap();
  await page.waitForFunction(
    () =>
      window.__EXFIL__.scene.sector === "coast" &&
      !window.__EXFIL__.scene.transit,
  );
  await position(490, 1360);
  await page.getByRole("button", { name: "Interact", exact: true }).tap();
  await page.locator("#safehouse").tap();
  await page
    .getByText("OPERATOR EXTRACTED", { exact: true })
    .waitFor({ timeout: 20000 });
  pass("Touch Mission 02 returns to safehouse with radio logs");
  await page
    .getByRole("button", { name: /NEXT CONTRACT|REPLAY CONTRACT/ })
    .tap();
  await page.locator("[data-mode=solo]").tap();
  await page.getByRole("button", { name: "PLAY OPERATION" }).tap();
  await position(490, 1290);
  await page.evaluate(() => window.__EXFIL__.scene.damage(100));
  await page.locator("#revive-control").waitFor();
  const revive = await center("#revive-control");
  await touch("touchStart", [revive]);
  await page.waitForFunction(
    () => !window.__EXFIL__.scene.player.downed,
    null,
    { timeout: 15000 },
  );
  await touch("touchEnd", []);
  assert.equal((await state()).player.selfKit, 0);
  pass("Touch held self-revive consumes the solo kit");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.getByText("ROTATE TO LANDSCAPE", { exact: true }).isVisible(),
  );
  await page.screenshot({ path: "qa/mobile-portrait-prompt.png" });
  pass("Active raid pauses with portrait rotation guidance");
  assert.deepEqual(report.errors, []);
  pass("No browser errors or failed resources in touch run");
} catch (e) {
  report.failure = e.stack;
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync("qa/mobile-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
