import { WORLD, LAND, SURFACES, BLOCKS, MISSION } from "../data/mission.js";
import { insidePolygon, onGround } from "./geometry.js";
const colors = {
  water: "#102c38",
  sand: "#7b8274",
  earth: "#505e4f",
  road: "#727869",
  ink: "#17292d",
};
function polygon(c, points) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}
export function paintWorld(scene) {
  const texture = scene.textures.createCanvas(
      "island",
      WORLD.width,
      WORLD.height,
    ),
    c = texture.getContext();
  const picture = (name) =>
    scene.textures.exists(name)
      ? scene.textures.get(name).getSourceImage()
      : null;
  const pattern = (name, fallback) => {
    const im = picture("terrain-" + name);
    return im ? c.createPattern(im, "repeat") : fallback;
  };
  let seed = 714;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const sea = c.createLinearGradient(0, 0, WORLD.width, WORLD.height);
  sea.addColorStop(0, "#0a2633");
  sea.addColorStop(0.48, "#143a48");
  sea.addColorStop(1, "#061d2c");
  c.fillStyle = sea;
  c.fillRect(0, 0, WORLD.width, WORLD.height);
  for (let i = 0; i < 1800; i++) {
    let x = random() * WORLD.width,
      y = random() * WORLD.height;
    c.strokeStyle = `rgba(87,143,154,${random() * 0.15 + 0.03})`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 5 + random() * 32, y - 1);
    c.stroke();
  }
  // Coastal shelves are drawn beneath the trace of the original Mon silhouette.
  for (const points of LAND) {
    polygon(c, points);
    c.lineJoin = "round";
    for (const [width, color] of [
      [100, "#1e424a"],
      [67, "#34504e"],
      [35, "#7a806e"],
    ]) {
      c.lineWidth = width;
      c.strokeStyle = color;
      c.stroke();
    }
    c.fillStyle = pattern("grass", colors.earth);
    c.fill();
    c.fillStyle = "rgba(28,48,43,.27)";
    c.fill();
    c.strokeStyle = "#b4b79a";
    c.lineWidth = 2;
    c.stroke();
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let n = 0; n < length; n += 14) {
        const t = n / length,
          x = a[0] + (b[0] - a[0]) * t,
          y = a[1] + (b[1] - a[1]) * t;
        c.fillStyle = ["#626f65", "#79836e", "#56655d"][
          Math.floor(random() * 3)
        ];
        c.beginPath();
        c.ellipse(
          x + (random() - 0.5) * 14,
          y + (random() - 0.5) * 14,
          3 + random() * 6,
          2 + random() * 4,
          random() * 3,
          0,
          7,
        );
        c.fill();
      }
    }
  }
  for (let i = 0; i < 9000; i++) {
    const x = random() * WORLD.width,
      y = random() * WORLD.height;
    if (!LAND.some((p) => insidePolygon(x, y, p))) continue;
    c.fillStyle =
      random() > 0.5 ? "rgba(187,188,142,.07)" : "rgba(19,38,34,.12)";
    const size = random() * 2 + 1;
    c.fillRect(x, y, size, size);
  }
  // The settlement yard and worn footpaths connect the first contract's locations.
  c.fillStyle = pattern("concrete", "#687366");
  c.fillRect(660, 667, 420, 170);
  c.fillStyle = "rgba(23,43,46,.23)";
  c.fillRect(660, 667, 420, 170);
  c.strokeStyle = "rgba(203,200,166,.16)";
  c.lineWidth = 2;
  c.strokeRect(665, 672, 410, 160);
  const path = (points, width, color) => {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.strokeStyle = color;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = width;
    c.stroke();
  };
  path(
    [
      [490, 1320],
      [570, 1240],
      [610, 1120],
      [650, 1000],
      [700, 920],
      [720, 810],
      [780, 725],
      [1030, 725],
    ],
    56,
    pattern("sand", "#788071"),
  );
  path(
    [
      [570, 1215],
      [385, 1180],
      [405, 1055],
      [465, 970],
      [445, 895],
      [433, 740],
      [520, 665],
      [622, 630],
    ],
    25,
    "#727e69",
  );
  path(
    [
      [625, 430],
      [700, 400],
      [900, 395],
      [900, 345],
    ],
    30,
    "#77806b",
  );
  c.setLineDash([9, 14]);
  path(
    [
      [610, 1120],
      [650, 1000],
      [700, 920],
      [720, 810],
      [780, 725],
      [1030, 725],
    ],
    1,
    "rgba(211,203,155,.26)",
  );
  c.setLineDash([]);
  for (const r of SURFACES) {
    c.fillStyle = "#172b2c";
    c.fillRect(r.x + 7, r.y + 9, r.w, r.h);
    c.fillStyle = "#786f59";
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = "#4e5249";
    c.lineWidth = 2;
    for (let y = r.y + 5; y < r.y + r.h; y += 11) {
      c.beginPath();
      c.moveTo(r.x, y);
      c.lineTo(r.x + r.w, y);
      c.stroke();
    }
    c.strokeStyle = "#9d9a7c";
    c.strokeRect(r.x + 3, r.y, r.w - 6, r.h);
  }
  // Soft tree clusters sit outside the traversable corridors and never imply collision.
  for (const [cx, cy] of [
    [510, 700],
    [450, 1235],
    [1010, 440],
    [565, 330],
    [1075, 370],
    [1340, 860],
    [1440, 870],
    [1570, 1210],
    [700, 340],
  ]) {
    if (picture("prop-tree2")) {
      for (let i = 0; i < 4; i++) {
        const x = cx + (random() - 0.5) * 50,
          y = cy + (random() - 0.5) * 50;
        c.globalAlpha = 0.25;
        c.drawImage(picture("prop-tree2"), x - 25, y - 23, 68, 68);
        c.globalAlpha = 1;
        c.drawImage(picture("prop-tree2"), x - 33, y - 33, 65, 65);
      }
      continue;
    }
    for (let i = 0; i < 12; i++) {
      const x = cx + (random() - 0.5) * 55,
        y = cy + (random() - 0.5) * 65,
        r = 8 + random() * 13;
      c.fillStyle = "rgba(13,30,28,.25)";
      c.beginPath();
      c.ellipse(x + 6, y + 8, r, r * 0.7, 0, 0, 7);
      c.fill();
      c.fillStyle = ["#344e40", "#3c5642", "#47604a"][i % 3];
      c.beginPath();
      c.arc(x, y, r, 0, 7);
      c.fill();
      c.fillStyle = "rgba(141,163,110,.18)";
      c.beginPath();
      c.arc(x - 3, y - 4, r * 0.5, 0, 7);
      c.fill();
    }
  }
  for (const r of BLOCKS) {
    c.fillStyle = "rgba(7,20,22,.45)";
    c.fillRect(r.x + 9, r.y + 13, r.w, r.h);
    const container = r.kind === "container",
      crate = r.kind === "crate";
    if (r.kind === "truck" && picture("prop-truck")) {
      c.drawImage(picture("prop-truck"), r.x, r.y, r.w, r.h);
      continue;
    }
    c.fillStyle = container
      ? r.label === "FUEL"
        ? "#626b54"
        : "#596e70"
      : crate
        ? "#777552"
        : "#40545a";
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = "#253d40";
    c.lineWidth = 4;
    c.strokeRect(r.x, r.y, r.w, r.h);
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = pattern(
      container ? "metal" : crate ? "crate" : "stone",
      "transparent",
    );
    c.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    c.restore();
    c.strokeStyle = container ? "#80918b" : "#687a79";
    c.lineWidth = 2;
    if (container) {
      for (let x = r.x + 8; x < r.x + r.w - 4; x += 9) {
        c.beginPath();
        c.moveTo(x, r.y + 5);
        c.lineTo(x, r.y + r.h - 5);
        c.stroke();
      }
    } else if (crate) {
      c.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
      c.beginPath();
      c.moveTo(r.x + 6, r.y + 6);
      c.lineTo(r.x + r.w - 6, r.y + r.h - 6);
      c.moveTo(r.x + r.w - 6, r.y + 6);
      c.lineTo(r.x + 6, r.y + r.h - 6);
      c.stroke();
    } else {
      if (picture("prop-roof") && r.kind === "building") {
        c.drawImage(picture("prop-roof"), r.x + 3, r.y + 3, r.w - 6, r.h - 6);
        c.fillStyle = "rgba(10,28,33,.32)";
        c.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      }
      c.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
      if (r.w > 140) {
        c.fillStyle = "#20383e";
        c.fillRect(r.x + 25, r.y + 22, 35, 20);
        c.strokeStyle = "#849b99";
        c.strokeRect(r.x + 25, r.y + 22, 35, 20);
        c.fillStyle = "#182e34";
        c.fillRect(r.x + r.w - 49, r.y + 20, 28, 26);
        c.strokeStyle = "#4f6b70";
        for (let y = r.y + 23; y < r.y + 43; y += 4) {
          c.beginPath();
          c.moveTo(r.x + r.w - 46, y);
          c.lineTo(r.x + r.w - 24, y);
          c.stroke();
        }
      }
    }
    if (r.label) {
      c.save();
      c.font = `${container ? 10 : 9}px monospace`;
      c.textAlign = "center";
      c.fillStyle = "#c2c8af";
      c.fillText(r.label, r.x + r.w / 2, r.y + r.h / 2 + 4);
      c.restore();
    }
  }
  // Small dressing: drainage, hazard chevrons, bollards and pier lights.
  for (let x = 685; x < 1060; x += 38) {
    c.fillStyle = "rgba(215,206,151,.40)";
    c.fillRect(x, 687, 17, 3);
  }
  for (const r of BLOCKS.filter((r) => r.kind === "building")) {
    c.fillStyle = "#c3b57d";
    c.fillRect(r.x + r.w / 2 - 9, r.y + r.h + 2, 18, 3);
    c.fillStyle = "rgba(231,192,107,.09)";
    c.beginPath();
    c.moveTo(r.x + r.w / 2 - 9, r.y + r.h);
    c.lineTo(r.x + r.w / 2 - 35, r.y + r.h + 42);
    c.lineTo(r.x + r.w / 2 + 35, r.y + r.h + 42);
    c.lineTo(r.x + r.w / 2 + 9, r.y + r.h);
    c.fill();
  }
  c.strokeStyle = "#293e3e";
  c.lineWidth = 3;
  for (const [x, y, len] of [
    [800, 565, 190],
    [475, 722, 165],
    [620, 215, 230],
  ]) {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len, y);
    c.stroke();
    c.fillStyle = "#adb19a";
    for (let n = 0; n <= len; n += 26) c.fillRect(x + n, y - 4, 3, 9);
  }
  for (const [x, y] of [
    [445, 1310],
    [535, 1310],
    [445, 1395],
    [535, 1395],
  ]) {
    c.fillStyle = "#1e3536";
    c.beginPath();
    c.arc(x, y, 5, 0, 7);
    c.fill();
  }
  c.fillStyle = "#172f32";
  c.beginPath();
  c.ellipse(487, 1424, 27, 52, -0.08, 0, 7);
  c.fill();
  c.strokeStyle = "#667f79";
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = "#334b4c";
  c.fillRect(471, 1407, 30, 33);
  // Lighthouse: recognizable offshore landmark, scenery for Chapter 1.
  c.fillStyle = "#263c3c";
  c.beginPath();
  c.arc(1694, 1180, 42, 0, 7);
  c.fill();
  c.strokeStyle = "#9eaa9a";
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = "#9aa69a";
  c.beginPath();
  c.arc(1694, 1180, 23, 0, 7);
  c.fill();
  c.fillStyle = "#263c40";
  c.beginPath();
  c.arc(1694, 1180, 14, 0, 7);
  c.fill();
  c.fillStyle = "#de785d";
  c.beginPath();
  c.arc(1694, 1180, 6, 0, 7);
  c.fill();
  // Ridge routes and signal hardware follow the reference's stepped rocky geography.
  c.strokeStyle = "#bbc4a22a";
  c.lineWidth = 3;
  c.setLineDash([10, 8]);
  for (const inset of [0, 18, 36]) {
    c.beginPath();
    c.moveTo(1340 + inset, 960 - inset);
    c.lineTo(1410 + inset, 825 - inset / 2);
    c.lineTo(1580 + inset, 810 - inset / 3);
    c.stroke();
  }
  c.setLineDash([]);
  c.fillStyle = "#81958b";
  c.fillRect(1764, 916, 12, 28);
  c.strokeStyle = "#b5c9b5";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(1770, 890);
  c.lineTo(1770, 936);
  c.moveTo(1755, 900);
  c.lineTo(1785, 900);
  c.stroke();
  c.fillStyle = "#4b686e";
  c.fillRect(1579, 994, 32, 22);
  c.fillStyle = "#7fdac7";
  c.fillRect(1583, 998, 24, 7);
  c.strokeStyle = "#a8ae9670";
  c.lineWidth = 2;
  for (let n = 0; n < 8; n++) {
    c.beginPath();
    c.moveTo(1380 + n * 18, 1200);
    c.lineTo(1380 + n * 18, 1212);
    c.stroke();
  }
  c.font = "11px monospace";
  c.fillStyle = "rgba(224,231,205,.55)";
  c.textAlign = "center";
  for (const [label, x, y] of [
    ["A / LANDING COAST", 590, 1275],
    ["C / CARGO SHORE", 735, 555],
    ["D / RESTRICTED BLACKSITE", 775, 220],
    ["TIDAL CHANNEL", 770, 530],
    ["B / LIGHTHOUSE RIDGE", 1600, 1385],
  ])
    c.fillText(label, x, y);
  texture.refresh();
  scene.add.image(0, 0, "island").setOrigin(0).setDepth(-100);
  return texture;
}
export function mapSVG({
  route = false,
  recon = null,
  annotations = false,
} = {}) {
  const points = (p) => p.map((v) => v.join(",")).join(" ");
  return `<svg viewBox="240 120 1640 1340" role="img" aria-label="Mon Breakwater Island tactical map"><defs><pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 100" fill="none" stroke="#6b9093" stroke-opacity=".12" stroke-width="2"/></pattern></defs><rect x="0" y="0" width="1900" height="1460" fill="#11292f"/><rect width="1900" height="1460" fill="url(#grid)"/>${recon ? `<image class="recon-texture" href="${recon}" x="0" y="0" width="1900" height="1460"/>` : `${LAND.map((p) => `<polygon points="${points(p)}" fill="#344a42" stroke="#708578" stroke-width="5"/>`).join("")}${SURFACES.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#809187"/>`).join("")}${BLOCKS.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#1c3539" stroke="#73867b" stroke-width="2"/>`).join("")}`}${route ? '<path d="M570 1215 L650 1000 L720 820 L995 770" fill="none" stroke="#b9b895" stroke-dasharray="9 14" stroke-width="4"/>' : ""}<circle cx="995" cy="770" r="16" fill="#d4bb7c"/><circle cx="1595" cy="1005" r="16" fill="#7bc9cb"/><circle cx="490" cy="1360" r="19" fill="none" stroke="#67c3b8" stroke-width="6"/><g fill="#acbbb2" font-family="monospace" font-size="26" letter-spacing="3"><text x="620" y="165">NORTH FORT</text><text x="810" y="960">SETTLEMENT</text><text x="1350" y="1380">B / LIGHTHOUSE</text></g><path d="M1615 1205v60m-30-30h60" stroke="#b58065" stroke-width="5"/>${annotations ? '<g class="recon-labels" font-family="monospace" font-size="22" fill="#dbe5ce"><path d="M995 770L1080 690H1190M490 1360L575 1390H800M1595 1005L1490 925H1340" stroke="#b7c9ab" stroke-width="2" fill="none"/><text x="1080" y="675">01 / MANIFEST</text><text x="590" y="1420">SAFEHOUSE DOCK</text><text x="1340" y="908">02 / RADIO LOGS</text></g>' : ""}<g id="map-actors"></g></svg>`;
}
