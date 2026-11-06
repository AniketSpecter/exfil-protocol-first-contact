import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
const root = resolve("."),
  skip = new Set([
    "node_modules",
    ".git",
    "dist",
    "dist-portable",
    "qa",
    "release",
  ]);
const findings = [],
  files = [];
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const file = resolve(dir, item.name);
    if (item.isSymbolicLink()) {
      findings.push(relative(root, file) + ": symbolic link");
      continue;
    }
    if (item.isDirectory()) walk(file);
    else files.push(file);
  }
}
walk(root);
const rules = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    "GitHub credential",
    /\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  ],
  ["service credential", /\b(?:sk-[A-Za-z0-9_-]{25,}|AKIA[A-Z0-9]{16})\b/],
  [
    "absolute workstation path",
    /\b[A-Za-z]:[\\/](?:Users|#CS|Games|Projects)[\\/]/i,
  ],
  ["private home path", /\/(?:home|Users)\/[A-Za-z0-9_.-]+\//],
  [
    "personal email",
    /\b[A-Za-z0-9._%+-]+@(?:gmail|outlook|hotmail|yahoo)\.[A-Za-z]+\b/i,
  ],
];
for (const file of files) {
  const name = relative(root, file).replaceAll("\\", "/");
  if (
    /(^|\/)(?:\.env(?:\..*)?|credentials|id_rsa|id_ed25519)$/.test(name) ||
    /\.(?:pem|key|pfx|p12|log|zip|pdf)$/i.test(name)
  )
    findings.push(name + ": excluded private/archive file type");
  if (
    /(?:assets\/(?:owner|characters)|import-owner|source_private|manifest\.json|CS2D-Readme|Military-Voice-Pack)/i.test(
      name,
    )
  )
    findings.push(name + ": excluded imported media or provenance");
  const data = readFileSync(file);
  if (name.endsWith(".png")) {
    for (let at = 8; at + 12 <= data.length; ) {
      const length = data.readUInt32BE(at),
        type = data.toString("ascii", at + 4, at + 8);
      if (["tEXt", "zTXt", "iTXt", "eXIf"].includes(type))
        findings.push(name + ": embedded text or EXIF metadata");
      at += length + 12;
    }
    continue;
  }
  if (data.includes(0)) continue;
  const text = data.toString("utf8");
  for (const [label, pattern] of rules)
    if (pattern.test(text)) findings.push(name + ": " + label);
}
const source = readFileSync(resolve(root, "scripts/vite.mjs"), "utf8");
if (!/const\s+ownerMedia\s*=\s*false\s*;/.test(source))
  findings.push("Public build must force replacement media");
for (const out of ["dist", "dist-portable"])
  if (existsSync(resolve(root, out, "assets/owner")))
    findings.push(out + ": imported game media in output");
if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Public audit passed: ${files.length} files; no matched secrets, workstation paths, imported media or PNG metadata.`,
  );
