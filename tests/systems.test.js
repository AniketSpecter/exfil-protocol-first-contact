import test from "node:test";
import assert from "node:assert/strict";
import {
  Progression,
  emptySave,
  validateSave,
  SAVE_KEY,
} from "../src/systems/progression.js";
import {
  canStand,
  clearSight,
  segmentRect,
  findPath,
  moveActor,
  onGround,
  distance,
  rayCircle,
} from "../src/systems/geometry.js";
import { MISSION, CAMPAIGN, DOCKS, LOOT } from "../src/data/mission.js";
const memory = () => ({
  value: null,
  getItem() {
    return this.value;
  },
  setItem(k, v) {
    this.value = v;
  },
});
test("missing and malformed saves recover", () => {
  assert.deepEqual(new Progression(memory()).data, emptySave());
  const storage = memory();
  storage.value = "{broken";
  const p = new Progression(storage);
  assert.deepEqual(p.data, emptySave());
  assert.equal(p.save(), true);
});
test("validates schema, sanitizes numbers, whitelists unique evidence", () => {
  assert.deepEqual(validateSave({ version: 99 }), emptySave());
  const s = validateSave({
    version: 1,
    xp: -10,
    completions: 2.9,
    evidence: ["manifest", "manifest", "fake"],
    muted: 1,
  });
  assert.equal(s.xp, 0);
  assert.equal(s.completions, 2);
  assert.equal(s.signalFilter, true);
  assert.deepEqual(s.evidence, ["manifest"]);
  assert.equal(s.muted, false);
});
test("duplicate packets cannot farm evidence XP", () => {
  const p = new Progression(memory());
  assert.equal(p.bank(["manifest", "manifest"]), 150);
  assert.equal(p.bank(["manifest"]), 0);
  assert.equal(p.data.xp, 150);
});
test("transmitted packet survives a subsequent failed raid", () => {
  const storage = memory(),
    p = new Progression(storage);
  p.bank(["manifest"]);
  p.complete({
    success: false,
    carried: ["manifest", "nightglass"],
    objectiveXP: 100,
    quiet: false,
  });
  const again = new Progression(storage);
  assert.deepEqual(again.data.evidence, ["manifest"]);
  assert.equal(again.data.completions, 0);
  assert.equal(again.data.signalFilter, false);
});
test("failed carry raid does not bank evidence", () => {
  const p = new Progression(memory());
  p.complete({
    success: false,
    carried: ["manifest"],
    objectiveXP: 100,
    quiet: true,
  });
  assert.deepEqual(p.data.evidence, []);
  assert.equal(p.data.xp, 100);
});
test("successful carry raid saves evidence and unlocks replay once", () => {
  const p = new Progression(memory()),
    raid = {
      success: true,
      carried: ["manifest"],
      objectiveXP: 100,
      quiet: true,
    };
  const result = p.complete(raid);
  assert.equal(result.totalXP, 650);
  assert.equal(p.data.xp, 650);
  assert.equal(p.data.signalFilter, true);
  assert.equal(p.data.completions, 1);
  assert.equal(p.complete(raid), null);
  assert.equal(p.data.completions, 1);
});
test("blocked storage retains session progress without throwing", () => {
  const p = new Progression({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  });
  assert.equal(p.available, false);
  p.bank(["nightglass"]);
  assert.deepEqual(p.data.evidence, ["nightglass"]);
  assert.equal(p.available, false);
});
test("save reset clears progression", () => {
  const p = new Progression(memory());
  p.bank(["manifest"]);
  p.reset();
  assert.deepEqual(p.data, emptySave());
});
test("water and roofs reject movement; objectives are reachable ground", () => {
  assert.equal(onGround(100, 100), false);
  assert.equal(canStand(500, 800), false);
  for (const p of Object.values(MISSION).filter((p) => p?.x !== undefined))
    assert.ok(canStand(p.x, p.y), JSON.stringify(p));
});
test("wall sliding uses substeps and cannot tunnel through a building", () => {
  const p = { x: 450, y: 800 };
  moveActor(p, 250, 0);
  assert.ok(p.x < 465);
  assert.ok(canStand(p.x, p.y));
});
test("cover blocks vision; adjacent clear yard does not", () => {
  assert.equal(clearSight({ x: 450, y: 800 }, { x: 700, y: 800 }), false);
  assert.equal(clearSight({ x: 700, y: 900 }, { x: 750, y: 950 }), true);
});
test("segment rectangle returns nearest impact and respects parallel rays", () => {
  const r = { x: 10, y: 10, w: 20, h: 20 };
  assert.equal(segmentRect({ x: 0, y: 20 }, { x: 40, y: 20 }, r), 0.25);
  assert.equal(segmentRect({ x: 0, y: 0 }, { x: 40, y: 0 }, r), null);
});
test("ray circle hits the intended target", () => {
  assert.ok(
    rayCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }, 10) > 0.39,
  );
  assert.equal(
    rayCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 30 }, 10),
    null,
  );
});
test("navigation reaches manifest, dock and replay relay without crossing water or roofs", () => {
  for (const target of [MISSION.intel, MISSION.extract, MISSION.fragment]) {
    const path = findPath(MISSION.spawn, target);
    assert.ok(path.length > 0);
    assert.ok(distance(path.at(-1), target) < 50);
    for (const p of path) assert.ok(canStand(p.x, p.y, 13));
    for (let i = 1; i < path.length; i++)
      assert.ok(distance(path[i - 1], path[i]) < 27);
  }
});
test("lighthouse mission is reachable from boat arrival; optional and loot are on land", () => {
  for (const target of [
    CAMPAIGN.frequency.intel,
    CAMPAIGN.frequency.optional,
    DOCKS.ridge,
  ]) {
    assert.ok(canStand(target.x, target.y));
    assert.ok(findPath(DOCKS.ridge.arrival, target).length > 0);
  }
  for (const loot of LOOT) assert.ok(canStand(loot.x, loot.y), loot.id);
  assert.equal(findPath(MISSION.spawn, CAMPAIGN.frequency.intel).length, 0);
});
test("old successful saves migrate to Mission 02 unlock", () => {
  const s = validateSave({ version: 1, xp: 600, completions: 1 });
  assert.deepEqual(s.completedMissions, ["landing"]);
});
test("banking Mission 02 evidence does not unlock it without Mission 01 completion", () => {
  const p = new Progression(memory());
  p.bank(["radioLogs", "radioLogs"]);
  assert.equal(p.data.xp, 150);
  assert.deepEqual(p.data.completedMissions, []);
});
test("unextracted valuables award no XP while successful extraction pays the recovery", () => {
  const a = new Progression(memory()),
    b = new Progression(memory());
  a.complete({ success: false, carried: [], objectiveXP: 0, valuableXP: 75 });
  b.complete({ success: true, carried: [], objectiveXP: 0, valuableXP: 75 });
  assert.equal(a.data.xp, 0);
  assert.equal(b.data.xp, 375);
});
