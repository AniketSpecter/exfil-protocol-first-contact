import Phaser from "phaser";
import { OWNER_MEDIA, MEDIA_ROOT, ACTORS } from "../data/media.js";
import { paintWorld } from "../systems/world.js";
export class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }
  preload() {
    if (!OWNER_MEDIA) return;
    for (const name of ACTORS)
      this.load.spritesheet(
        "skin-" + name,
        MEDIA_ROOT + "actors/" + name + ".png",
        { frameWidth: 32, frameHeight: 32 },
      );
    this.load.spritesheet("tactical-legs", MEDIA_ROOT + "actors/legs.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
    for (const name of ["m4a1", "usp", "ak47"])
      this.load.image("gun-" + name, MEDIA_ROOT + "weapons/" + name + ".png");
    for (const name of [
      "grass",
      "sand",
      "concrete",
      "metal",
      "crate",
      "stone",
      "wood",
    ])
      this.load.image(
        "terrain-" + name,
        MEDIA_ROOT + "terrain/" + name + ".png",
      );
    for (const name of ["tree", "tree2", "crate-prop", "roof", "truck"])
      this.load.image("prop-" + name, MEDIA_ROOT + "props/" + name + ".png");
  }
  create() {
    if (!OWNER_MEDIA) this.createPortableArt();
    const t = this.textures.createCanvas("gun-knife", 32, 32),
      c = t.getContext();
    c.fillStyle = "#b7c5c7";
    c.beginPath();
    c.moveTo(16, 1);
    c.lineTo(20, 8);
    c.lineTo(19, 20);
    c.lineTo(13, 20);
    c.lineTo(13, 8);
    c.closePath();
    c.fill();
    c.fillStyle = "#e5ede1";
    c.fillRect(15, 7, 2, 13);
    c.fillStyle = "#36483e";
    c.fillRect(11, 20, 11, 3);
    c.fillRect(14, 23, 5, 8);
    t.refresh();
    paintWorld(this);
    this.game.events.emit("boot-ready");
  }
  createPortableArt() {
    for (const name of ACTORS) {
      const tex = this.textures.createCanvas("skin-" + name, 64, 96),
        c = tex.getContext();
      for (let i = 0; i < 6; i++) {
        const x = (i % 2) * 32,
          y = Math.floor(i / 2) * 32;
        c.fillStyle = name.startsWith("ct") ? "#426579" : "#8b7355";
        c.beginPath();
        c.ellipse(x + 16, y + 18, 12, 9, 0, 0, 7);
        c.fill();
        c.fillStyle = "#202d35";
        c.fillRect(x + 9, y + 13, 14, 14);
        c.fillStyle = "#71828a";
        c.beginPath();
        c.arc(x + 16, y + 11, 7, 0, 7);
        c.fill();
        c.fillStyle = "#111e25";
        c.fillRect(x + 11, y + 6, 10, 4);
      }
      tex.refresh();
      for (let i = 0; i < 6; i++)
        tex.add(i, 0, (i % 2) * 32, Math.floor(i / 2) * 32, 32, 32);
    }
    const tex = this.textures.createCanvas("tactical-legs", 128, 64),
      c = tex.getContext();
    for (let i = 0; i < 8; i++) {
      let x = (i % 4) * 32,
        y = Math.floor(i / 4) * 32;
      c.fillStyle = "#222f35";
      c.fillRect(x + 7, y + 11 + Math.sin(i) * 5, 7, 16);
      c.fillRect(x + 18, y + 11 - Math.sin(i) * 5, 7, 16);
      tex.add(i, 0, x, y, 32, 32);
    }
    tex.refresh();
    for (const name of ["m4a1", "ak47", "usp"]) {
      const t = this.textures.createCanvas("gun-" + name, 32, 32),
        g = t.getContext();
      g.fillStyle = "#101b22";
      g.fillRect(12, 2, name === "usp" ? 5 : 7, name === "usp" ? 19 : 29);
      g.fillStyle = "#71818a";
      g.fillRect(14, 3, 2, 15);
      g.fillStyle = "#4c5654";
      g.fillRect(10, 18, 5, 9);
      t.refresh();
    }
  }
}
