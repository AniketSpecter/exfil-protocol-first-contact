import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const buildFolder = process.env.EXFIL_BUILD_DIR || "dist";
const root = resolve(buildFolder),
  prefix = "/games/first-contact/",
  errors = [],
  checks = [];
assert.ok(
  existsSync(resolve(root, "index.html")),
  "Build before production test",
);
const html = readFileSync(resolve(root, "index.html"), "utf8");
assert.ok(html.includes("./assets/"), "Relative entry paths");
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (!path.startsWith(prefix)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const relative =
      decodeURIComponent(path.slice(prefix.length)) || "index.html",
    file = resolve(root, relative);
  if (
    !file.startsWith(root + "\\") &&
    !file.startsWith(root + "/") &&
    file !== root
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".md": "text/plain",
    ".txt": "text/plain",
  };
  res.writeHead(200, {
    "Content-Type": mime[extname(file)] || "application/octet-stream",
  });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(4180, "127.0.0.1", resolve));
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
try {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.stack));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  await page.goto("http://127.0.0.1:4180" + prefix + "?qa=1");
  await page.getByRole("button", { name: "Continue to operations" }).click();
  await page
    .getByRole("button", { name: "NEW OPERATION" })
    .waitFor({ timeout: 30000 });
  checks.push("Production menu loads below a nested URL");
  await page.locator("#credits").click();
  assert.equal(await page.locator(".credit-section").count(), 4);
  assert.ok(await page.getByText("Aniket [UGZ]", { exact: true }).isVisible());
  await page.locator("#credits-back").click();
  checks.push("Built credits show the correct creator and section layout");
  assert.equal(await page.evaluate(() => typeof window.__EXFIL__), "undefined");
  checks.push("Development QA harness absent in release");
  await page.getByRole("button", { name: "NEW OPERATION" }).click();
  await page.getByRole("button", { name: "PLAY OPERATION" }).click();
  await page.locator("#health-value").waitFor();
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  await page.getByRole("button", { name: "ESC · PAUSE" }).click();
  await page.getByRole("button", { name: "RESUME OPERATION" }).waitFor();
  checks.push("Built desktop game accepts movement and pause");
  await page.screenshot({ path: "qa/production-desktop.png" });
  const mobile = await browser.newContext({
      viewport: { width: 800, height: 360 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    }),
    touch = await mobile.newPage();
  touch.on("pageerror", (e) => errors.push(e.stack));
  touch.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  await touch.goto("http://127.0.0.1:4180" + prefix);
  await touch.getByRole("button", { name: "Continue to operations" }).click();
  await touch
    .getByRole("button", { name: "NEW OPERATION" })
    .waitFor({ timeout: 20000 });
  assert.ok(
    await touch
      .locator(".menu")
      .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  );
  await touch.locator("#settings-menu").tap();
  await touch.locator("#customize-touch").tap();
  assert.equal(await touch.locator(".editor-control").count(), 10);
  await touch.locator("#editor-save").tap();
  assert.equal(
    await touch.evaluate(
      () => JSON.parse(localStorage.getItem("exfil.touch-layout.v1")).version,
    ),
    1,
  );
  await touch.locator(".utility-close").tap();
  checks.push(
    "Built 800x360 menu fits and touch layout editor saves preferences",
  );
  await touch.getByRole("button", { name: "NEW OPERATION" }).tap();
  await touch.getByRole("button", { name: "PLAY OPERATION" }).tap();
  await touch.locator("#move-stick").waitFor();
  await touch.locator("#weapon-switch").tap();
  await touch.getByRole("button", { name: "Equip knife", exact: true }).tap();
  await touch.waitForFunction(
    () => document.querySelector("#ammo-value").textContent === "--",
  );
  await touch.locator("#weapon-switch img").evaluate((im) => im.decode());
  checks.push(
    "Built three-slot touch selector equips the knife and loads its icon",
  );
  await touch.getByRole("button", { name: "Ⅱ PAUSE" }).tap();
  await touch.getByRole("button", { name: "RESUME OPERATION" }).waitFor();
  checks.push("Built landscape touch HUD and pause work");
  await touch.screenshot({ path: "qa/production-mobile.png" });
  assert.deepEqual(errors, []);
  checks.push("No failed production assets or uncaught exceptions");
  console.log(checks.map((s) => "PASS " + s).join("\n"));
} catch (e) {
  errors.push(e.stack);
  process.exitCode = 1;
  console.error(e);
} finally {
  writeFileSync(
    "qa/production-" + buildFolder + "-report.json",
    JSON.stringify({ checks, errors, publiclyDeployed: false }, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
