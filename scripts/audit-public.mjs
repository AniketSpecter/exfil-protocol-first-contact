import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
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
  const approvedVoiceNotice =
    name === "docs/licenses/Military-Voice-Pack-2-License.pdf" &&
    createHash("sha256").update(readFileSync(file)).digest("hex") ===
      "303fd122b39f7150cf0e49c65fc36edf8481a351092bf6c92bfb7906266d2ff2";
  if (
    !approvedVoiceNotice &&
    (/(^|\/)(?:\.env(?:\..*)?|credentials|id_rsa|id_ed25519)$/.test(name) ||
      /\.(?:pem|key|pfx|p12|log|zip|pdf)$/i.test(name))
  )
    findings.push(name + ": excluded private/archive file type");
  if (
    !approvedVoiceNotice &&
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
if (
  !/const\s+ownerMedia\s*=\s*!portable/.test(source) ||
  !source.includes("public/assets/game/catalog.json")
)
  findings.push("Full-media build selection is missing");
const media = resolve(root, "public/assets/game");
const catalog = JSON.parse(
  readFileSync(resolve(media, "catalog.json"), "utf8"),
);
const assets = [...catalog.artwork, catalog.audio, catalog.menuMusic];
const allowed = new Set(["catalog.json", ...assets.map((a) => a.file)]);
for (const item of assets) {
  if (
    !item ||
    !item.file ||
    item.file.includes("..") ||
    item.file.startsWith("/")
  ) {
    findings.push("Invalid runtime asset entry");
    continue;
  }
  const data = readFileSync(resolve(media, item.file));
  if (
    data.length !== item.bytes ||
    createHash("sha256").update(data).digest("hex") !== item.sha256
  )
    findings.push(item.file + ": media inventory hash mismatch");
}
for (const file of files) {
  const name = relative(media, file).replaceAll("\\", "/");
  if (!name.startsWith("..") && !allowed.has(name))
    findings.push(name + ": unlisted runtime asset");
}
const mp3 = readFileSync(resolve(media, catalog.menuMusic.file));
if (
  mp3.subarray(0, 3).toString() === "ID3" ||
  mp3.subarray(-128, -125).toString() === "TAG" ||
  mp3.subarray(-32, -24).toString() === "APETAGEX"
)
  findings.push("Menu score has embedded tags");
const audio = readFileSync(resolve(media, catalog.audio.file));
for (let at = 12; at + 8 <= audio.length; ) {
  const tag = audio.toString("ascii", at, at + 4),
    length = audio.readUInt32LE(at + 4);
  if (!["fmt ", "data"].includes(tag))
    findings.push("Audio bank contains metadata: " + tag);
  at += 8 + length + (length % 2);
}
if (
  catalog.artwork.length !== 35 ||
  Object.keys(catalog.audio.cues).length !== 31
)
  findings.push("Incomplete runtime media");
for (const out of ["dist", "dist-portable"])
  if (existsSync(resolve(root, out, "assets/owner")))
    findings.push(out + ": private import folder present");
if (existsSync(resolve(root, "dist-portable/assets/game")))
  findings.push("Replacement build still contains full runtime media");
if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Public audit passed: ${files.length} files; runtime-media hashes verified; no matched secrets, workstation paths, private imports or embedded image/audio tags.`,
  );
