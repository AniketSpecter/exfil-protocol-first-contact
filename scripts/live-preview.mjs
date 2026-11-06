import { chromium } from "@playwright/test";
import { createInterface } from "node:readline";
// A dedicated local QA browser. Software compositing avoids a black native
// Chrome window on some Windows capture/GPU configurations.
const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: [
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-features=CalculateNativeWinOcclusion",
    "--start-maximized",
  ],
});
let context = await browser.newContext({ viewport: null }),
  page = await context.newPage();
await page.goto("http://127.0.0.1:5173/?renderer=canvas");
await page
  .getByRole("button", { name: "Continue to operations" })
  .waitFor({ timeout: 25000 });
console.log(
  "LIVE PREVIEW READY — supplied title artwork, software rendering. Window remains open.",
);
const input = createInterface({ input: process.stdin });
input.on("line", async (line) => {
  try {
    if (line === "mobile") {
      const next = await browser.newContext({
        viewport: { width: 844, height: 390 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      });
      const nextPage = await next.newPage();
      await nextPage.goto("http://127.0.0.1:5173/?renderer=canvas");
      await nextPage
        .getByRole("button", { name: "Continue to operations" })
        .click();
      await nextPage
        .getByRole("button", { name: /NEW OPERATION|DEPLOY AGAIN/ })
        .waitFor();
      await context.close();
      context = next;
      page = nextPage;
      console.log("MOBILE LANDSCAPE PREVIEW READY");
    } else if (line === "desktop") {
      const next = await browser.newContext({ viewport: null }),
        nextPage = await next.newPage();
      await nextPage.goto("http://127.0.0.1:5173/?renderer=canvas");
      await context.close();
      context = next;
      page = nextPage;
      console.log("NATIVE WINDOW VIEWPORT");
    } else if (line === "screenshot") {
      await page.screenshot({ path: "qa/live-preview.png" });
      console.log("SCREENSHOT SAVED");
    } else if (line === "play") {
      if (await page.locator(".title-enter").isVisible())
        await page.locator(".title-enter").click();
      await page
        .getByRole("button", { name: /NEW OPERATION|DEPLOY AGAIN/ })
        .click();
      await page.getByRole("button", { name: "PLAY OPERATION" }).click();
      console.log("LIVE RAID STARTED");
    } else if (line === "close") {
      await browser.close();
      input.close();
    }
  } catch (error) {
    console.error(error.message);
  }
});
browser.on("disconnected", () => {
  input.close();
  process.exit(0);
});
