import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTouchLayout,
  controlRect,
} from "../src/systems/touch-layout.js";
test("touch layout ignores unknown controls and sanitizes stored values", () => {
  const layout = validateTouchLayout({
    version: 1,
    opacity: 10,
    positions: {
      "move-stick": { x: -20, y: 10, size: 5 },
      unknown: { x: 1, y: 1, size: 1 },
      "touch-map": { x: NaN, y: 0.2, size: 1 },
    },
  });
  assert.deepEqual(layout, {
    version: 1,
    opacity: 1,
    positions: { "move-stick": { x: 0, y: 1, size: 1.5 } },
  });
  assert.deepEqual(
    validateTouchLayout({ version: 20 }),
    validateTouchLayout(null),
  );
});
test("custom controls stay inside the viewport with a usable touch target", () => {
  for (const [w, h] of [
    [667, 375],
    [800, 360],
    [1024, 768],
  ])
    for (const id of ["move-stick", "touch-interact", "pause-button"]) {
      const layout = validateTouchLayout({
          version: 1,
          positions: { [id]: { x: 1, y: 0, size: 0.75 } },
        }),
        r = controlRect(id, layout, w, h);
      assert.ok(
        r.x >= 8 && r.y >= 8 && r.x + r.w <= w - 8 && r.y + r.h <= h - 8,
      );
      assert.ok(r.w >= 44 && r.h >= 44);
    }
});
test("saved control centers scale with the viewport", () => {
  const layout = validateTouchLayout({
    version: 1,
    positions: { "move-stick": { x: 0.3, y: 0.5, size: 1 } },
  });
  for (const [w, h] of [
    [800, 360],
    [1200, 600],
  ]) {
    const r = controlRect("move-stick", layout, w, h);
    assert.equal(r.x + r.w / 2, w * 0.3);
    assert.equal(r.y + r.h / 2, h * 0.5);
  }
});
