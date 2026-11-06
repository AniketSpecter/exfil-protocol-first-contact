export class DisplayController {
  constructor(game, notify) {
    this.game = game;
    this.notify = notify;
    this.changing = false;
    this.onChange = () => {
      this.changing = true;
      this.sync();
      requestAnimationFrame(() => {
        this.resize();
        setTimeout(() => {
          this.changing = false;
        }, 600);
      });
    };
    document.addEventListener("fullscreenchange", this.onChange);
    document.addEventListener("webkitfullscreenchange", this.onChange);
    window.addEventListener("resize", () => this.resize());
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(document.getElementById("app"));
  }
  get active() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  bind(button) {
    if (!button) return;
    button.onclick = () => this.toggle();
    this.sync();
    this.resize();
  }
  sync() {
    const button = document.getElementById("fullscreen-btn");
    if (button) {
      button.innerHTML = this.active
        ? "↙ <span>EXIT FULLSCREEN</span>"
        : "⛶ <span>FULLSCREEN</span>";
      button.setAttribute("aria-pressed", String(this.active));
    }
  }
  resize() {
    if (!this.game.isBooted) return;
    const app = document.getElementById("app"),
      w = app.clientWidth,
      h = app.clientHeight;
    if (
      w > 0 &&
      h > 0 &&
      (this.game.scale.width !== w || this.game.scale.height !== h)
    )
      this.game.scale.resize(w, h);
    this.game.events.emit("display-resized", { width: w, height: h });
  }
  async toggle() {
    this.changing = true;
    try {
      if (this.active) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (!exit) throw Error("Exit fullscreen is unavailable");
        await exit.call(document);
      } else {
        const target = document.documentElement,
          enter = target.requestFullscreen || target.webkitRequestFullscreen;
        if (!enter) throw Error("Fullscreen API is unavailable");
        await enter.call(target);
      }
      this.sync();
      this.resize();
    } catch (error) {
      this.notify(
        "Fullscreen could not start. Open the game in its own tab and use the browser fullscreen control (F11 on PC).",
      );
      console.info("Fullscreen request:", error.message);
    } finally {
      setTimeout(() => {
        this.changing = false;
      }, 600);
    }
  }
}
