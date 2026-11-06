import Phaser from "phaser";
import {
  MISSION,
  WORLD,
  BLOCKS,
  CAMPAIGN,
  DOCKS,
  LOOT,
} from "../data/mission.js";
import {
  distance,
  moveActor,
  segmentRect,
  rayCircle,
  clearSight,
  canStand,
} from "../systems/geometry.js";
import { Companion } from "../systems/companion.js";
import { Enemy } from "../systems/enemy.js";
import { paintWorld } from "../systems/world.js";
import { TacticalActor } from "../systems/actor.js";
import { WEAPONS, createLoadout, createSlots } from "../data/weapons.js";

export class Raid extends Phaser.Scene {
  constructor() {
    super("Raid");
  }
  init({ ui, progression, audio, missionId = "landing", mode = "solo" }) {
    this.ui = ui;
    this.progression = progression;
    this.audio = audio;
    this.mission = CAMPAIGN[missionId] || CAMPAIGN.landing;
    this.mode = mode;
  }
  create() {
    if (this.textures.exists("island")) this.textures.remove("island");
    paintWorld(this);
    this.player = {
      ...this.mission.spawn,
      hp: 100,
      ammo: this.mission.magazine,
      reserve: this.mission.reserve,
      weapon: "m4",
      downed: false,
      revives: 0,
      selfKit: this.mode === "solo" ? 1 : 0,
      medkits: 0,
      quiet: false,
      angle: -Math.PI / 2,
    };
    this.loadout = createLoadout();
    this.player.slots = createSlots();
    this.previousWeapon = "usp";
    this.droppedWeapons = [];
    this.dropSequence = 0;
    this.stepTimer = 0;
    this.touch = {
      moveX: 0,
      moveY: 0,
      aimAngle: null,
      fire: false,
      transmit: false,
      interact: false,
      reload: false,
      quiet: false,
    };
    this.fireRequested = false;
    this.raid = {
      carried: [],
      transmitted: [],
      bankedXP: 0,
      objectiveXP: 0,
      success: false,
      quiet: true,
      settled: false,
      kills: 0,
      missionId: this.mission.id,
    };
    this.elapsed = 0;
    this.shotCooldown = 0;
    this.reload = 0;
    this.transmission = 0;
    this.extracting = false;
    this.extraction = 0;
    this.done = false;
    this.supplyUsed = false;
    this.hitMarker = 0;
    this.hurtFlash = 0;
    this.radioCooldown = 0;
    this.transmitTick = 0;
    this.tracers = [];
    this.effects = [];
    this.mapVisible = false;
    this.replay = this.progression.data.completedMissions.includes(
      this.mission.id,
    );
    this.sector = "coast";
    this.collected = new Set();
    this.reviveProgress = 0;
    this.bleedout = 0;
    this.transit = null;
    this.surveillanceOff = false;
    this.reinforced = false;
    this.ring = this.add
      .circle(this.player.x, this.player.y, 23, 0x51c9bc, 0.06)
      .setStrokeStyle(1, 0x6dd5c7, 0.65)
      .setDepth(5);
    this.playerSprite = new TacticalActor(this, this.player.x, this.player.y, {
      skin: "ct3",
      friendly: true,
    });
    this.enemies = this.mission.patrols.map(
      (path, i) =>
        new Enemy(
          this,
          i,
          this.mission.id === "landing" && this.replay && i === 2
            ? this.mission.replayPatrol
            : path,
        ),
    );
    this.companions =
      this.mode === "squad"
        ? [new Companion(this, 0), new Companion(this, 1)]
        : [];
    this.loot = LOOT.filter((l) =>
      this.mission.id === "landing"
        ? l.sector === "coast"
        : l.sector === "ridge",
    );
    this.enemies.forEach((e, i) => {
      e.role = i === 1 ? "RIFLEMAN" : "PATROL";
    });
    this.overlay = this.add.graphics().setDepth(30);
    this.markers = this.add.graphics().setDepth(4);
    const label = (x, y, text, color) =>
      this.add
        .text(x, y, text, {
          fontFamily: "monospace",
          fontSize: "11px",
          color,
          backgroundColor: "#152a2d",
          padding: { x: 6, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(3);
    this.intelLabel = label(
      this.mission.intel.x,
      this.mission.intel.y - 35,
      this.mission.id === "landing"
        ? "01 / CLASSIFIED MANIFEST"
        : "01 / ENCRYPTED RADIO LOGS",
      "#ddca91",
    );
    this.extractLabel = label(
      this.mission.extract.x,
      this.mission.extract.y - 49,
      "02 / EXTRACTION",
      "#79cdbf",
    );
    this.supplyLabel = label(
      this.mission.supply.x,
      this.mission.supply.y - 28,
      "SUPPLY",
      "#c3cfb0",
    );
    if (this.mission.id === "frequency" || this.replay)
      this.fragmentLabel = label(
        this.mission.optional.x,
        this.mission.optional.y - 30,
        this.mission.id === "frequency"
          ? "OPTIONAL / DISABLE SURVEILLANCE"
          : "OPTIONAL / MEDICAL SUPPLIES",
        "#a2d9d4",
      );
    this.keys = this.input.keyboard.addKeys({
      up: "W",
      down: "S",
      left: "A",
      right: "D",
      reload: "R",
      interact: "E",
      transmit: "T",
      quiet: "SHIFT",
      pause: "ESC",
      map: "M",
      rifle: "ONE",
      pistol: "TWO",
      knife: "THREE",
      quick: "Q",
      heal: "H",
    });
    this.input.keyboard.addCapture([
      "W",
      "A",
      "S",
      "D",
      "R",
      "E",
      "T",
      "SHIFT",
      "ESC",
      "M",
      "SPACE",
      "Q",
      "ONE",
      "TWO",
      "THREE",
    ]);
    this.input.keyboard.on("keydown-E", () => {
      if (!this.player.downed) this.touch.interact = true;
    });
    this.input.keyboard.on("keydown-Q", (e) => {
      if (!e.repeat) this.touch.quick = true;
    });
    this.input.keyboard.on("keydown-R", () => {
      this.touch.reload = true;
    });
    this.input.mouse.disableContextMenu();
    this.input.on("pointerdown", (pointer) => {
      if (pointer.leftButtonDown() && this.ui.inputMode !== "touch")
        this.fireRequested = true;
    });
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.resizeView();
    this.cameraTarget = new Phaser.Math.Vector2(this.player.x, this.player.y);
    this.cameras.main.startFollow(this.cameraTarget, true, 0.13, 0.13);
    this.scaleListener = () => this.ui.refreshMap(this);
    this.viewListener = () => this.resizeView();
    this.game.events.on("display-resized", this.viewListener);
    this.events.once("shutdown", () => {
      this.audio.boatStop();
      this.game.events.off("display-resized", this.viewListener);
      this.ui = null;
    });
    this.ui.showHUD(this);
    this.radio(
      "RELAY",
      this.mission.id === "frequency"
        ? "Dead Frequency. Take the dock boat to Lighthouse Ridge, recover the radio logs, then return to this safehouse. Scrambler Level 1 is equipped."
        : "Viper One, ashore. Recover the warehouse manifest, then return to the safehouse dock. Optional supplies are marked.",
    );
    this.audio.voice("deploy", { priority: 3 });
    if (this.ui.touchMode && this.scale.height > this.scale.width)
      this.time.delayedCall(0, () => this.pause());
  }
  resizeView() {
    this.cameras.main.setZoom(
      this.ui.touchMode
        ? Math.max(0.9, Math.min(1.35, this.scale.width / 940))
        : Math.max(1.1, Math.min(1.75, this.scale.width / 1040)),
    );
  }
  switchWeapon(id) {
    if (
      this.transmission > 0 ||
      this.transit ||
      this.done ||
      this.player.downed
    )
      return;
    const p = this.player,
      owned = Object.values(p.slots);
    id = p.slots[id] || id;
    if (!id)
      id =
        owned.includes(this.previousWeapon) && this.previousWeapon !== p.weapon
          ? this.previousWeapon
          : owned.find((w) => w !== p.weapon);
    if (!WEAPONS[id] || !owned.includes(id) || id === p.weapon) return;
    this.loadout[p.weapon] = { ammo: p.ammo, reserve: p.reserve };
    this.previousWeapon = p.weapon;
    Object.assign(p, this.loadout[id], { weapon: id });
    this.reload = 0;
    this.playerSprite.setWeapon(WEAPONS[id].texture);
    this.audio.play("switch");
  }
  spawnWeaponDrop(weapon, x, y, ammo, reserve = 0) {
    const point = [
      { x, y },
      { x: x + 24, y },
      { x: x - 24, y },
      { x, y: y + 24 },
    ].find((p) => canStand(p.x, p.y)) || { x, y };
    const drop = {
      id: "weapon-drop-" + this.dropSequence++,
      weapon,
      ...point,
      ammo,
      reserve,
      collected: false,
    };
    drop.sprite = this.add
      .image(point.x, point.y, WEAPONS[weapon].texture)
      .setScale(0.9)
      .setRotation(0.6)
      .setDepth(7);
    drop.sprite
      .setInteractive(
        new Phaser.Geom.Circle(16, 16, 26),
        Phaser.Geom.Circle.Contains,
      )
      .on("pointerdown", (pointer, x, y, event) => {
        if (
          !this.player.downed &&
          !this.done &&
          !this.transit &&
          this.transmission <= 0 &&
          distance(this.player, drop) < 46 &&
          clearSight(this.player, drop)
        ) {
          event.stopPropagation();
          this.pickWeapon(drop);
        }
      });
    drop.label = this.add
      .text(point.x, point.y - 25, WEAPONS[weapon].name, {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#d6e7be",
        backgroundColor: "#19312e",
        padding: { x: 4, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(7);
    this.droppedWeapons.push(drop);
    return drop;
  }
  dropEnemyWeapon(enemy) {
    if (enemy.dropped) return;
    enemy.dropped = true;
    const w = WEAPONS[enemy.weapon];
    this.spawnWeaponDrop(
      enemy.weapon,
      enemy.x,
      enemy.y,
      Math.ceil(w.magazine * 0.6),
      0,
    );
  }
  pickWeapon(drop) {
    if (drop.collected) return;
    drop.collected = true;
    drop.sprite?.destroy();
    drop.label?.destroy();
    const p = this.player,
      w = WEAPONS[drop.weapon],
      old = p.slots[w.slot];
    this.loadout[p.weapon] = { ammo: p.ammo, reserve: p.reserve };
    if (old === drop.weapon) {
      const rounds = drop.ammo + drop.reserve;
      if (p.weapon === old) p.reserve += rounds;
      else this.loadout[old].reserve += rounds;
    } else {
      const current = this.loadout[old];
      this.spawnWeaponDrop(old, p.x + 24, p.y, current.ammo, current.reserve);
      p.slots[w.slot] = drop.weapon;
      this.loadout[drop.weapon] = { ammo: drop.ammo, reserve: drop.reserve };
      this.switchWeapon(drop.weapon);
    }
    this.audio.play("confirm");
    this.ui.notice(
      "WEAPON RECOVERED",
      w.name +
        " / " +
        w.slot.toUpperCase() +
        " SLOT. Matching weapons add ammunition. Replaced weapons stay on the ground.",
    );
  }

  radio(speaker, message) {
    if (!this.ui) return;
    this.ui.radio(speaker, message);
  }
  pause() {
    if (this.done || this.scene.isPaused()) return;
    this.audio.boatStop();
    this.resetInput();
    this.scene.pause();
    this.ui.showPause(this);
  }
  resume() {
    this.scene.resume();
    this.ui.showHUD(this, true);
    this.input.keyboard.resetKeys();
    this.input.activePointer.reset();
    if (this.extracting || this.transit) this.audio.boatStart();
  }
  startReload() {
    const w = WEAPONS[this.player.weapon];
    if (
      w.melee ||
      this.player.downed ||
      this.reload > 0 ||
      this.player.ammo >= w.magazine ||
      this.player.reserve <= 0
    )
      return;
    this.reload = w.reload;
    this.audio.play("reload");
  }
  targetHint() {
    if (this.player.downed)
      return {
        action: "revive",
        key: "HOLD E",
        title: this.mode === "solo" ? "Self-revive" : "Await squad revive",
        detail: `${Math.ceil(this.bleedout)}s until bleed-out · one recovery per raid`,
      };
    if (
      distance(this.player, this.mission.intel) < 65 &&
      !this.raid.carried.includes(this.mission.evidence)
    )
      return {
        action: "intel",
        key: "E",
        title: "Recover " + this.mission.intelName,
        detail: "Hold the evidence or transmit it · +100 XP",
      };
    if (
      this.mission.id === "frequency" &&
      !this.surveillanceOff &&
      distance(this.player, this.mission.optional) < 60
    )
      return {
        action: "surveillance",
        key: "E",
        title: "Disable surveillance array",
        detail: "Reduce guard detection range · +100 XP",
      };
    if (distance(this.player, this.mission.supply) < 60 && !this.supplyUsed)
      return {
        action: "supply",
        key: "E",
        title: "Recover medical supplies",
        detail: "Restore 35 health · one medkit · +48 rifle rounds",
      };
    if (
      this.mission.id === "frequency" &&
      distance(this.player, DOCKS[this.sector]) < 65
    )
      return {
        action: "boat",
        key: "E",
        title: "Board coastal transport",
        detail:
          this.sector === "ridge"
            ? "Return to safehouse / extraction"
            : "Choose Lighthouse Ridge or safehouse",
      };
    if (distance(this.player, this.mission.extract) < 63)
      return {
        action: "extract",
        key: "E",
        title: this.raid.carried.includes(this.mission.evidence)
          ? "Return to safehouse"
          : "Evidence required",
        detail: this.raid.carried.includes(this.mission.evidence)
          ? "Hold this dock for 6 seconds"
          : "Recover your assigned evidence first",
      };
    const drop = this.droppedWeapons.find(
      (d) =>
        !d.collected &&
        distance(this.player, d) < 46 &&
        clearSight(this.player, d),
    );
    if (drop)
      return {
        action: "weapon",
        key: "E",
        title: "Pick up " + WEAPONS[drop.weapon].name,
        detail:
          WEAPONS[drop.weapon].slot.toUpperCase() +
          " SLOT / " +
          drop.ammo +
          " rounds. Replaces the weapon in that slot.",
        drop,
      };
    const loot = this.loot.find(
      (l) => !this.collected.has(l.id) && distance(this.player, l) < 48,
    );
    if (loot)
      return {
        action: "loot",
        key: "E",
        title: loot.name,
        detail:
          loot.kind === "valuable"
            ? "Optional recovery · +75 XP"
            : "One field pickup",
        loot,
      };

    return null;
  }
  interact() {
    const hint = this.targetHint();
    if (
      !hint ||
      this.player.downed ||
      this.done ||
      this.transit ||
      this.transmission > 0
    )
      return;
    if (hint.action === "intel") {
      this.raid.carried.push(this.mission.evidence);
      this.raid.objectiveXP += 100;
      this.audio.play("confirm");
      this.intelLabel.setText("EVIDENCE RECOVERED");
      this.audio.voice("objective", { priority: 4 });
      this.radio(
        "RELAY",
        "Evidence secured. Hold T while stationary to bank it. Sending reveals your position. Or carry it back to the safehouse.",
      );
      this.ui.notice(
        "INTEL RECOVERED",
        "Transmit and attract a search team, or carry it out unseen.",
      );
    } else if (hint.action === "surveillance") {
      this.surveillanceOff = true;
      this.raid.carried.push("surveillance");
      this.raid.objectiveXP += 100;
      this.fragmentLabel.setText("SURVEILLANCE DISABLED");
      this.radio(
        "RELAY",
        "Array is down. Their detection range is reduced. Radio logs still need recovery.",
      );
      this.audio.play("confirm");
    } else if (hint.action === "supply") {
      this.supplyUsed = true;
      this.collected.add("medical-ridge");
      this.player.hp = Math.min(100, this.player.hp + 35);
      this.player.medkits++;
      this.addRifleAmmo(48);
      this.supplyLabel.setText("CACHE EMPTY");
      this.raid.objectiveXP += 50;
      this.audio.play("reload");
      this.ui.notice(
        "MEDICAL SUPPLIES",
        "Health restored. One medkit acquired. Use the + MED button or health panel.",
      );
    } else if (hint.action === "weapon") {
      this.pickWeapon(hint.drop);
    } else if (hint.action === "loot") {
      const loot = hint.loot;
      this.collected.add(loot.id);
      if (loot.kind === "medical") this.player.medkits++;
      if (loot.kind === "ammo") this.addRifleAmmo(30);
      if (loot.kind === "weapon") {
        if (this.player.slots.primary === "m4") {
          this.addRifleAmmo(30);
          this.switchWeapon("primary");
        } else this.pickWeapon({ weapon: "m4", ammo: 30, reserve: 30 });
      }
      if (loot.kind === "valuable")
        this.raid.valuableXP = (this.raid.valuableXP || 0) + 75;
      this.audio.play("confirm");
      this.ui.notice("RECOVERED", loot.name);
    } else if (hint.action === "boat") {
      this.ui.showDestinations(this);
    } else if (
      hint.action === "extract" &&
      this.raid.carried.includes(this.mission.evidence)
    )
      this.startExtraction();
  }
  addRifleAmmo(amount) {
    const id = this.player.slots.primary;
    if (this.player.weapon === id) this.player.reserve += amount;
    else this.loadout[id].reserve += amount;
  }
  useMedkit() {
    if (this.player.downed || this.player.medkits <= 0 || this.player.hp >= 100)
      return;
    this.player.medkits--;
    this.player.hp = Math.min(100, this.player.hp + 45);
    this.audio.play("confirm");
    this.ui.notice("MEDKIT USED", "Restored up to 45 health.");
  }
  startExtraction() {
    if (
      this.extracting ||
      this.player.downed ||
      !this.raid.carried.includes(this.mission.evidence)
    )
      return;
    this.extracting = true;
    this.extraction = 0;
    this.radio(
      "DOC",
      "Safehouse transport ready. Hold this dock for six seconds.",
    );
    this.audio.voice("hold", { priority: 4 });
    this.audio.boatStart();
  }
  travel(destination) {
    if (!DOCKS[destination] || this.player.downed || this.transit) return;
    this.ui.closeDestinations(this);
    if (destination === this.sector) return;
    this.resetInput();
    this.transit = {
      destination,
      elapsed: 0,
      duration: 4.2,
      origin: this.sector,
      from: { x: this.player.x, y: this.player.y },
    };
    this.extracting = false;
    this.extraction = 0;
    this.reload = 0;
    this.transmission = 0;
    this.audio.boatStart();
    this.ui.notice(
      "COASTAL TRANSIT",
      "All surviving operators are aboard. Health, ammo and evidence retained.",
    );
  }
  resetInput() {
    this.input.keyboard.resetKeys();
    this.input.activePointer.reset();
    Object.assign(this.touch, {
      moveX: 0,
      moveY: 0,
      fire: false,
      transmit: false,
      interact: false,
      reload: false,
      quick: false,
      revive: false,
    });
    this.fireRequested = false;
  }
  revivePlayer(by) {
    if (!this.player.downed || this.player.revives >= 1) return;
    this.player.downed = false;
    this.player.revives++;
    this.player.hp = 45;
    this.reviveProgress = 0;
    this.bleedout = 0;
    this.ui.notice(
      "OPERATOR REVIVED",
      by + " restored 45 health. No further recovery this raid.",
    );
    this.radio(by, "Back on your feet. Use cover.");
  }
  updateDowned(dt) {
    const p = this.player;
    this.bleedout -= dt;
    for (const enemy of this.enemies) enemy.update(dt);
    for (const effect of this.effects) effect.ttl -= dt;
    for (const effect of this.effects.filter((e) => e.ttl <= 0)) {
      const victim = effect.victim;
      if (
        victim &&
        victim !== p &&
        victim.hp > 0 &&
        distance(victim, effect.point) < 19 &&
        clearSight(effect.from, victim)
      )
        victim.damage(11);
    }
    this.effects = this.effects.filter((e) => e.ttl > 0);
    const unsafe = this.enemies.some(
      (e) =>
        e.hp > 0 &&
        e.state === "ENGAGE" &&
        distance(e, p) < 190 &&
        clearSight(e, p),
    );
    const held = this.keys.interact.isDown || this.touch.revive;
    if (this.mode === "solo" && p.selfKit > 0 && held && !unsafe) {
      this.reviveProgress += dt;
      if (this.reviveProgress >= 4) {
        p.selfKit--;
        this.revivePlayer("SELF-REVIVE");
      }
    } else if (this.mode === "solo" || unsafe) this.reviveProgress = 0;
    for (const ally of this.companions) ally.update(dt);
    if (!p.downed) {
      this.ui.updateHUD(this, true);
      return;
    }
    if (
      this.bleedout <= 0 ||
      (this.mode === "squad" &&
        !this.companions.some((a) => a.hp > 0 && a.kit > 0))
    )
      this.finish(false);
    if (!this.done) this.ui.updateHUD(this, true);
  }
  hasUnbanked() {
    return this.raid.carried.some((id) => !this.raid.transmitted.includes(id));
  }
  update(time, delta) {
    if (this.done) return;
    const dt = Math.min(delta / 1000, 0.045),
      p = this.player;
    if (this.transit) {
      this.transit.elapsed += dt;
      this.ui.updateHUD(this, true);
      if (this.transit.elapsed >= this.transit.duration) {
        this.sector = this.transit.destination;
        Object.assign(p, DOCKS[this.sector].arrival);
        for (const ally of this.companions)
          if (ally.hp > 0)
            ally.reposition({ x: p.x + (ally.index ? 32 : -32), y: p.y + 30 });
        this.cameraTarget.set(p.x, p.y);
        this.cameras.main.centerOn(p.x, p.y);
        this.transit = null;
        document.getElementById("transit-panel")?.remove();
        this.audio.boatStop();
        this.resetInput();
        this.ui.updateHUD(this, true);
        this.radio(
          "RELAY",
          this.sector === "ridge"
            ? "Lighthouse Ridge. Recover the relay logs. Surveillance array is optional."
            : "Safehouse coast. Interact with the boat and choose Return to safehouse to finish.",
        );
      }
      return;
    }
    if (p.downed) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.pause)) this.pause();
      else {
        this.elapsed += dt;
        this.updateDowned(dt);
      }
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.pause)) {
      this.pause();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.map)) {
      this.mapVisible = !this.mapVisible;
      this.ui.toggleMap(this.mapVisible);
    }
    this.elapsed += dt;
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.radioCooldown = Math.max(0, this.radioCooldown - dt);
    let dx =
        (this.keys.right.isDown ? 1 : 0) -
        (this.keys.left.isDown ? 1 : 0) +
        this.touch.moveX,
      dy =
        (this.keys.down.isDown ? 1 : 0) -
        (this.keys.up.isDown ? 1 : 0) +
        this.touch.moveY;
    const moving = Math.hypot(dx, dy) > 0.08,
      len = Math.max(1, Math.hypot(dx, dy));
    p.quiet = this.keys.quiet.isDown || this.touch.quiet;
    const speed = p.quiet
      ? this.mission.quietSpeed
      : this.mission.speed * (WEAPONS[p.weapon].speed || 1);
    moveActor(p, (dx / len) * speed * dt, (dy / len) * speed * dt);
    const pointer = this.input.activePointer,
      world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (this.ui.inputMode === "touch") {
      if (this.touch.aimAngle !== null) p.angle = this.touch.aimAngle;
    } else p.angle = Math.atan2(world.y - p.y, world.x - p.x);
    this.playerSprite.update(p.x, p.y, p.angle, moving, dt, {
      firing:
        !WEAPONS[p.weapon].melee &&
        this.shotCooldown > WEAPONS[p.weapon].cooldown - 0.045,
      reloading: this.reload > 0,
    });
    this.ring.setPosition(p.x, p.y);
    this.cameraTarget.set(p.x, p.y);
    this.stepTimer -= dt;
    if (moving && this.stepTimer <= 0) {
      this.audio.footstep({ quiet: p.quiet, wood: p.y > 1280 });
      this.stepTimer = p.quiet ? 0.52 : 0.32;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.rifle))
      this.switchWeapon("primary");
    if (Phaser.Input.Keyboard.JustDown(this.keys.pistol))
      this.switchWeapon("secondary");
    if (Phaser.Input.Keyboard.JustDown(this.keys.knife))
      this.switchWeapon("knife");
    if (Phaser.Input.Keyboard.JustDown(this.keys.quick) || this.touch.quick) {
      this.switchWeapon();
      this.touch.quick = false;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.reload) || this.touch.reload) {
      this.startReload();
      this.touch.reload = false;
    }
    if (this.reload > 0) {
      const before = this.reload;
      this.reload -= dt;
      if (
        before > WEAPONS[p.weapon].reload * 0.45 &&
        this.reload <= WEAPONS[p.weapon].reload * 0.45
      )
        this.audio.play("switch");
      if (this.reload <= 0) {
        const rounds = Math.min(WEAPONS[p.weapon].magazine - p.ammo, p.reserve);
        p.ammo += rounds;
        p.reserve -= rounds;
        this.audio.play("reloadFinish");
      }
    }
    if (
      (this.fireRequested ||
        (pointer.leftButtonDown() && this.ui.inputMode !== "touch") ||
        this.touch.fire) &&
      !this.mapVisible
    )
      this.shoot(world);
    this.fireRequested = false;
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.interact) ||
      this.touch.interact
    ) {
      this.interact();
      this.touch.interact = false;
    }
    if (
      (this.keys.transmit.isDown || this.touch.transmit) &&
      !moving &&
      this.hasUnbanked() &&
      this.reload <= 0
    ) {
      if (this.transmission === 0) {
        this.radio(
          "RELAY",
          "Uplink open. Stay still. They can triangulate this.",
        );
        for (const enemy of this.enemies)
          if (distance(enemy, p) < 390) enemy.hear(p, "radio");
      }
      this.transmission += dt;
      this.transmitTick += dt;
      if (this.transmitTick > 0.5) {
        this.audio.play("transmit");
        this.transmitTick = 0;
      }
      const duration = this.progression.data.signalFilter
        ? this.mission.upgradedTransmissionSeconds
        : this.mission.transmissionSeconds;
      if (this.transmission >= duration) {
        this.raid.bankedXP += this.progression.bank(this.raid.carried);
        this.raid.transmitted = [...this.raid.carried];
        this.transmission = 0;
        this.raid.quiet = false;
        for (const enemy of this.enemies) enemy.hear(p, "radio");
        this.radio(
          "RELAY",
          "Packet acknowledged. Evidence is safe. Signature compromised — move, now.",
        );
        this.ui.notice(
          "TRANSMISSION RECEIVED",
          "Evidence saved. Patrols are converging on your signal.",
        );
        this.audio.play("confirm");
        this.audio.voice("ack", { priority: 4 });
        this.spawnResponse();
      }
    } else if (this.transmission > 0) {
      this.transmission = 0;
      this.ui.notice(
        "UPLINK INTERRUPTED",
        "Remain still and hold T to send a complete packet.",
      );
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.heal)) this.useMedkit();
    for (const enemy of this.enemies) enemy.update(dt);
    for (const ally of this.companions) ally.update(dt);
    for (const effect of this.effects) effect.ttl -= dt;
    const ready = this.effects.filter((e) => e.ttl <= 0);
    this.effects = this.effects.filter((e) => e.ttl > 0);
    for (const e of ready) {
      const victim = e.victim || p;
      if (
        victim.hp > 0 &&
        distance(victim, e.point) < 19 &&
        clearSight(e.from, victim)
      ) {
        if (victim === p) this.damage(11);
        else victim.damage(11);
        if (this.done || p.downed) return;
      }
    }
    if (this.extracting) {
      if (distance(p, this.mission.extract) > 63) {
        this.extracting = false;
        this.extraction = 0;
        this.audio.boatStop();
        this.radio(
          "DOC",
          "Extraction interrupted. Return to the dock and call again.",
        );
      } else {
        this.extraction += dt;
        if (this.extraction >= this.mission.extractionSeconds) {
          this.finish(true);
          return;
        }
      }
    }
    this.drawIndicators(dt);
    this.ui.updateHUD(this);
  }
  shoot(target) {
    const p = this.player;
    if (
      p.downed ||
      this.reload > 0 ||
      this.shotCooldown > 0 ||
      this.transmission > 0
    )
      return;
    const weapon = WEAPONS[p.weapon];
    if (weapon.melee) {
      this.shotCooldown = weapon.cooldown;
      this.audio.play("knife");
      const victim = this.enemies
        .filter(
          (e) =>
            e.hp > 0 &&
            distance(p, e) < weapon.range &&
            Math.abs(
              Math.atan2(
                Math.sin(Math.atan2(e.y - p.y, e.x - p.x) - p.angle),
                Math.cos(Math.atan2(e.y - p.y, e.x - p.x) - p.angle),
              ),
            ) < 0.9 &&
            clearSight(p, e),
        )
        .sort((a, b) => distance(p, a) - distance(p, b))[0];
      if (victim) {
        victim.damage(weapon.damage);
        this.hitMarker = 0.16;
      }
      return;
    }
    if (p.ammo <= 0) {
      this.startReload();
      return;
    }
    p.ammo--;
    this.shotCooldown = weapon.cooldown;
    this.audio.play("shot", { weapon: p.weapon });
    const end = {
      x: p.x + Math.cos(p.angle) * 650,
      y: p.y + Math.sin(p.angle) * 650,
    };
    let t = 1,
      hit;
    for (const r of BLOCKS) {
      const fraction = segmentRect(p, end, r);
      if (fraction !== null && fraction < t) t = fraction;
    }
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const fraction = rayCircle(p, end, enemy, 21);
      if (fraction !== null && fraction < t) {
        t = fraction;
        hit = enemy;
      }
    }
    const impact = { x: p.x + (end.x - p.x) * t, y: p.y + (end.y - p.y) * t };
    if (hit) {
      hit.damage(weapon.damage);
      this.hitMarker = 0.16;
    }
    this.tracers.push({
      from: { x: p.x, y: p.y },
      to: impact,
      ttl: 0.075,
      enemy: false,
    });
    for (const enemy of this.enemies)
      if (distance(enemy, p) < weapon.noise) enemy.hear(p);
  }
  enemyShoot(enemy) {
    const p =
      [this.player, ...this.companions]
        .filter((a) => a.hp > 0 && clearSight(enemy, a))
        .sort((a, b) => distance(enemy, a) - distance(enemy, b))[0] ||
      this.player;
    // Aim snapshots are telegraphed; moving perpendicular can evade enemy fire.
    const point = {
      x: p.x + (Math.random() - 0.5) * 46,
      y: p.y + (Math.random() - 0.5) * 46,
    };
    const from = { x: enemy.x, y: enemy.y };
    this.effects.push({ from, point, ttl: 0.32, victim: p });
    this.audio.play("enemy", { pan: (enemy.x - p.x) / 400 });
    enemy.muzzle = 0.07;
  }
  spawnResponse() {
    if (this.reinforced) return;
    this.reinforced = true;
    const candidate = this.mission.patrols[0].find(
      ([x, y]) => distance(this.player, { x, y }) > 180,
    );
    if (candidate) {
      const e = new Enemy(this, this.enemies.length, [
        candidate,
        this.mission.patrols[0][1],
      ]);
      e.role = "REINFORCEMENT";
      e.hear(this.player, "radio");
      this.enemies.push(e);
    }
    this.radio("RELAY", "Signal triangulated. A response patrol is moving in.");
  }
  damage(amount) {
    if (this.done || this.player.downed || this.transit) return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.hurtFlash = 0.18;
    this.audio.play("hit");
    this.cameras.main.shake(100, 0.0015);
    if (this.player.hp <= 0) {
      if (
        this.player.revives >= 1 ||
        (this.mode === "solo" && this.player.selfKit <= 0) ||
        (this.mode === "squad" &&
          !this.companions.some((a) => a.hp > 0 && a.kit > 0))
      )
        this.finish(false);
      else {
        this.player.downed = true;
        this.bleedout = 18;
        this.reviveProgress = 0;
        this.extracting = false;
        this.extraction = 0;
        this.transmission = 0;
        this.reload = 0;
        this.resetInput();
        this.radio(
          "DOC",
          this.mode === "solo"
            ? "Downed. Hold E behind cover for one self-revive."
            : "Viper is down. Clear the threat before revival.",
        );
      }
    }
  }
  finish(success) {
    if (this.done) return;
    this.done = true;
    this.raid.success = success;
    const award = this.progression.complete(this.raid);
    this.audio.boatStop();
    this.audio.play(success ? "success" : "death");
    this.audio.voice(success ? "success" : "failed", { priority: 6 });
    if (!success) this.playerSprite.kill(this.player.angle);
    this.input.keyboard.resetKeys();
    this.scene.pause();
    this.ui.showResults(this, { ...award, elapsed: this.elapsed, success });
  }
  drawIndicators(dt) {
    const g = this.overlay;
    g.clear();
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const alert = enemy.state === "ENGAGE",
        radius = alert ? 210 : 180;
      const poly = [new Phaser.Math.Vector2(enemy.x, enemy.y)];
      for (let a = enemy.angle - 0.7; a <= enemy.angle + 0.71; a += 0.14) {
        const end = {
          x: enemy.x + Math.cos(a) * radius,
          y: enemy.y + Math.sin(a) * radius,
        };
        let t = 1;
        for (const b of BLOCKS) {
          const fraction = segmentRect(enemy, end, b);
          if (fraction !== null) t = Math.min(t, fraction);
        }
        poly.push(
          new Phaser.Math.Vector2(
            enemy.x + (end.x - enemy.x) * t,
            enemy.y + (end.y - enemy.y) * t,
          ),
        );
      }
      g.fillStyle(alert ? 0xec6f58 : 0xd4bd85, alert ? 0.12 : 0.06);
      g.fillPoints(poly, true);
    }
    for (const t of this.tracers) {
      t.ttl -= dt;
      g.lineStyle(2, 0xead5a0, Math.max(0, t.ttl / 0.075));
      g.lineBetween(t.from.x, t.from.y, t.to.x, t.to.y);
    }
    this.tracers = this.tracers.filter((t) => t.ttl > 0);
    for (const e of this.effects) {
      g.lineStyle(1, 0xe98971, 0.45);
      g.lineBetween(e.from.x, e.from.y, e.point.x, e.point.y);
      g.lineStyle(1.5, 0xe98971, 0.9);
      g.strokeCircle(e.point.x, e.point.y, 12 * (e.ttl / 0.32) + 3);
    }
    const m = this.markers;
    m.clear();
    if (this.ui.touchMode) {
      const p = this.player;
      m.lineStyle(1, 0xc9e0bb, 0.45);
      m.lineBetween(
        p.x + Math.cos(p.angle) * 24,
        p.y + Math.sin(p.angle) * 24,
        p.x + Math.cos(p.angle) * 105,
        p.y + Math.sin(p.angle) * 105,
      );
      m.strokeCircle(
        p.x + Math.cos(p.angle) * 105,
        p.y + Math.sin(p.angle) * 105,
        4,
      );
    }
    if (WEAPONS[this.player.weapon].melee && this.shotCooldown > 0.25) {
      m.lineStyle(3, 0xdbeac8, 0.8);
      m.beginPath();
      m.arc(
        this.player.x,
        this.player.y,
        42,
        this.player.angle - 0.7,
        this.player.angle + 0.7,
      );
      m.strokePath();
    }
    const pulse = Math.sin(this.elapsed * 3) * 3;
    m.lineStyle(2, 0x69cebc, 0.8);
    m.strokeCircle(this.mission.extract.x, this.mission.extract.y, 40 + pulse);
    m.fillStyle(0x64c4b2, 0.1);
    m.fillCircle(this.mission.extract.x, this.mission.extract.y, 42);
    const cross = (x, y, color) => {
      m.lineStyle(2, color);
      m.lineBetween(x - 6, y, x + 6, y);
      m.lineBetween(x, y - 6, x, y + 6);
    };
    cross(this.mission.extract.x, this.mission.extract.y, 0x80deca);
    if (!this.raid.carried.includes(this.mission.evidence)) {
      m.fillStyle(0xe0c88d, 0.15);
      m.fillCircle(this.mission.intel.x, this.mission.intel.y, 24 + pulse);
      m.lineStyle(2, 0xe0c88d);
      m.strokeRect(this.mission.intel.x - 9, this.mission.intel.y - 7, 18, 14);
      m.lineBetween(
        this.mission.intel.x - 5,
        this.mission.intel.y - 2,
        this.mission.intel.x + 5,
        this.mission.intel.y - 2,
      );
    }
    if (!this.supplyUsed) {
      m.fillStyle(0x9ead87);
      m.fillRect(this.mission.supply.x - 10, this.mission.supply.y - 8, 20, 16);
      cross(this.mission.supply.x, this.mission.supply.y, 0x243c35);
    }
    if (this.mission.id === "frequency" && !this.surveillanceOff) {
      m.lineStyle(2, 0x9dd4d1);
      m.strokeCircle(this.mission.optional.x, this.mission.optional.y, 11);
      cross(this.mission.optional.x, this.mission.optional.y, 0x9dd4d1);
    }
    for (const l of this.loot)
      if (!this.collected.has(l.id)) {
        m.fillStyle(
          l.kind === "medical"
            ? 0x9ead87
            : l.kind === "valuable"
              ? 0xd4b477
              : 0x829eaa,
        );
        m.fillRect(l.x - 7, l.y - 5, 14, 10);
      }
    if (this.mission.id === "frequency") {
      m.lineStyle(2, 0x78bde0, 0.75);
      m.strokeCircle(DOCKS.ridge.x, DOCKS.ridge.y, 36);
    }
    if (this.transmission > 0) {
      m.lineStyle(2, 0x67ddce, 0.4);
      m.strokeCircle(
        this.player.x,
        this.player.y,
        35 + ((this.elapsed * 50) % 110),
      );
    }
  }
  snapshot() {
    return {
      missionId: this.mission.id,
      mode: this.mode,
      sector: this.sector,
      previousWeapon: this.previousWeapon,
      loadout: structuredClone(this.loadout),
      drops: this.droppedWeapons.map((d) => ({
        id: d.id,
        weapon: d.weapon,
        x: d.x,
        y: d.y,
        ammo: d.ammo,
        reserve: d.reserve,
        collected: d.collected,
      })),
      downed: this.player.downed,
      bleedout: this.bleedout,
      reviveProgress: this.reviveProgress,
      transit: this.transit,
      collected: [...this.collected],
      companions: this.companions.map((a) => ({
        name: a.name,
        x: a.x,
        y: a.y,
        hp: a.hp,
        state: a.state,
        kit: a.kit,
      })),
      player: { ...this.player },
      raid: { ...this.raid },
      enemies: this.enemies.map((e) => ({
        x: e.x,
        y: e.y,
        state: e.state,
        hp: e.hp,
        suspicion: e.suspicion,
      })),
      elapsed: this.elapsed,
      reload: this.reload,
      transmission: this.transmission,
      extraction: this.extraction,
      replay: this.replay,
      done: this.done,
      save: structuredClone(this.progression.data),
    };
  }
}
