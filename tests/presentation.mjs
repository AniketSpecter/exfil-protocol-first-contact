import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
  }),
  checks = [],
  errors = [];
try {
  for (const [width, height, asset] of [
    [1280, 720, "16-9"],
    [1200, 900, "4-3"],
    [390, 844, "9-16"],
    [1680, 720, "21-9"],
  ]) {
    const ctx = await b.newContext({
        viewport: { width, height },
        hasTouch: width === 390,
        isMobile: width === 390,
      }),
      p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.stack));
    await p.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/');
    await p.getByRole("button", { name: "Continue to operations" }).waitFor();
    await p.locator(".title-screen img").evaluate((im) => im.decode());
    const image = await p
      .locator(".title-screen img")
      .evaluate((im) => ({
        src: im.currentSrc,
        fit: getComputedStyle(im).objectFit,
        rect: { w: im.width, h: im.height },
      }));
    assert.ok(image.src.endsWith(asset + ".png"));
    assert.equal(image.fit, "contain");
    assert.equal(image.rect.w, width);
    assert.equal(image.rect.h, height);
    await p.screenshot({ path: "qa/title-" + asset + ".png" });
    checks.push("Correct uncropped title image at " + width + "x" + height);
    await p.getByRole("button", { name: "Continue to operations" }).click();
    await p.getByRole("button", { name: "SETTINGS", exact: true }).click();
    await p.locator("#setting-audio").click();
    await p.locator(".utility-close").click();
    await p.getByRole("button", { name: "CONTROLS", exact: true }).click();
    await p.locator(".utility-close").click();
    checks.push("Settings and controls work at " + width + "x" + height);
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log(checks.map((x) => "PASS " + x).join("\n"));
} catch (e) {
  errors.push(e.stack);
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync(
    "qa/presentation-report.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  await b.close();
}
