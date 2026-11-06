import { LAND, SURFACES, BLOCKS, WORLD } from "../data/mission.js";
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i],
      [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export const inRect = (x, y, r, pad = 0) =>
  x >= r.x - pad &&
  x <= r.x + r.w + pad &&
  y >= r.y - pad &&
  y <= r.y + r.h + pad;
export const onGround = (x, y) =>
  LAND.some((p) => insidePolygon(x, y, p)) ||
  SURFACES.some((r) => inRect(x, y, r));
export function canStand(x, y, radius = 12) {
  if (BLOCKS.some((r) => inRect(x, y, r, radius))) return false;
  return [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ].every(([dx, dy]) => onGround(x + dx, y + dy));
}
export function moveActor(actor, dx, dy, radius = 12) {
  // Small substeps prevent walking through thin cover on slow frames.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
  for (let n = 0; n < steps; n++) {
    if (canStand(actor.x + dx / steps, actor.y, radius)) actor.x += dx / steps;
    if (canStand(actor.x, actor.y + dy / steps, radius)) actor.y += dy / steps;
  }
}
export function segmentRect(a, b, r, pad = 0) {
  let lo = 0,
    hi = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - r.x + pad],
    [dx, r.x + r.w + pad - a.x],
    [-dy, a.y - r.y + pad],
    [dy, r.y + r.h + pad - a.y],
  ]) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) lo = Math.max(lo, t);
      else hi = Math.min(hi, t);
      if (lo > hi) return null;
    }
  }
  return lo;
}
export const clearSight = (a, b) =>
  !BLOCKS.some((r) => segmentRect(a, b, r) !== null);
export function rayCircle(a, b, c, radius) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    fx = a.x - c.x,
    fy = a.y - c.y;
  const aa = dx * dx + dy * dy,
    bb = 2 * (fx * dx + fy * dy),
    cc = fx * fx + fy * fy - radius * radius;
  const disc = bb * bb - 4 * aa * cc;
  if (disc < 0 || aa === 0) return null;
  const t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}
const CELL = 26;
const COLS = Math.ceil(WORLD.width / CELL),
  ROWS = Math.ceil(WORLD.height / CELL);
let grid;
function navigationGrid() {
  if (!grid)
    grid = Array.from({ length: COLS * ROWS }, (_, i) =>
      canStand(
        ((i % COLS) + 0.5) * CELL,
        (Math.floor(i / COLS) + 0.5) * CELL,
        13,
      ),
    );
  return grid;
}
function nearestCell(p) {
  const cells = navigationGrid(),
    cx = Math.floor(p.x / CELL),
    cy = Math.floor(p.y / CELL);
  for (let radius = 0; radius < 7; radius++)
    for (let y = cy - radius; y <= cy + radius; y++)
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (x >= 0 && x < COLS && y >= 0 && y < ROWS && cells[y * COLS + x])
          return y * COLS + x;
      }
  return -1;
}
export function findPath(from, to) {
  const start = nearestCell(from),
    end = nearestCell(to),
    cells = navigationGrid();
  if (start < 0 || end < 0) return [];
  const open = new Set([start]),
    came = new Map(),
    g = new Map([[start, 0]]),
    f = new Map();
  const heuristic = (id) =>
    Math.abs((id % COLS) - (end % COLS)) +
    Math.abs(Math.floor(id / COLS) - Math.floor(end / COLS));
  f.set(start, heuristic(start));
  let iterations = 0;
  while (open.size && iterations++ < 5000) {
    let current = -1,
      best = Infinity;
    for (const id of open) {
      const score = f.get(id) ?? Infinity;
      if (score < best) {
        best = score;
        current = id;
      }
    }
    if (current === end) {
      const result = [];
      let id = end;
      while (id !== start) {
        result.push({
          x: ((id % COLS) + 0.5) * CELL,
          y: (Math.floor(id / COLS) + 0.5) * CELL,
        });
        id = came.get(id);
      }
      result.reverse();
      return result;
    }
    open.delete(current);
    for (const next of [
      current - 1,
      current + 1,
      current - COLS,
      current + COLS,
    ]) {
      if (
        next < 0 ||
        next >= cells.length ||
        !cells[next] ||
        Math.abs((next % COLS) - (current % COLS)) > 1
      )
        continue;
      const score = g.get(current) + 1;
      if (score < (g.get(next) ?? Infinity)) {
        came.set(next, current);
        g.set(next, score);
        f.set(next, score + heuristic(next));
        open.add(next);
      }
    }
  }
  return [];
}
