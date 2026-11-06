// Shared rotating top-down body, leg and weapon presentation for both factions.
export class TacticalActor {
  constructor(
    scene,
    x,
    y,
    { skin = "ct3", weapon = "gun-m4a1", friendly = false } = {},
  ) {
    this.scene = scene;
    this.phase = 0;
    this.dead = false;
    this.shadow = scene.add.ellipse(3, 5, 27, 23, 0x030c11, 0.45);
    this.legs = scene.add.sprite(0, 3, "tactical-legs", 0).setScale(1.12);
    this.gun = scene.add
      .image(4, -11, weapon)
      .setScale(weapon === "gun-usp" ? 0.95 : 0.67)
      .setRotation(-Math.PI / 2);
    this.body = scene.add.sprite(0, 0, "skin-" + skin, 0).setScale(1.15);
    this.root = scene.add
      .container(x, y, [this.shadow, this.legs, this.gun, this.body])
      .setDepth(15);
    this.flash = scene.add.graphics();
    this.root.add(this.flash);
    this.band = scene.add.graphics();
    this.root.add(this.band);
    this.band.lineStyle(2, friendly ? 0x76cbbb : 0xc17f60, 0.85);
    this.band.lineBetween(-11, 4, -6, 4);
  }
  get active() {
    return this.root.active;
  }
  setAlpha(a) {
    this.root.setAlpha(a);
    return this;
  }
  setTint() {
    return this;
  }
  setTintFill() {
    this.body.setAlpha(0.35);
    this.scene.time.delayedCall(70, () => {
      if (this.body.active) this.body.setAlpha(1);
    });
    return this;
  }
  setWeapon(texture) {
    this.gun.setTexture(texture).setScale(texture === "gun-usp" ? 0.95 : 0.67);
  }
  update(x, y, angle, moving, dt, { firing = false, reloading = false } = {}) {
    if (this.dead) return;
    this.phase += dt * (moving ? 12 : 1);
    this.root
      .setPosition(x, y)
      .setDepth(12 + y / 100)
      .setRotation(angle + Math.PI / 2);
    this.legs
      .setFrame(moving ? Math.floor(this.phase) % 8 : 0)
      .setVisible(moving);
    this.body.setFrame(moving ? 2 + (Math.floor(this.phase) % 4) : 0);
    this.body.y = moving ? Math.sin(this.phase * 2) * 0.7 : 0;
    this.gun
      .setPosition(reloading ? 8 : 4, -11 + (firing ? 2 : 0))
      .setRotation(-Math.PI / 2 + (reloading ? 0.36 : 0));
    this.flash.clear();
    if (firing) {
      this.flash.fillStyle(0xffd49a, 0.85);
      this.flash.fillTriangle(1, -26, 8, -44, 12, -26);
      this.flash.fillStyle(0xffffff, 0.9);
      this.flash.fillCircle(7, -29, 3);
    }
  }
  kill(angle) {
    this.dead = true;
    this.root.setRotation(angle + 1.4).setAlpha(0.5);
    this.legs.setVisible(false);
    this.band.setVisible(false);
    this.flash.clear();
    this.body.setFrame(0);
    this.gun.setPosition(15, 5).setRotation(0.9);
  }
}
