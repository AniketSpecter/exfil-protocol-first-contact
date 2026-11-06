import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const live = process.env.EXFIL_LIVE_QA === "1";
const browser = await chromium.launch({
    channel: "chrome",
    headless: !live,
    args: ["--disable-gpu", "--disable-gpu-compositing"],
  }),
  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  }),
  page = await context.newPage(),
  report = { checks: [], errors: [] };
page.on("pageerror", (e) => report.errors.push(e.stack));
page.on("response", (r) => {
  if (r.status() >= 400) report.errors.push(r.status() + " " + r.url());
});
const pass = (s) => {
  report.checks.push(s);
  console.log("PASS", s);
};
const audio = () =>
  page.evaluate(() => {
    const a = window.__EXFIL__.ui.audio;
    return {
      decoded: a.stats.decoded,
      failures: a.stats.failures,
      muted: a.muted,
      musicMuted: a.musicMuted,
      music: !!a.menuSource,
      musicGain: a.musicBus?.gain.value,
      gameGain: a.gameBus?.gain.value,
      ui: a.stats.ui,
      voices: a.stats.voices,
      ctx: a.ctx?.state,
      ocean: a.ocean?.loop,
    };
  });
try {
  await page.goto(
    (process.env.EXFIL_TEST_URL || "http://127.0.0.1:5191") +
      "/?qa=1&renderer=canvas",
  );
  await page.locator(".title-enter").waitFor();
  assert.equal(
    await page.evaluate(() => !!window.__EXFIL__.ui.audio.ctx),
    false,
  );
  pass("Audio context and menu score wait for the first user interaction");
  await page.locator(".title-enter").click();
  await page.waitForFunction(() => {
    const a = window.__EXFIL__.ui.audio;
    return (
      a.stats.decoded === 31 &&
      a.menuBuffer &&
      a.menuSource &&
      a.musicBus.gain.value > 0.3
    );
  });
  let a = await audio();
  assert.equal(a.ctx, "running");
  assert.equal(a.ocean, true);
  assert.deepEqual(a.failures, []);
  const sprites = await page.evaluate(() => {
    const g = window.__EXFIL__.game;
    return ["skin-ct3", "gun-m4a1", "terrain-grass"].map((n) => ({
      exists: g.textures.exists(n),
      image: g.textures.get(n).getSourceImage() instanceof HTMLImageElement,
    }));
  });
  assert.ok(sprites.every((item) => item.exists && item.image));
  pass(
    "Restored operator, weapon and terrain media load; all 31 sound cues decode and ocean loops",
  );
  const clips = await page.evaluate(() =>
    [...window.__EXFIL__.ui.audio.buffers.values()].every(
      (b) =>
        b.duration > 0 && b.getChannelData(0).some((v) => Math.abs(v) > 0.001),
    ),
  );
  assert.ok(clips);
  pass("Each compiled cue contains a non-silent audio buffer");
  await page.locator("#credits").hover();
  await page.locator("#credits").click();
  await page.locator("#credits-back").click();
  a = await audio();
  assert.ok(
    a.ui.includes("hover") && a.ui.includes("confirm") && a.ui.includes("back"),
  );
  assert.ok(a.music);
  pass("Hover, confirmation and Back sounds work while menu music continues");
  await page.waitForTimeout(200);
  const count = (await audio()).ui.length;
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) window.__EXFIL__.ui.audio.uiSound("hover");
  });
  assert.ok((await audio()).ui.length <= count + 1);
  pass("Rapid UI hover events are throttled");
  await page.locator("#audio-btn").click();
  a = await audio();
  assert.ok(a.muted);
  assert.equal(a.gameGain, 0);
  assert.ok(a.music && a.musicGain > 0.3);
  pass("Audio Off mutes game sounds and leaves Music On playing");
  await page.locator("#music-btn").click();
  await page.waitForTimeout(550);
  a = await audio();
  assert.ok(a.musicMuted);
  assert.equal(a.music, false);
  await page.locator("#audio-btn").click();
  a = await audio();
  assert.equal(a.muted, false);
  assert.equal(a.gameGain, 1);
  assert.equal(a.music, false);
  pass("Music Off and Audio On remain independent");
  await page.reload();
  await page.locator(".title-enter").click();
  await page.waitForFunction(
    () => window.__EXFIL__.ui.audio.stats.decoded === 31,
  );
  a = await audio();
  assert.equal(a.muted, false);
  assert.equal(a.musicMuted, true);
  assert.equal(a.music, false);
  pass("Separate audio/music preferences persist across refresh");
  await page.locator("#settings-menu").click();
  await page.locator("#setting-music").click();
  await page.waitForFunction(() => !!window.__EXFIL__.ui.audio.menuSource);
  assert.equal(await page.locator("#music-btn").innerText(), "MUSIC ON");
  await page.locator(".utility-close").click();
  await page.locator("#new-operation").click();
  assert.ok((await audio()).music);
  await page.locator("#play").click();
  await page.waitForTimeout(600);
  a = await audio();
  assert.equal(a.music, false);
  assert.ok(a.voices.includes("deploy"));
  pass(
    "Music toggle in Settings updates the header; briefing keeps music and deployment fades it out",
  );
  await page.evaluate(() => {
    const a = window.__EXFIL__.ui.audio;
    a.voiceBusy = 0;
    a.voice("enemyContact", {
      position: window.__EXFIL__.scene.player,
      listener: window.__EXFIL__.scene.player,
      priority: 4,
    });
  });
  assert.ok((await audio()).voices.includes("enemyContact"));
  pass("Restored operator and enemy radio cues play through the voice bus");
  await page.locator("#pause-button").click();
  await page.locator("#abandon").click();
  await page.waitForFunction(() => !!window.__EXFIL__.ui.audio.menuSource);
  await page.screenshot({ path: "qa/restored-media-menu.png" });
  pass("Returning to the operation menu restarts the supplied soundtrack");
  assert.deepEqual(report.errors, []);
} catch (e) {
  report.errors.push(e.stack);
  console.error(e);
  await page.screenshot({ path: "qa/media-audio-failure.png" });
  process.exitCode = 1;
} finally {
  writeFileSync("qa/media-audio-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
