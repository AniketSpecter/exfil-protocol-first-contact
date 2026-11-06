import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const base =
  process.env.EXFIL_HOSTED_URL ||
  "https://aniketspecter.github.io/exfil-protocol-first-contact/";
const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--disable-gpu"],
  }),
  report = { url: base, checks: [], errors: [] };
const pass = (s) => {
  report.checks.push(s);
  console.log("PASS", s);
};
async function probe(context) {
  await context.addInitScript(() => {
    const Original = window.AudioContext || window.webkitAudioContext;
    window.audioQA = { decoded: [], starts: [], stops: [] };
    const Wrapped = new Proxy(Original, {
      construct(Target, args) {
        const ctx = new Target(...args),
          decode = ctx.decodeAudioData.bind(ctx),
          create = ctx.createBufferSource.bind(ctx);
        ctx.decodeAudioData = async (...args) => {
          const buffer = await decode(...args);
          window.audioQA.decoded.push(buffer.duration);
          return buffer;
        };
        ctx.createBufferSource = () => {
          const source = create(),
            start = source.start.bind(source),
            stop = source.stop.bind(source);
          source.start = (...args) => {
            window.audioQA.starts.push({
              duration: source.buffer?.duration,
              loop: source.loop,
            });
            return start(...args);
          };
          source.stop = (...args) => {
            window.audioQA.stops.push(source.buffer?.duration);
            return stop(...args);
          };
          return source;
        };
        return ctx;
      },
    });
    window.AudioContext = Wrapped;
    if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
  });
}
function watch(page) {
  page.on("pageerror", (e) => report.errors.push(e.stack));
  page.on("response", (r) => {
    if (r.status() >= 400) report.errors.push(r.status() + " " + r.url());
  });
}
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  await probe(context);
  const p = await context.newPage();
  watch(p);
  await p.goto(base + "?renderer=canvas");
  const catalog = await p.evaluate(async () => {
    const r = await fetch("assets/game/catalog.json");
    if (!r.ok) throw Error("Media catalog unavailable");
    return r.json();
  });
  assert.equal(catalog.artwork.length, 35);
  assert.equal(Object.keys(catalog.audio.cues).length, 31);
  assert.ok(catalog.menuMusic.file.endsWith(".mp3"));
  assert.ok(!JSON.stringify(catalog).includes("source"));
  pass(
    "Published catalog contains 35 graphics, 31 sound cues and the menu score without source paths",
  );
  await p.locator(".title-enter").click();
  await p.waitForFunction(
    () =>
      window.audioQA.decoded.length >= 2 &&
      window.audioQA.starts.some((s) => s.loop && s.duration > 20),
  );
  const musicDuration = await p.evaluate(
    () => window.audioQA.starts.find((s) => s.loop && s.duration > 20).duration,
  );
  report.menuDuration = musicDuration;
  pass(
    "Runtime bank and supplied MP3 decode; the menu soundtrack actually starts looping",
  );
  await p.locator("#audio-btn").click();
  assert.equal(await p.locator("#audio-btn").innerText(), "AUDIO OFF");
  assert.equal(await p.locator("#music-btn").innerText(), "MUSIC ON");
  const stops = await p.evaluate(() => window.audioQA.stops.length);
  await p.waitForTimeout(500);
  assert.equal(await p.evaluate(() => window.audioQA.stops.length), stops);
  pass("Audio Off leaves the independently enabled menu music playing");
  await p.locator("#music-btn").click();
  await p.waitForFunction(
    (duration) =>
      window.audioQA.stops.some((d) => Math.abs(d - duration) < 0.01),
    musicDuration,
  );
  assert.equal(await p.locator("#music-btn").innerText(), "MUSIC OFF");
  await p.locator("#audio-btn").click();
  assert.equal(await p.locator("#music-btn").innerText(), "MUSIC OFF");
  pass("Music Off stops the soundtrack without coupling to the Audio toggle");
  await p.reload();
  await p.locator(".title-enter").click();
  assert.equal(await p.locator("#music-btn").innerText(), "MUSIC OFF");
  assert.equal(await p.locator("#audio-btn").innerText(), "AUDIO ON");
  await p.locator("#music-btn").click();
  await p.waitForFunction(() =>
    window.audioQA.starts.some((s) => s.loop && s.duration > 20),
  );
  await p.locator("#new-operation").click();
  await p.locator("#play").click();
  await p.waitForFunction(() => window.audioQA.stops.some((d) => d > 20));
  pass("Preferences survive refresh and deploying stops the menu score");
  await p.locator("#pause-button").click();
  await p.locator("#abandon").click();
  await p.waitForFunction(
    () =>
      window.audioQA.starts.filter((s) => s.loop && s.duration > 20).length >=
      2,
  );
  await p.screenshot({ path: "qa/hosted-full-media.png" });
  pass(
    "Returning from a raid restarts the soundtrack on the restored-media menu",
  );
  await context.close();
  const mobile = await browser.newContext({
    viewport: { width: 800, height: 360 },
    hasTouch: true,
    isMobile: true,
  });
  await probe(mobile);
  const m = await mobile.newPage();
  watch(m);
  await m.goto(base + "?renderer=canvas");
  await m.locator(".title-enter").tap();
  for (const id of ["audio-btn", "music-btn", "fullscreen-btn"]) {
    const r = await m.locator("#" + id).evaluate((el) => {
      const r = el.getBoundingClientRect(),
        t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        w: r.width,
        h: r.height,
        hit: t === el || el.contains(t),
      };
    });
    assert.ok(
      r.x >= 0 &&
        r.y >= 0 &&
        r.right <= 800 &&
        r.bottom <= 360 &&
        r.w >= 44 &&
        r.h >= 44 &&
        r.hit,
      id + " reachable on phone",
    );
  }
  await m.locator("#music-btn").tap();
  assert.equal(await m.locator("#music-btn").innerText(), "MUSIC OFF");
  await m.locator("#new-operation").tap();
  await m.locator("#play").tap();
  await m.locator("#pause-button").tap();
  await m.locator("#resume").waitFor();
  await m.screenshot({ path: "qa/hosted-full-media-phone.png" });
  pass(
    "Phone audio/music/fullscreen controls are reachable; Music toggles and raid Pause remains usable",
  );
  assert.deepEqual(report.errors, []);
  pass("No missing runtime files or uncaught browser errors");
} catch (e) {
  report.errors.push(e.stack);
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync("qa/hosted-media-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
