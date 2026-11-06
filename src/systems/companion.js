import { TacticalActor } from "./actor.js";
import {
  distance,
  clearSight,
  findPath,
  moveActor,
  canStand,
} from "./geometry.js";
export class Companion {
  constructor(scene, index) {
    this.scene = scene;
    this.index = index;
    this.name = index ? "SPECTRE" : "DOC";
    this.x = scene.player.x + (index ? 32 : -32);
    this.y = scene.player.y - 40;
    this.hp = 80;
    this.kit = 1;
    this.state = "FOLLOW";
    this.angle = 0;
    this.cooldown = 1;
    this.path = [];
    this.repath = 0;
    this.stuck = 0;
    this.muzzle = 0;
    this.sprite = new TacticalActor(scene, this.x, this.y, {
      skin: index ? "ct1" : "ct2",
      friendly: true,
    });
    this.label = scene.add
      .text(this.x, this.y - 30, this.name, {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#98d9c0",
        backgroundColor: "#10242b",
        padding: { x: 3, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(25);
  }
  safePoint(target) {
    for (const [dx, dy] of [
      [this.index ? 18 : -18, this.index ? 28 : -28],
      [this.index ? 25 : -25, 0],
      [0, 0],
      [-35, 0],
      [35, 0],
      [0, 35],
      [0, -35],
    ])
      if (canStand(target.x + dx, target.y + dy))
        return { x: target.x + dx, y: target.y + dy };
    return null;
  }
  reposition(target) {
    const p = this.safePoint(target);
    if (p) {
      this.x = p.x;
      this.y = p.y;
      this.path = [];
      this.repath = 0;
      this.stuck = 0;
    }
  }
  update(dt) {
    if (this.hp <= 0) return;
    const s = this.scene,
      p = s.player;
    this.cooldown -= dt;
    this.repath -= dt;
    this.muzzle = Math.max(0, this.muzzle - dt);
    const threats = s.enemies.filter(
      (e) =>
        e.hp > 0 &&
        distance(this, e) < 310 &&
        clearSight(this, e) &&
        (e.state === "ENGAGE" || e.suspicion > 0.6),
    );
    const targetEnemy = threats.sort(
      (a, b) => distance(this, a) - distance(this, b),
    )[0];
    const unsafe = s.enemies.some(
      (e) =>
        e.hp > 0 &&
        e.state === "ENGAGE" &&
        distance(e, p) < 220 &&
        clearSight(e, p),
    );
    let goal = { x: p.x + (this.index ? 48 : -48), y: p.y + 62 },
      speed = p.quiet ? 105 : 185;
    this.state = "FOLLOW";
    if (
      p.downed &&
      this.kit > 0 &&
      p.revives < 1 &&
      !unsafe &&
      s.companions.find((a) => a.hp > 0 && a.kit > 0) === this
    ) {
      this.state = "REVIVE";
      goal = p;
      if (distance(this, p) < 60) {
        s.reviveProgress += dt;
        if (s.reviveProgress >= 3.5) {
          this.kit--;
          s.revivePlayer(this.name);
        }
        goal = null;
      }
    } else if (targetEnemy) {
      if (this.state !== "COVER") s.audio.voice("cover", { priority: 1 });
      this.state = "COVER";
      this.angle = Math.atan2(targetEnemy.y - this.y, targetEnemy.x - this.x);
      if (distance(this, p) < 180) goal = null;
      if (this.cooldown <= 0) {
        targetEnemy.damage(18);
        this.cooldown = 0.65;
        this.muzzle = 0.07;
        s.tracers.push({
          from: { x: this.x, y: this.y },
          to: { x: targetEnemy.x, y: targetEnemy.y },
          ttl: 0.08,
        });
        s.audio.play("shot", { weapon: "m4" });
      }
    }
    if (goal && !canStand(goal.x, goal.y)) goal = this.safePoint(p);
    const old = { x: this.x, y: this.y };
    if (goal && distance(this, goal) > 28) {
      if (this.repath <= 0) {
        this.path = findPath(this, goal);
        this.repath = 0.8;
      }
      let next = this.path[0];
      if (next && distance(this, next) < 8) {
        this.path.shift();
        next = this.path[0];
      }
      if (next) {
        const a = Math.atan2(next.y - this.y, next.x - this.x);
        moveActor(this, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt);
        if (this.state !== "COVER") this.angle = a;
      }
      if (distance(old, this) < 0.2) this.stuck += dt;
      else this.stuck = 0;
      if (this.stuck > 3 || distance(this, p) > 650) {
        this.reposition({ x: p.x + (this.index ? 35 : -35), y: p.y + 45 });
        s.radio(this.name, "Reforming on your position.");
      }
    }
    for (const other of s.companions) {
      if (other === this || other.hp <= 0) continue;
      const d = distance(this, other);
      if (d < 25) {
        const a =
          d < 1
            ? this.index
              ? Math.PI / 2
              : -Math.PI / 2
            : Math.atan2(this.y - other.y, this.x - other.x);
        moveActor(this, Math.cos(a) * 35 * dt, Math.sin(a) * 35 * dt);
      }
    }
    this.sprite.update(
      this.x,
      this.y,
      this.angle,
      distance(old, this) > 0.2,
      dt,
      { firing: this.muzzle > 0 },
    );
    this.label
      .setPosition(this.x, this.y - 29)
      .setText(this.name + " / " + this.state);
  }
  damage(amount) {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.sprite.setTintFill();
    if (this.hp <= 0) {
      this.state = "KIA";
      this.sprite.kill(this.angle);
      this.label.setText(this.name + " / DOWN").setColor("#d68d76");
    }
  }
}
