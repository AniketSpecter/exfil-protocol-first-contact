import Phaser from "phaser";
import "./style.css";
import { Boot } from "./scenes/Boot.js";
import { Raid } from "./scenes/Raid.js";
import { Progression } from "./systems/progression.js";
import { AudioSystem } from "./systems/audio.js";
import { Interface } from "./ui.js";

let storage;
try {
  storage = window.localStorage;
} catch {
  storage = {
    getItem() {
      throw Error("Storage disabled");
    },
    setItem() {
      throw Error("Storage disabled");
    },
  };
}
const progression = new Progression(storage),
  audio = new AudioSystem(progression);
const renderer =
  new URLSearchParams(location.search).get("renderer") === "canvas"
    ? Phaser.CANVAS
    : Phaser.AUTO;
const game = new Phaser.Game({
  type: renderer,
  parent: "game",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#10242c",
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false },
  scene: [Boot, Raid],
  banner: false,
  input: { windowEvents: true },
});
const ui = new Interface(game, progression, audio);
game.events.on("display-resized", () =>
  requestAnimationFrame(() => ui.fitMenu()),
);
game.events.once("boot-ready", () => ui.showTitle());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    const scene = game.scene.getScene("Raid");
    if (scene?.scene.isActive() && !scene.done) scene.pause();
  }
});
window.addEventListener("blur", () => {
  const scene = game.scene.getScene("Raid");
  if (scene?.scene.isActive() && !scene.done && !ui.display.changing)
    scene.pause();
});
window.addEventListener("resize", () => {
  if (ui.touchMode && innerHeight > innerWidth) {
    const scene = game.scene.getScene("Raid");
    if (scene?.scene.isActive() && !scene.done) scene.pause();
  }
});
// Explicit opt-in harness; excluded by dead-code elimination from the release build.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("qa"))
  window.__EXFIL__ = {
    game,
    progression,
    ui,
    get scene() {
      return game.scene.getScene("Raid");
    },
  };
