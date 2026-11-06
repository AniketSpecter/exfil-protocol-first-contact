import { distance, clearSight, findPath, moveActor } from "./geometry.js";
import { TacticalActor } from "./actor.js";
import { BLOCKS } from "../data/mission.js";
import { canStand } from "./geometry.js";
import { WEAPONS } from "../data/weapons.js";
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export class Enemy {
  constructor(scene, id, patrol) {
    this.scene = scene;
    this.id = id;
    this.patrol = patrol.map(([x, y]) => ({ x, y }));
    Object.assign(this, this.patrol[0]);
    this.state = "PATROL";
    this.hp = 100;
    this.point = 1;
    this.angle = 0;
    this.suspicion = 0;
    this.cooldown = 1 + id * 0.3;
    this.lost = 0;
    this.path = [];
    this.repath = 0;
    this.weapon = ["ak47", "m4", "usp"][id % 3];
    this.sprite = new TacticalActor(scene, this.x, this.y, {
      skin: ["t1", "t2", "t3"][id % 3],
      weapon: WEAPONS[this.weapon].texture,
    });
    this.muzzle = 0;
    this.label = scene.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#efd39a",
        backgroundColor: "#172629",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(20);
  }
  hear(position, kind = "noise") {
    if (this.hp <= 0) return;
    if (this.state === "ENGAGE" && kind === "noise") return;
    if (this.state !== "INVESTIGATE")
      this.scene.audio.voice("enemySearch", {
        position: this,
        listener: this.scene.player,
      });
    this.lastKnown = { x: position.x, y: position.y };
    this.state = "INVESTIGATE";
    this.lost = 0;
    this.repath = 0;
    if (kind === "radio") this.suspicion = 1;
  }
  update(dt) {
    if (this.hp <= 0) return;
    const s = this.scene,
      p = s.player,
      d = distance(this, p),
      angleTo = Math.atan2(p.y - this.y, p.x - this.x);
    const aware = this.state === "ENGAGE",
      inCone = Math.abs(angleDelta(angleTo, this.angle)) < 0.7;
    const range =
      (p.quiet ? 205 : 270) *
      (s.surveillanceOff ? 0.72 : 1) *
      (this.role === "RIFLEMAN" ? 1.12 : 1);
    const sees =
      d < range && (aware || inCone || d < 76) && clearSight(this, p);
    this.cooldown -= dt;
    this.repath -= dt;
    if (sees) {
      this.lastKnown = { x: p.x, y: p.y };
      this.lost = 0;
      this.suspicion = Math.min(1, this.suspicion + dt * (d < 100 ? 2 : 0.9));
      if (this.suspicion >= 1) {
        if (this.state !== "ENGAGE") {
          s.audio.play("alert");
          s.audio.voice("enemyContact", {
            priority: 2,
            position: this,
            listener: p,
          });
          s.radio(
            "RELAY",
            "Contact. Break line of sight; they will search your last position.",
          );
        }
        this.state = "ENGAGE";
        s.raid.quiet = false;
      } else this.state = "SUSPICIOUS";
    } else {
      this.suspicion = Math.max(0, this.suspicion - dt * 0.22);
      this.lost += dt;
      if (this.state === "ENGAGE" && this.lost > 0.9) {
        this.state = "INVESTIGATE";
        this.repath = 0;
        s.audio.voice("enemyLost", { position: this, listener: p });
      }
      if (this.state === "SUSPICIOUS" && this.lost > 1.5) this.state = "PATROL";
    }
    let target,
      speed = 67;
    if (this.state === "ENGAGE") {
      this.angle = angleTo;
      if (d > 175) target = this.lastKnown;
      if (this.role === "RIFLEMAN" && this.hp < 80) {
        if (!this.coverGoal) {
          const candidates = BLOCKS.flatMap((r) => [
            { x: r.x - 22, y: r.y + r.h / 2 },
            { x: r.x + r.w + 22, y: r.y + r.h / 2 },
            { x: r.x + r.w / 2, y: r.y - 22 },
            { x: r.x + r.w / 2, y: r.y + r.h + 22 },
          ]).filter(
            (c) =>
              canStand(c.x, c.y) &&
              distance(this, c) < 180 &&
              !clearSight(c, p),
          );
          this.coverGoal = candidates.sort(
            (a, b) => distance(this, a) - distance(this, b),
          )[0];
        }
        if (this.coverGoal && distance(this, this.coverGoal) > 20) {
          target = this.coverGoal;
          speed = 85;
        }
      }
      if (sees && this.cooldown <= 0) {
        s.enemyShoot(this);
        this.cooldown = 1.25 + Math.random() * 0.45;
      }
    } else if (this.state === "INVESTIGATE") {
      target = this.lastKnown;
      speed = 88;
      if (target && distance(this, target) < 35) {
        this.angle += dt * 0.7;
        if (this.lost > 5) {
          this.state = "RETURN";
          this.repath = 0;
        }
      }
      if (this.lost > 10) {
        this.state = "RETURN";
        this.coverGoal = null;
        this.repath = 0;
      }
    } else if (this.state === "SUSPICIOUS") {
      this.angle = angleTo;
    } else {
      target = this.patrol[this.point];
      if (distance(this, target) < 24) {
        this.point = (this.point + 1) % this.patrol.length;
        target = this.patrol[this.point];
        this.repath = 0;
        this.state = "PATROL";
      }
    }
    const oldX = this.x,
      oldY = this.y;
    if (target && distance(this, target) > 20) {
      if (this.repath <= 0) {
        this.path = findPath(this, target);
        this.repath = 1.2;
      }
      if (this.path.length) {
        let next = this.path[0];
        if (distance(this, next) < 8) {
          this.path.shift();
          next = this.path[0];
        }
        if (next) {
          const angle = Math.atan2(next.y - this.y, next.x - this.x);
          moveActor(
            this,
            Math.cos(angle) * speed * dt,
            Math.sin(angle) * speed * dt,
            12,
          );
          if (this.state !== "ENGAGE") this.angle = angle;
        }
      }
    }
    const moving = Math.hypot(this.x - oldX, this.y - oldY) > 0.1;
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.sprite.update(this.x, this.y, this.angle, moving, dt, {
      firing: this.muzzle > 0,
    });
    const label =
      this.state === "ENGAGE"
        ? "! CONTACT"
        : this.suspicion > 0.1
          ? "? " + Math.round(this.suspicion * 100) + "%"
          : this.state === "INVESTIGATE"
            ? "SEARCH"
            : "";
    this.label
      .setPosition(this.x, this.y - 36)
      .setText(label)
      .setVisible(d < 420 && !!label);
  }
  damage(amount) {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.sprite.setTintFill();
    if (this.hp === 0) {
      this.label.setText("").setVisible(false);
      this.sprite.kill(this.angle);
      this.sprite.gun.setVisible(false);
      this.scene.dropEnemyWeapon(this);
      this.scene.audio.play("confirm");
      this.scene.audio.voice("kill", { priority: 1 });
      this.scene.raid.kills++;
    } else this.hear(this.scene.player);
  }
}
