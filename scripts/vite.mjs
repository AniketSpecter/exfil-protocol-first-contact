// Vite treats # in Windows roots as a URL fragment. Use an OS temporary junction
// to the SAME project, without moving/copying the user's files or adding a drive.
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { existsSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let root = project;
if (project.includes("#")) {
  root = join(
    tmpdir(),
    "exfil-web-" +
      createHash("sha256").update(project).digest("hex").slice(0, 12),
  );
  if (!existsSync(root))
    symlinkSync(
      project,
      root,
      process.platform === "win32" ? "junction" : "dir",
    );
  console.log("Using safe development path:", root);
  const child = spawn(
    process.execPath,
    [
      "--preserve-symlinks",
      "--preserve-symlinks-main",
      join(root, "scripts", "vite.mjs"),
      ...process.argv.slice(2),
    ],
    { cwd: root, stdio: "inherit", windowsHide: true },
  );
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  process.exit(code);
}
const { createServer, build, preview } = await import("vite");
const { default: config } = await import("../vite.config.js");
const portable = process.argv.includes("--portable");
const ownerMedia = !portable && existsSync(join(root, "public/assets/game/catalog.json"));
const options = {
  ...config,
  root,
  configFile: false,
  resolve: { preserveSymlinks: true },
  define: { __OWNER_MEDIA__: JSON.stringify(ownerMedia) },
  build: { ...config.build, outDir: portable ? "dist-portable" : "dist" },
};
const hostIndex = process.argv.indexOf("--host");
if (hostIndex >= 0) {
  const host = process.argv[hostIndex + 1] || "0.0.0.0";
  options.server = { ...options.server, host };
  options.preview = { ...options.preview, host };
}
const mode = process.argv[2] || "dev";
if (mode === "build") {
  await build(options);
  const outputRoot = resolve(root, options.build.outDir);
  for (const name of ["characters", "owner", ...(portable ? ["game"] : [])]) {
    const target = join(outputRoot, "assets", name);
    if (existsSync(target)) {
      const actualRoot = realpathSync(outputRoot),
        actualTarget = realpathSync(target);
      if (
        !actualTarget.startsWith(actualRoot + "\\") &&
        !actualTarget.startsWith(actualRoot + "/")
      )
        throw Error("Refusing to remove asset directory outside build output");
      rmSync(target, { recursive: true, force: true });
    }
  }
} else if (mode === "preview") {
  const server = await preview(options);
  server.printUrls();
} else {
  const server = await createServer(options);
  await server.listen();
  server.printUrls();
}
