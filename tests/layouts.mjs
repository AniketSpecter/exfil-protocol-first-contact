import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
const checks = [];
try {
  for (const [width, height] of [
    [667, 375],
    [800, 360],
    [844, 390],
    [1024, 768],
  ]) {
    const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      }),
      page = await context.newPage();
    await page.goto((process.env.EXFIL_TEST_URL || "http://127.0.0.1:5173") + '/');
    await page.getByRole("button", { name: "Continue to operations" }).click();
    await page
      .getByRole("button", { name: "NEW OPERATION" })
      .waitFor({ timeout: 25000 });
    await page.screenshot({ path: `qa/mobile-menu-${width}.png` });
    await page.getByRole("button", { name: "NEW OPERATION" }).tap();
    await page.getByRole("button", { name: "PLAY OPERATION" }).tap();
    await page.locator("#move-stick").waitFor();
    for (const id of [
      "move-stick",
      "aim-stick",
      "touch-interact",
      "touch-reload",
      "touch-transmit",
      "touch-map",
      "touch-quiet",
      "touch-heal",
      "weapon-switch",
      "pause-button",
    ]) {
      const info = await page.locator("#" + id).evaluate((el) => {
        const r = el.getBoundingClientRect(),
          top = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          clickable: el === top || el.contains(top),
        };
      });
      assert.ok(
        info.x >= 0 &&
          info.y >= 0 &&
          info.right <= width &&
          info.bottom <= height,
        `${id} within ${width}x${height}`,
      );
      assert.ok(info.clickable, `${id} not covered at ${width}x${height}`);
      {
        const r = await page.locator("#" + id).boundingBox();
        assert.ok(
          r.width >= 44 && r.height >= 44,
          `${id} at least 44px touch target`,
        );
      }
    }
    await page.screenshot({ path: `qa/mobile-layout-${width}.png` });
    checks.push(`Visible touch controls unobstructed at ${width} × ${height}`);
    console.log("PASS", checks.at(-1));
    await context.close();
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
  checks.push(e.stack);
} finally {
  writeFileSync("qa/layout-report.json", JSON.stringify({ checks }, null, 2));
  await browser.close();
}
