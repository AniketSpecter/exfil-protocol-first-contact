import { MISSION, EVIDENCE, CAMPAIGN, DOCKS } from "./data/mission.js";
import { distance } from "./systems/geometry.js";
import { mapSVG } from "./systems/world.js";
import { DisplayController } from "./systems/display.js";
import { OWNER_MEDIA, MEDIA_ROOT } from "./data/media.js";
import { levelProgress } from "./systems/progression.js";
import { WEAPONS } from "./data/weapons.js";
import { journeyMarkup, updateJourney } from "./ui-journey.js";
import { TouchLayout } from "./systems/touch-layout.js";
const star = `<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M32 3l6 14h24L42 27l7 17-17-11-17 11 7-17L2 17h24z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M1 25h19m24 0h19" stroke="currentColor" stroke-width="3"/></svg>`;
const timeString = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
const control = (key, text) => `<span><kbd>${key}</kbd>${text}</span>`;
export class Interface {
  constructor(game, progression, audio) {
    this.game = game;
    this.progression = progression;
    this.audio = audio;
    this.root = document.querySelector("#ui");
    this.touchLayout = new TouchLayout();
    this.touchMode = false;
    this.inputMode = "mouse";
    this.watchTouch();
    document.body.classList.toggle("touch-mode", this.touchMode);
    this.display = new DisplayController(game, (message) =>
      this.displayMessage(message),
    );
    this.audio.onVoice = (info) => this.voiceCaption(info);
    this.lastHUD = 0;
    this.noticeUntil = 0;
    this.radioUntil = 0;
    this.ready = false;
    this.selectedMission = progression.data.lastMission || "landing";
    this.mode = "solo";
    this.bindUISounds();
    this.root.innerHTML =
      '<div class="loading"><div class="wordmark">EXFIL PROTOCOL</div><p>ESTABLISHING SECURE CONNECTION…</p></div>';
  }
  chrome() {
    return `<header class="topbar"><div class="brand">${star}<span>SFA<span class="brand-small">SPECIAL FORCE AUTHORITY</span></span></div><div class="top-mid"><span class="status-dot"></span> OPERATION SILENT TIDE <b>/</b> MON BREAKWATER</div><div class="utilities"><button id="audio-btn" class="icon-button" aria-label="Toggle audio">${this.audio.muted ? "AUDIO OFF" : "AUDIO ON"}</button><button id="music-btn" class="icon-button" aria-label="Toggle menu music" aria-pressed="${!this.audio.musicMuted}">${this.audio.musicMuted ? "MUSIC OFF" : "MUSIC ON"}</button><button id="fullscreen-btn" class="icon-button" aria-label="Toggle fullscreen">⛶ <span>FULLSCREEN</span></button></div></header>`;
  }
  bindUISounds() {
    this.root.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest("button,[role=button]");
        if (
          !button ||
          button.closest("#touch-editor") ||
          ["audio-btn", "setting-audio", "music-btn", "setting-music"].includes(
            button.id,
          )
        )
          return;
        this.audio.start();
        const back = /back|close|cancel|abandon|^menu$/.test(
          button.id + " " + button.className,
        );
        const toggle =
          /quiet|setting|mode|map/.test(button.id) ||
          button.hasAttribute("data-mode");
        this.audio.uiSound(
          button.disabled
            ? "denied"
            : back
              ? "back"
              : toggle
                ? "toggle"
                : "confirm",
        );
      },
      true,
    );
    this.root.addEventListener("pointerover", (event) => {
      if (event.pointerType !== "mouse") return;
      const button = event.target.closest("button");
      if (
        !button ||
        button.contains(event.relatedTarget) ||
        button.disabled ||
        button.closest(".touch-controls,#touch-editor")
      )
        return;
      this.audio.uiSound("hover");
    });
    this.root.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target.closest("button:disabled,.contract.locked"))
          this.audio.uiSound("denied");
      },
      true,
    );
  }
  bindChrome() {
    document.querySelector("#audio-btn")?.addEventListener("click", () => {
      this.audio.start();
      this.audio.toggle();
      this.audio.uiSound("toggle");
      document.querySelector("#audio-btn").textContent = this.audio.muted
        ? "AUDIO OFF"
        : "AUDIO ON";
    });
    const music = document.querySelector("#music-btn");
    if (music)
      music.onclick = () => {
        this.audio.start();
        this.audio.toggleMusic();
        music.textContent = this.audio.musicMuted ? "MUSIC OFF" : "MUSIC ON";
        music.setAttribute("aria-pressed", String(!this.audio.musicMuted));
        this.audio.uiSound("toggle");
      };
    this.display.bind(document.querySelector("#fullscreen-btn"));
  }
  displayMessage(message) {
    let el = document.getElementById("display-message");
    if (!el) {
      el = document.createElement("div");
      el.id = "display-message";
      el.className = "display-toast";
      el.setAttribute("role", "alert");
      document.getElementById("app").append(el);
    }
    el.textContent = message;
    clearTimeout(this.displayTimer);
    this.displayTimer = setTimeout(() => el.remove(), 8000);
  }
  voiceCaption({ label, duration }) {
    let el = document.getElementById("voice-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "voice-caption";
      el.className = "voice-caption";
      el.setAttribute("role", "status");
      document.getElementById("app").append(el);
    }
    el.textContent = "◖)) " + label;
    clearTimeout(this.voiceTimer);
    this.voiceTimer = setTimeout(() => el.remove(), duration * 1000 + 200);
  }
  enableTouch() {
    if (this.touchMode) return;
    this.touchMode = true;
    this.inputMode = "touch";
    document.body.classList.add("touch-mode");
    if (
      this.scene &&
      this.root.querySelector(".hud") &&
      !this.root.querySelector(".touch-controls")
    ) {
      this.bindTouch(this.scene);
      this.touchLayout.apply(this.root);
      this.scene.resizeView();
    }
  }
  watchTouch() {
    const detect = () => {
      if (
        (innerWidth <= 960 && innerHeight <= 500) ||
        (innerWidth <= 600 && innerHeight > innerWidth) ||
        navigator.maxTouchPoints > 0 ||
        matchMedia("(any-pointer: coarse)").matches ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      )
        this.enableTouch();
    };
    detect();
    window.addEventListener("resize", detect);
    matchMedia("(any-pointer: coarse)").addEventListener("change", detect);
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType === "touch") {
          this.enableTouch();
          this.inputMode = "touch";
        } else if (e.target.tagName === "CANVAS") this.inputMode = "mouse";
      },
      { capture: true },
    );
    document.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType === "mouse" && e.target.tagName === "CANVAS")
          this.inputMode = "mouse";
      },
      { capture: true },
    );
  }
  controlGuide() {
    const items = this.touchMode
      ? [
          ["LEFT STICK", "Move"],
          ["RIGHT STICK", "Aim; push outward to fire"],
          ["USE", "Interact / boat"],
          ["WEAPON", "Tap to select a slot"],
          ["RELOAD", "Reload magazine"],
          ["+ MED", "Use a medkit"],
          ["HOLD TX", "Transmit; stay still"],
          ["REVIVE", "Hold when downed"],
          ["MAP / PAUSE", "On-screen buttons"],
        ]
      : [
          ["WASD", "Move"],
          ["MOUSE", "Aim and fire"],
          ["E", "Interact / boat"],
          ["1 / 2 / 3", "Primary / secondary / knife"],
          ["Q", "Quick switch"],
          ["R", "Reload"],
          ["H", "Medkit / health panel"],
          ["HOLD T", "Transmit"],
          ["HOLD E", "Self-revive when downed"],
          ["M / ESC", "Map / pause"],
        ];
    return items.map(([key, text]) => control(key, text)).join("");
  }
  customizeTouch() {
    this.enableTouch();
    const scene = this.scene;
    if (scene && !scene.done) {
      scene.resetInput();
      if (!scene.scene.isPaused()) scene.pause();
    }
    this.touchLayout.open(this, () => {
      if (scene && !scene.done) {
        this.showHUD(scene, true);
        this.showPause(scene);
      } else this.touchLayout.apply(this.root);
    });
  }
  inputText(text) {
    return this.touchMode
      ? text
          .replace(/hold T(?: \/ TX)?\b/gi, "hold TX")
          .replace(/hold E(?: \/ REVIVE)?\b/gi, "hold REVIVE")
      : text;
  }
  fitTitle() {
    const im = this.root.querySelector(".title-screen img"),
      prompt = this.root.querySelector(".title-touch-prompt");
    if (!im || !prompt || !im.naturalWidth) return;
    const w = this.root.clientWidth,
      h = this.root.clientHeight,
      scale = Math.min(w / im.naturalWidth, h / im.naturalHeight),
      iw = im.naturalWidth * scale,
      ih = im.naturalHeight * scale;
    Object.assign(prompt.style, {
      left: (w - iw) / 2 + iw * 0.15 + "px",
      top: (h - ih) / 2 + ih * 0.91 + "px",
      width: iw * 0.7 + "px",
      height: ih * 0.08 + "px",
    });
  }
  decorateMenu() {
    if (!this.reconImage && this.game.textures.exists("island"))
      this.reconImage = this.game.textures
        .get("island")
        .getSourceImage()
        .toDataURL("image/png");
    const map = this.root.querySelector(".menu-map");
    if (map)
      map.innerHTML = mapSVG({
        route: true,
        recon: this.reconImage,
        annotations: true,
      });
    const title = this.root.querySelector(".menu-copy h1");
    if (title) {
      title.innerHTML =
        '<img class="official-logo" src="assets/title/logo.png" alt="EXFIL PROTOCOL FIRST CONTACT"/>';
      title.querySelector("img").onload = () => this.fitMenu();
    }
    const build = this.root.querySelector(".menu-footer>span:last-child");
    if (build) build.textContent = "BUILD 03.1.1 // OPERATION SILENT TIDE";
    this.menuObserver?.disconnect();
    this.fitMenu();
  }
  fitMenu() {
    this.fitTitle();
    this.touchLayout.apply(this.root);
    const copy = this.root.querySelector(".menu-copy");
    if (copy) copy.style.transform = "";
  }
  showTitle() {
    this.clearPauseKey();
    this.root.className = "";
    this.root.innerHTML = `<main class="title-screen"><picture><source media="(max-aspect-ratio: 3/4)" srcset="assets/title/9-16.png"/><source media="(min-aspect-ratio: 2/1)" srcset="assets/title/21-9.png"/><source media="(max-aspect-ratio: 3/2)" srcset="assets/title/4-3.png"/><img src="assets/title/16-9.png" alt="EXFIL PROTOCOL FIRST CONTACT — Operation Silent Tide"/></picture><button class="title-enter" aria-label="Continue to operations"><span class="sr-only">Press any key or tap to continue</span></button><div class="title-touch-prompt" aria-hidden="true">TAP TO CONTINUE</div></main>`;
    const titleImage = this.root.querySelector(".title-screen img");
    titleImage.onload = () => this.fitTitle();
    requestAnimationFrame(() => this.fitTitle());
    const enter = () => {
      document.removeEventListener("keydown", key);
      this.audio.start();
      this.showMenu();
    };
    const key = (e) => {
      if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
        e.preventDefault();
        enter();
      }
    };
    this.titleKey = key;
    document.addEventListener("keydown", key);
    document.querySelector(".title-enter").onclick = enter;
  }
  unlocked(id) {
    return (
      id === "landing" ||
      this.progression.data.completedMissions.includes("landing")
    );
  }
  showOperations() {
    this.audio.setMenuMusic(true);
    this.root.className = "";
    const save = this.progression.data,
      level = levelProgress(save.xp);
    this.root.innerHTML = `<main class="screen operations">${this.chrome()}<section class="operations-content"><div class="eyebrow">SFA / OPERATION BOARD</div><h1 class="section-title">CHOOSE YOUR CONTRACT</h1><p class="muted">Level ${level.level} · ${level.current} / ${level.needed} XP to next level. ${save.signalFilter ? "Signal Scrambler Level 1 equipped: 2.5s uplink." : "Complete Silent Landing to unlock the scrambler and Dead Frequency."}</p><div class="contract-grid">${Object.values(
      CAMPAIGN,
    )
      .map(
        (m) =>
          `<button class="contract ${this.unlocked(m.id) ? "" : "locked"}" data-mission="${m.id}" ${this.unlocked(m.id) ? "" : "disabled"}><span class="eyebrow">${m.number} / SECTOR ${m.sector}</span><h2>${m.name}</h2><p>${m.id === "landing" ? "Coastal warehouses, medical supplies and your first shipping manifest." : "Boat insertion, lighthouse relay, surveillance and compromised radio logs."}</p><strong>${!this.unlocked(m.id) ? "LOCKED · COMPLETE MISSION 01" : save.completedMissions.includes(m.id) ? "REPLAY CONTRACT →" : "DEPLOY →"}</strong></button>`,
      )
      .join(
        "",
      )}<article class="contract locked"><span class="eyebrow">03 / SECTOR C</span><h2>BROKEN CARGO</h2><p>Smuggling complex, missing contact and classified cargo.</p><strong>EXPANSION · NOT PLAYABLE</strong></article><article class="contract locked"><span class="eyebrow">04 / SECTOR D</span><h2>ROOK’S LOCKDOWN</h2><p>Armored commander, facility lockdown and final transmission. Rook’s fate remains unresolved.</p><strong>EXPANSION · NOT PLAYABLE</strong></article></div><button class="secondary" id="operations-back">BACK TO MENU</button></section></main>`;
    this.bindChrome();
    document.querySelectorAll("[data-mission]").forEach(
      (b) =>
        (b.onclick = () => {
          this.selectedMission = b.dataset.mission;
          this.showBriefing();
        }),
    );
    document.getElementById("operations-back").onclick = () => this.showMenu();
  }
  showUtility(kind) {
    const overlay = document.createElement("div");
    overlay.className = "modal-shade utility-modal";
    overlay.innerHTML = `<section class="pause-panel"><div class="eyebrow">FIELD MANUAL</div><h2>${kind === "controls" ? "CONTROLS" : "SETTINGS"}</h2>${kind === "controls" ? `<div class="controls-grid">${this.controlGuide()}</div><p class="fineprint">Use cover. A full uplink preserves evidence but sends patrols to your position. Phones play in landscape.</p>` : `<p>Audio controls effects and voices; Music controls the menu soundtrack separately. Fullscreen is in the top bar. Current audio: ${this.audio.muted ? "muted" : "on"}.</p><button class="secondary" id="setting-audio">${this.audio.muted ? "AUDIO OFF" : "AUDIO ON"}</button><button class="secondary" id="setting-music">${this.audio.musicMuted ? "MUSIC OFF" : "MUSIC ON"}</button><button class="secondary" id="customize-touch">CUSTOMIZE TOUCH CONTROLS</button><button class="secondary" id="setting-touch">${this.touchMode ? "TOUCH CONTROLS ENABLED" : "ENABLE TOUCH CONTROLS"}</button><p class="fineprint">Progress saves locally in this browser. If graphics fail, open the game with ?renderer=canvas. No accounts, purchases or telemetry.</p>`}<button class="primary utility-close">CLOSE <span>×</span></button></section>`;
    this.root.append(overlay);
    const music = overlay.querySelector("#setting-music");
    if (music)
      music.onclick = () => {
        this.audio.start();
        this.audio.toggleMusic();
        music.textContent = this.audio.musicMuted ? "MUSIC OFF" : "MUSIC ON";
        const top = document.querySelector("#music-btn");
        if (top) {
          top.textContent = music.textContent;
          top.setAttribute("aria-pressed", String(!this.audio.musicMuted));
        }
        this.audio.uiSound("toggle");
      };
    const editor = overlay.querySelector("#customize-touch");
    if (editor) editor.onclick = () => this.customizeTouch();
    const input = overlay.querySelector("#setting-touch");
    if (input)
      input.onclick = () => {
        this.enableTouch();
        input.textContent = "TOUCH CONTROLS ENABLED";
      };
    overlay.querySelector(".utility-close").onclick = () => overlay.remove();
    const audio = overlay.querySelector("#setting-audio");
    if (audio)
      audio.onclick = () => {
        this.audio.start();
        this.audio.toggle();
        this.audio.uiSound("toggle");
        audio.textContent = this.audio.muted ? "AUDIO OFF" : "AUDIO ON";
        document.querySelector("#audio-btn").textContent = audio.textContent;
      };
  }
  showDestinations(s) {
    if (this.root.querySelector("#destinations")) return;
    s.resetInput();
    s.scene.pause();
    const overlay = document.createElement("div");
    overlay.className = "modal-shade";
    overlay.id = "destinations";
    overlay.innerHTML = `<section class="pause-panel"><div class="eyebrow">COASTAL TRANSPORT / ${s.mode.toUpperCase()}</div><h2>CHOOSE A DOCK</h2><p>Passengers: Viper${s.companions
      .filter((a) => a.hp > 0)
      .map((a) => ", " + a.name)
      .join(
        "",
      )}. Health, ammo, loot and evidence remain aboard. Time is paused while choosing.</p><button class="primary" id="sail" ${s.sector === "coast" ? "" : 'data-return="1"'}>${s.sector === "coast" ? "LIGHTHOUSE RIDGE →" : "LANDING COAST →"}</button>${s.sector === "coast" ? `<button class="secondary" id="safehouse" ${s.raid.carried.includes(s.mission.evidence) ? "" : "disabled"}>RETURN TO SAFEHOUSE / COMPLETE</button>` : ""}<button class="secondary" id="boat-cancel">CANCEL / STAY ASHORE</button></section>`;
    this.root.append(overlay);
    document.getElementById("sail").onclick = () =>
      s.travel(s.sector === "coast" ? "ridge" : "coast");
    document.getElementById("boat-cancel").onclick = () =>
      this.closeDestinations(s);
    const safe = document.getElementById("safehouse");
    if (safe)
      safe.onclick = () => {
        this.closeDestinations(s);
        s.startExtraction();
      };
  }
  closeDestinations(s) {
    document.getElementById("destinations")?.remove();
    s.scene.resume();
    s.resetInput();
  }
  showMenu() {
    this.audio.setMenuMusic(true);
    clearTimeout(this.voiceTimer);
    document.getElementById("voice-caption")?.remove();
    this.clearPauseKey();
    if (this.titleKey) document.removeEventListener("keydown", this.titleKey);
    this.ready = true;
    this.scene = null;
    const save = this.progression.data;
    this.root.className = "";
    this.root.innerHTML = `<main class="menu screen">${this.chrome()}<div class="menu-stage"><section class="menu-copy"><div class="eyebrow">SFA INCIDENT ARCHIVE / 001</div><h1>EXFIL<br>PROTOCOL<span>FIRST CONTACT</span></h1><div class="operation-label">OPERATION SILENT TIDE</div><p class="menu-description">Four went in.<br>The record says none returned.</p><p class="menu-subcopy">Before the silence, there was a first contract.<br>Recover the evidence. Decide what survives.</p><button class="primary" id="new-operation">${save.completions ? "DEPLOY AGAIN" : "NEW OPERATION"}<span>&nearr;</span></button><div class="session-note"><span class="status-dot"></span> SINGLE PLAYER <b>&middot;</b> SHORT TACTICAL RAID</div></section><section class="menu-recon" aria-label="Contract reconnaissance"><div class="recon-heading"><span>MON BREAKWATER / RECON OVERVIEW</span><span>N &uarr;</span></div><div class="menu-map"></div><aside class="mission-card"><div class="eyebrow">ACTIVE CONTRACT <span>01 / 02</span></div><h2>SILENT LANDING</h2><p>Mon Breakwater Island<br><strong>Coastal infiltration</strong></p><div class="card-rule"></div><div class="card-row"><span>ASSIGNMENT</span><b>Recover classified manifest</b></div><div class="card-row"><span>EXFIL</span><b>Southern dock</b></div><div class="card-row"><span>THREAT</span><b class="warning-text">PMC patrols confirmed</b></div>${save.signalFilter ? '<div class="upgrade-tag">SCRAMBLER LEVEL 1 &middot; MISSION 02 AVAILABLE</div>' : ""}</aside></section></div><footer class="menu-footer"><span>VIPER ONE <b>/</b> RECONNAISSANCE DETACHMENT</span><span>${save.xp.toLocaleString()} XP <b>/</b> ${save.evidence.length} EVIDENCE BANKED</span><button class="text-button" id="credits">INTEL & CREDITS</button><span>BUILD 03.1.1 // OPERATION SILENT TIDE</span></footer></main>`;
    this.bindChrome();
    document.querySelector("#new-operation").onclick = () =>
      this.showBriefing();
    document.querySelector("#credits").onclick = () => this.showCredits();
    this.decorateMenu();
    const nav = document.createElement("nav");
    nav.className = "operation-nav";
    nav.innerHTML =
      "<button id=mission-select>MISSION SELECTION</button><button id=controls-menu>CONTROLS</button><button id=settings-menu>SETTINGS</button>";
    document.querySelector(".menu-copy").append(nav);
    document.getElementById("mission-select").onclick = () =>
      this.showOperations();
    document.getElementById("controls-menu").onclick = () =>
      this.showUtility("controls");
    document.getElementById("settings-menu").onclick = () =>
      this.showUtility("settings");
    const m = CAMPAIGN[this.selectedMission] || CAMPAIGN.landing;
    document.querySelector(".mission-card h2").textContent = m.name;
    document.querySelector(".mission-card .eyebrow>span").textContent =
      m.number + " / 02";
    document.querySelector(".mission-card p").innerHTML =
      m.sector +
      "<br><strong>" +
      (m.id === "frequency"
        ? "Boat approach / relay surveillance"
        : "Coastal infiltration") +
      "</strong>";
    document.querySelector(".mission-card .card-row b").textContent =
      m.intelName;
    document.querySelector(
      ".mission-card .card-row:nth-of-type(4) b",
    ).textContent =
      m.id === "frequency" ? "Boat return / safehouse" : "Southern dock";
    const note = document.querySelector(".upgrade-tag");
    if (note) note.textContent = "SCRAMBLER LEVEL 1 · MISSION 02 AVAILABLE";
  }
  showBriefing() {
    this.audio.setMenuMusic(true);
    const replay = this.progression.data.completions > 0;
    this.root.innerHTML = `<main class="briefing screen">${this.chrome()}<div class="briefing-grid"><section><div class="eyebrow">MISSION BRIEF / ${replay ? "RECONTRACT" : "FIRST INSERTION"}</div><h1 class="section-title">SILENT<br>LANDING<span>01 / MON BREAKWATER ISLAND</span></h1><p class="brief-lead">Unmarked vessels. A private army.<br>Orders that no longer add up.</p><p class="muted body-copy">You are Viper, lead operator of SFA recon squad Viper One. Enter the coastal installation, recover its shipping manifest and return to the southern dock. Doc, Spectre and Relay support you over comms.</p><ol class="steps"><li><span>01</span><div><b>RECOVER</b><p>Find the classified data at the warehouse.</p></div></li><li><span>02</span><div><b>DECIDE WHAT SURVIVES</b><p>Transmit to bank the evidence and reveal your position, or carry it out quietly and risk losing it.</p></div></li><li><span>03</span><div><b>EXTRACT</b><p>Call the boat at the southern dock. Survive six seconds.</p></div></li></ol>${replay ? '<div class="replay-note"><b>SIGNAL FILTER EQUIPPED</b><p>Transmit in 2.5s instead of 4s. A Nightglass fragment is now available at the northern relay. The north patrol has moved.</p></div>' : ""}<div class="brief-buttons"><button class="primary" id="play">PLAY OPERATION <span>→</span></button><button class="secondary" id="back">BACK</button></div></section><aside class="brief-right"><div class="brief-map">${mapSVG({ route: true })}<div class="brief-map-caption">RECON OVERVIEW <span>NOT TO NAVIGATIONAL SCALE</span></div></div><div class="controls-panel"><div class="eyebrow">FIELD CONTROLS</div><div class="controls-grid">${control("W A S D", "Move")}${control("MOUSE", "Aim")}${control("LMB", "Fire")}${control("R", "Reload")}${control("E", "Interact")}${control("HOLD T", "Transmit · stand still")}${control("SHIFT", "Quiet movement")}${control("M / ESC", "Map / pause")}</div></div></aside></div></main>`;
    this.bindChrome();
    document.querySelector("#back").onclick = () => this.showMenu();
    document.querySelector("#play").onclick = () => this.deploy();
    const roster = document.createElement("div");
    roster.className = "squad-roster";
    roster.innerHTML = [
      ["ct3", "VIPER", "LEAD"],
      ["ct2", "DOC", "MEDIC"],
      ["ct1", "SPECTRE", "RECON"],
      ["ct4", "RELAY", "COMMS"],
    ]
      .map(
        ([skin, name, role]) =>
          `<div>${OWNER_MEDIA ? `<img src="${MEDIA_ROOT}ui/${skin}.png" alt="${name} operator"/>` : '<span class="operator-symbol">✦</span>'}<span><b>${name}</b><small>${role}</small></span></div>`,
      )
      .join("");
    document.querySelector(".brief-right").prepend(roster);
    const controls = document.querySelector(".controls-grid");
    if (controls && !this.touchMode)
      controls.insertAdjacentHTML(
        "beforeend",
        control("1 / 2 / 3", "Primary / secondary / knife") +
          control("Q", "Quick switch"),
      );
    const mission = CAMPAIGN[this.selectedMission] || CAMPAIGN.landing;
    document.querySelector(".section-title").innerHTML =
      mission.name.replace(" ", "<br>") +
      "<span>" +
      mission.number +
      " / " +
      mission.sector.toUpperCase() +
      "</span>";
    document.querySelector(".brief-lead").innerHTML =
      mission.id === "frequency"
        ? "The lighthouse is broadcasting.<br>Its logs predate your arrival."
        : "Unmarked vessels. A private army.<br>Recover proof and leave quietly.";
    document.querySelector(".steps").innerHTML = (
      mission.id === "frequency"
        ? [
            [
              "TRAVEL",
              "Interact at the southern dock. Select Lighthouse Ridge; all surviving squadmates travel with you.",
            ],
            [
              "RECOVER",
              "Recover encrypted radio logs. Optionally disable surveillance to reduce detection range.",
            ],
            [
              "RETURN",
              "Transmit or carry your evidence. Take the boat back and choose Return to safehouse.",
            ],
          ]
        : [
            [
              "RECOVER",
              "Infiltrate the dock warehouses. Recover the shipping manifest.",
            ],
            [
              "DECIDE",
              this.touchMode
                ? "Hold TX stationary to bank evidence and trigger a response team, or carry it silently."
                : "Hold T stationary to bank evidence and trigger a response team, or carry it silently.",
            ],
            [
              "EXTRACT",
              "Optional medical supplies are west of the road. Return to the safehouse dock and hold six seconds.",
            ],
          ]
    )
      .map(
        ([title, text], i) =>
          `<li><span>0${i + 1}</span><div><b>${title}</b><p>${text}</p></div></li>`,
      )
      .join("");
    const replayNote = document.querySelector(".replay-note");
    if (replayNote)
      replayNote.innerHTML =
        "<b>SIGNAL SCRAMBLER LEVEL 1</b><p>Uplink shortened from 4.0 to 2.5 seconds. Mission 02 has a separate lighthouse island, surveillance and rifleman patrol.</p>";
    const modes = document.createElement("div");
    modes.className = "mode-select";
    modes.innerHTML = `<button data-mode="solo" class="${this.mode === "solo" ? "selected" : ""}">SOLO <small>One self-revive kit</small></button><button data-mode="squad" class="${this.mode === "squad" ? "selected" : ""}">SQUAD <small>Doc + Spectre · shared one recovery</small></button>`;
    document.querySelector(".brief-right").prepend(modes);
    modes.querySelectorAll("button").forEach(
      (b) =>
        (b.onclick = () => {
          this.mode = b.dataset.mode;
          modes
            .querySelectorAll("button")
            .forEach((x) => x.classList.toggle("selected", x === b));
        }),
    );
    if (this.touchMode)
      document.querySelector(".controls-panel").innerHTML =
        `<div class="eyebrow">LANDSCAPE TOUCH CONTROLS</div><div class="controls-grid">${this.controlGuide()}</div>`;
  }
  deploy() {
    this.audio.setMenuMusic(false);
    this.audio.start();
    this.audio.play("confirm");
    this.game.scene.stop("Boot");
    const s = this.game.scene.getScene("Raid");
    if (s.scene.isActive() || s.scene.isPaused()) this.game.scene.stop("Raid");
    if (!this.unlocked(this.selectedMission)) this.selectedMission = "landing";
    this.game.scene.start("Raid", {
      ui: this,
      progression: this.progression,
      audio: this.audio,
      missionId: this.selectedMission,
      mode: this.mode,
    });
  }
  showHUD(scene, resuming = false) {
    this.clearPauseKey();
    this.scene = scene;
    this.root.className = "in-raid";
    this.root.innerHTML = `<div class="hud">${this.chrome()}<div class="hud-left"><div class="eyebrow">SILENT LANDING <span id="raid-time">00:00</span></div><div id="objective" class="objective"></div><div id="signal-status" class="signal-status"></div><div id="storage-warning" class="storage-warning"></div></div><div class="hud-right"><div class="radar" id="radar">${mapSVG()}<div class="radar-caption">MON / AO–01 <span>N ↑</span></div></div><button id="pause-button" class="text-button">ESC · PAUSE</button></div><div id="notice" class="notice hidden" role="status"></div><div class="crosshair" id="crosshair"><i></i><i></i><i></i><i></i></div><div class="hit-marker hidden" id="hit-marker">×</div><div class="hurt-vignette" id="hurt-vignette"></div><div id="interaction" class="interaction hidden"></div><div id="action-progress" class="action-progress hidden"></div><div class="hud-bottom"><div class="vitals"><div class="eyebrow">VIPER / SQUAD LEAD <span id="stance">COMBAT READY</span></div><div class="health-row"><span class="health-cross">+</span><strong id="health-value">100</strong><span class="health-meter"><i id="health-bar"></i></span></div><div class="hud-hint">WASD MOVE <b>·</b> SHIFT QUIET <b>·</b> E INTERACT</div></div><div class="radio-feed" id="radio-feed" role="status"><div class="radio-symbol">◖))</div><div><span class="eyebrow" id="radio-speaker">SFA / ENCRYPTED</span><p id="radio-text">Maintain radio discipline.</p></div></div><div class="weapon"><div class="eyebrow">MK18 / 5.56 MM</div><div class="ammo-row"><img src="assets/ui/rifle.png" alt="Rifle"/><strong id="ammo-value">24</strong><span>/ <b id="reserve-value">96</b></span></div><div class="hud-hint" id="reload-hint">LMB FIRE <b>·</b> R RELOAD</div></div></div><div class="map-overlay hidden" id="map-overlay"><div class="map-heading"><span>MON BREAKWATER / RECON OVERVIEW</span><span>M TO CLOSE</span></div>${mapSVG({ route: true })}<div class="map-legend"><span>◆ MANIFEST</span><span>○ EXTRACTION</span><span>▲ VIPER</span><span>+ FIELD SUPPLY</span></div><p>A: Landing Coast · B: Lighthouse Ridge by boat · C/D: future contracts. Gameplay continues while this map is open.</p></div></div>`;
    this.bindChrome();
    document.querySelector("#pause-button").onclick = () => scene.pause();
    const icon = document.querySelector(".ammo-row>img");
    icon.outerHTML =
      '<button id="weapon-switch" class="weapon-switch" aria-label="Switch weapon"><img src="assets/ui/rifle.png" alt="Current weapon"/></button>';
    document.getElementById("weapon-switch").onclick = () =>
      this.touchMode ? this.showWeapons(scene) : scene.switchWeapon();
    this.refs = Object.fromEntries(
      [
        "objective",
        "raid-time",
        "signal-status",
        "interaction",
        "action-progress",
        "health-value",
        "health-bar",
        "stance",
        "ammo-value",
        "reserve-value",
        "reload-hint",
        "crosshair",
        "hit-marker",
        "hurt-vignette",
        "storage-warning",
      ].map((id) => [id, document.getElementById(id)]),
    );
    document.querySelector(".hud-left>.eyebrow").innerHTML =
      scene.mission.name + ' <span id="raid-time">00:00</span>';
    this.refs["raid-time"] = document.getElementById("raid-time");
    const status = document.createElement("div");
    status.id = "squad-status";
    status.className = "squad-status";
    document.querySelector(".hud-left").append(status);
    const health = document.querySelector(".vitals");
    health.setAttribute("role", "button");
    health.setAttribute("tabindex", "0");
    health.setAttribute("aria-label", "Use medkit");
    health.onclick = () => scene.useMedkit();
    health.onkeydown = (e) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        scene.useMedkit();
      }
    };
    if (this.touchMode) this.bindTouch(scene);
    this.touchLayout.apply(this.root);
    this.toggleMap(scene.mapVisible);
    this.lastHUD = -1;
    this.noticeUntil = 0;
    this.updateHUD(scene, true);
    if (resuming) this.radio("RELAY", "Back on comms. Continue the contract.");
  }
  updateHUD(s, force = false) {
    const pointer = s.input.activePointer;
    this.refs.crosshair.style.transform = `translate(${pointer.x}px,${pointer.y}px)`;
    const hit = this.refs["hit-marker"];
    hit.style.left = pointer.x + "px";
    hit.style.top = pointer.y + "px";
    hit.classList.toggle("hidden", s.hitMarker <= 0);
    this.refs["hurt-vignette"].style.opacity = s.hurtFlash > 0 ? 0.5 : 0;
    if (!force && s.elapsed - this.lastHUD < 0.1) return;
    this.lastHUD = s.elapsed;
    const p = s.player,
      has = s.raid.carried.includes(s.mission.evidence),
      banked = s.raid.carried.length > 0 && !s.hasUnbanked(),
      target = has
        ? s.mission.extract
        : s.mission.id === "frequency" && s.sector === "coast"
          ? DOCKS.coast
          : s.mission.intel;
    this.refs.objective.innerHTML = `<span>${has ? "02" : "01"}</span><div>${has ? "RETURN TO SAFEHOUSE" : s.mission.id === "frequency" && s.sector === "coast" ? "TAKE BOAT TO LIGHTHOUSE" : "RECOVER " + (s.mission.id === "landing" ? "THE MANIFEST" : "RADIO LOGS")}<small>${Math.round(distance(p, target))} M <b>·</b> ${has ? "SAFEHOUSE / SOUTH DOCK" : s.mission.sector.toUpperCase()}</small></div>`;
    this.refs["raid-time"].textContent = timeString(s.elapsed);
    this.refs["signal-status"].classList.toggle("is-banked", banked);
    this.refs["signal-status"].innerHTML = !has
      ? "◇ NO INTEL IN CUSTODY"
      : banked
        ? "◈ EVIDENCE BANKED · SURVIVES DEATH"
        : `<strong>◇ INTEL CARRIED · LOST ON DEATH</strong><small>Hold <kbd>${this.touchMode ? "TX" : "T"}</kbd> stationary to bank it · enemies detect the signal<br>Or extract quietly with the packet.</small>`;
    this.refs["storage-warning"].textContent = this.progression.available
      ? ""
      : "Browser storage unavailable. Progress is kept for this session only.";
    this.refs["health-value"].textContent = Math.ceil(p.hp);
    this.refs["health-bar"].style.width = p.hp + "%";
    this.refs["health-bar"].style.background =
      p.hp < 35 ? "#ed806c" : "#a3bba2";
    const engaged = s.enemies.some((e) => e.hp > 0 && e.state === "ENGAGE");
    this.refs.stance.textContent = engaged
      ? "CONTACT"
      : p.quiet
        ? "QUIET MOVEMENT"
        : "COMBAT READY";
    this.refs.stance.classList.toggle("warning-text", engaged);
    this.refs["ammo-value"].textContent = WEAPONS[p.weapon].melee
      ? "--"
      : String(p.ammo).padStart(2, "0");
    this.refs["reserve-value"].textContent = WEAPONS[p.weapon].melee
      ? "MELEE"
      : p.reserve;
    this.refs["reload-hint"].innerHTML = WEAPONS[p.weapon].melee
      ? "KNIFE / +22% RUN SPEED"
      : s.reload > 0
        ? `RELOADING · ${s.reload.toFixed(1)}S`
        : p.ammo === 0 && p.reserve === 0
          ? "OUT OF AMMO · FIND FIELD SUPPLY"
          : this.touchMode
            ? "RIGHT STICK · AIM / FIRE"
            : "LMB FIRE <b>·</b> R RELOAD";
    const weapon = WEAPONS[p.weapon];
    document.querySelector(".weapon>.eyebrow").textContent = this.touchMode
      ? weapon.melee
        ? "KNIFE / FAST RUN"
        : weapon.slot.toUpperCase() + " / " + weapon.name
      : weapon.name + " / " + weapon.caliber;
    const icon = document.querySelector("#weapon-switch img");
    const src = weapon.melee
      ? "assets/ui/knife.svg"
      : OWNER_MEDIA
        ? MEDIA_ROOT + "ui/" + weapon.icon + ".png"
        : "assets/ui/rifle.png";
    if (icon.getAttribute("src") !== src) icon.src = src;
    document.getElementById("weapon-switch").title = this.touchMode
      ? "Select primary, secondary or knife"
      : "Q / quick switch; 1, 2, 3 / slots";
    const hint = s.targetHint(),
      interaction = this.refs.interaction;
    interaction.classList.toggle(
      "hidden",
      !hint || s.extracting || s.transmission > 0,
    );
    if (hint)
      interaction.innerHTML = `<kbd>${this.touchMode ? (hint.action === "revive" ? "HOLD" : "USE") : hint.key}</kbd><div>${hint.title}<small>${this.inputText(hint.detail)}</small></div>`;
    let label = "",
      fraction = 0,
      detail = "";
    if (s.extracting) {
      label = "EXTRACTION INBOUND";
      fraction = s.extraction / s.mission.extractionSeconds;
      detail = `${Math.max(0, s.mission.extractionSeconds - s.extraction).toFixed(1)}S · HOLD THE DOCK`;
    } else if (s.transmission > 0) {
      label = "LAST TRANSMISSION";
      fraction =
        s.transmission /
        (this.progression.data.signalFilter
          ? s.mission.upgradedTransmissionSeconds
          : s.mission.transmissionSeconds);
      detail = "UPLINK ACTIVE · STAY STILL · HOLD T";
    }
    const action = this.refs["action-progress"];
    action.classList.toggle("hidden", !label);
    if (label)
      action.innerHTML = `<div>${label}<span>${Math.round(fraction * 100)}%</span></div><div class="progress-track"><i style="width:${fraction * 100}%"></i></div><small>${this.inputText(detail)}</small>`;
    if (performance.now() > this.noticeUntil)
      document.getElementById("notice")?.classList.add("hidden");
    const healButton = document.getElementById("touch-heal");
    if (healButton) {
      healButton.innerHTML = "+<small>MED " + p.medkits + "</small>";
      healButton.setAttribute(
        "aria-label",
        "Use field medkit (" + p.medkits + " available)",
      );
    }
    const status = document.getElementById("squad-status");
    if (status)
      status.textContent =
        s.mode === "solo"
          ? `SOLO · REVIVE ${p.selfKit} · MEDKITS ${p.medkits}`
          : s.companions
              .map((a) => `${a.name} ${a.hp}HP ${a.state}`)
              .join(" / ") + ` · MED ${p.medkits}`;
    let recovery = document.getElementById("recovery-panel");
    if (p.downed) {
      if (!recovery) {
        recovery = document.createElement("div");
        recovery.id = "recovery-panel";
        recovery.className = "recovery-panel";
        this.root.append(recovery);
      }
      const unsafe = s.enemies.some(
        (e) => e.hp > 0 && e.state === "ENGAGE" && distance(e, p) < 190,
      );
      if (!recovery.querySelector("button"))
        recovery.innerHTML = `<strong>OPERATOR DOWN · ${Math.ceil(s.bleedout)}S</strong><p>${s.mode === "solo" ? (this.touchMode ? "Hold REVIVE when out of direct fire. Kit is consumed once." : "Hold E when out of direct fire. Kit is consumed once.") : "Doc or Spectre will revive when close and safe. One recovery this raid."}</p><progress max="${s.mode === "solo" ? 4 : 3.5}" value="${s.reviveProgress}"></progress><button id="revive-control" ${s.mode === "squad" ? "disabled" : ""}>${s.mode === "solo" ? "HOLD TO REVIVE" : "AWAITING SQUAD SUPPORT"}</button>`;
      const b = recovery.querySelector("button");
      b.onpointerdown = (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        s.touch.revive = true;
      };
      b.onpointerup =
        b.onpointercancel =
        b.onlostpointercapture =
          () => (s.touch.revive = false);
    } else recovery?.remove();
    if (recovery && p.downed) {
      recovery.querySelector("strong").textContent =
        "OPERATOR DOWN · " + Math.ceil(s.bleedout) + "S";
      recovery.querySelector("progress").value = s.reviveProgress;
    }
    let transit = document.getElementById("transit-panel");
    if (s.transit) {
      if (!transit) {
        transit = document.createElement("div");
        transit.id = "transit-panel";
        transit.className = "transit-panel";
        transit.innerHTML = journeyMarkup(s);
        this.root.append(transit);
        transit.querySelector("#journey-pause").onclick = () => s.pause();
      }
      updateJourney(transit, s);
    } else transit?.remove();
    this.refreshMap(s);
  }
  showWeapons(s) {
    const existing = document.getElementById("weapon-picker");
    if (existing) {
      existing.remove();
      return;
    }
    if (s.player.downed || s.transit || s.done) return;
    const menu = document.createElement("div");
    menu.id = "weapon-picker";
    menu.className = "weapon-picker";
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", "Weapon slots");
    menu.innerHTML = ["primary", "secondary", "knife"]
      .map(
        (slot) =>
          `<button data-slot="${slot}" aria-label="Equip ${slot}" class="${s.player.weapon === s.player.slots[slot] ? "selected" : ""}"><small>${slot.toUpperCase()}</small><b>${WEAPONS[s.player.slots[slot]].name}</b>${slot === "knife" ? "<span>+22% run speed</span>" : ""}</button>`,
      )
      .join("");
    this.root.append(menu);
    menu.querySelectorAll("button").forEach(
      (b) =>
        (b.onclick = () => {
          s.switchWeapon(b.dataset.slot);
          menu.remove();
          this.updateHUD(s, true);
        }),
    );
    const r = document.getElementById("weapon-switch").getBoundingClientRect(),
      m = menu.getBoundingClientRect();
    menu.style.left =
      Math.max(
        8,
        Math.min(innerWidth - m.width - 8, r.x + r.width / 2 - m.width / 2),
      ) + "px";
    menu.style.top =
      Math.max(8, Math.min(innerHeight - m.height - 8, r.y - m.height - 10)) +
      "px";
  }
  refreshMap(s) {
    const MISSION = s.mission;
    const p = s.player,
      enemyDots = s.enemies
        .filter(
          (e) => e.hp > 0 && (e.state === "ENGAGE" || distance(e, p) < 210),
        )
        .map((e) => `<circle cx="${e.x}" cy="${e.y}" r="14" fill="#ed8c70"/>`)
        .join("");
    const markers = `<circle cx="${MISSION.supply.x}" cy="${MISSION.supply.y}" r="10" fill="#abbc99"/>${s.mission.id === "frequency" && !s.surveillanceOff ? `<circle cx="${MISSION.fragment.x}" cy="${MISSION.fragment.y}" r="17" fill="#9edbd0"/>` : ""}${s.companions
      .filter((a) => a.hp > 0)
      .map((a) => `<circle cx="${a.x}" cy="${a.y}" r="12" fill="#8dd9bf"/>`)
      .join(
        "",
      )}${enemyDots}<path d="M0 -23 L15 15 L0 8 L-15 15Z" transform="translate(${p.x},${p.y}) rotate(${(p.angle * 180) / Math.PI + 90})" fill="#e5f4d7" stroke="#173b3d" stroke-width="4"/>`;
    document
      .querySelectorAll("#map-actors")
      .forEach((el) => (el.innerHTML = markers));
  }
  toggleMap(show) {
    document.querySelector("#map-overlay")?.classList.toggle("hidden", !show);
  }
  clearPauseKey() {
    if (this.pauseKeyHandler) {
      document.removeEventListener("keydown", this.pauseKeyHandler);
      this.pauseKeyHandler = null;
    }
  }
  bindTouch(s) {
    const controls = document.createElement("div");
    controls.className = "touch-controls";
    controls.innerHTML = `<div class="touch-stick move-stick" id="move-stick" role="group" aria-label="Movement joystick"><span class="stick-knob"></span><b>MOVE</b></div><div class="touch-stick aim-stick" id="aim-stick" role="group" aria-label="Aim and fire joystick"><span class="stick-knob"></span><b>AIM / FIRE</b></div><div class="touch-actions"><button class="touch-button" id="touch-interact" aria-label="Interact">USE<small>INTERACT</small></button><button class="touch-button" id="touch-reload" aria-label="Reload">LOAD<small>RELOAD</small></button></div><button class="touch-button transmit-button" id="touch-transmit" aria-label="Hold to transmit">TX<small>HOLD TO SEND</small></button><button class="touch-button quiet-button" id="touch-quiet" aria-label="Toggle quiet movement">◇<small>QUIET</small></button><button class="touch-button touch-map" id="touch-map" aria-label="Toggle tactical map">MAP<small>OVERVIEW</small></button>`;
    const heal = document.createElement("button");
    heal.id = "touch-heal";
    heal.className = "touch-button touch-heal";
    heal.setAttribute("aria-label", "Use field medkit");
    heal.innerHTML = "+<small>MEDKIT</small>";
    heal.onclick = () => s.useMedkit();
    controls.append(heal);
    this.root.querySelector(".hud").append(controls);
    const joystick = (id, aim) => {
      const el = document.getElementById(id),
        knob = el.querySelector(".stick-knob");
      let active = null;
      const update = (e) => {
        if (e.pointerId !== active) return;
        this.inputMode = "touch";
        const r = el.getBoundingClientRect(),
          radius = r.width * 0.34;
        let x = (e.clientX - r.left - r.width / 2) / radius,
          y = (e.clientY - r.top - r.height / 2) / radius;
        const length = Math.hypot(x, y);
        if (length > 1) {
          x /= length;
          y /= length;
        }
        if (length < 0.14) {
          x = 0;
          y = 0;
        }
        knob.style.transform = `translate(${x * radius}px,${y * radius}px)`;
        if (aim) {
          if (length > 0.14) s.touch.aimAngle = Math.atan2(y, x);
          s.touch.fire = length > 0.3;
        } else {
          s.touch.moveX = x;
          s.touch.moveY = y;
        }
      };
      el.addEventListener("pointerdown", (e) => {
        if (active !== null) return;
        e.preventDefault();
        active = e.pointerId;
        el.setPointerCapture(active);
        el.classList.add("active");
        update(e);
      });
      el.addEventListener("pointermove", update);
      const release = (e) => {
        if (e.pointerId !== active) return;
        active = null;
        knob.style.transform = "translate(0,0)";
        el.classList.remove("active");
        if (aim) s.touch.fire = false;
        else {
          s.touch.moveX = 0;
          s.touch.moveY = 0;
        }
      };
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("lostpointercapture", release);
    };
    joystick("move-stick", false);
    joystick("aim-stick", true);
    for (const [id, key] of [
      ["touch-interact", "interact"],
      ["touch-reload", "reload"],
    ])
      document.getElementById(id).addEventListener("pointerdown", (e) => {
        e.preventDefault();
        s.touch[key] = true;
      });
    const tx = document.getElementById("touch-transmit");
    tx.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      tx.setPointerCapture(e.pointerId);
      s.touch.transmit = true;
      tx.classList.add("active");
    });
    const releaseTx = () => {
      s.touch.transmit = false;
      tx.classList.remove("active");
    };
    tx.addEventListener("pointerup", releaseTx);
    tx.addEventListener("pointercancel", releaseTx);
    tx.addEventListener("lostpointercapture", releaseTx);
    document.getElementById("touch-quiet").onclick = (e) => {
      s.touch.quiet = !s.touch.quiet;
      e.currentTarget.classList.toggle("active", s.touch.quiet);
    };
    document
      .getElementById("touch-quiet")
      .classList.toggle("active", s.touch.quiet);
    document.getElementById("touch-map").onclick = () => {
      s.mapVisible = !s.mapVisible;
      this.toggleMap(s.mapVisible);
    };
    document.querySelector(".map-heading>span:last-child").textContent =
      "TAP MAP TO CLOSE";
    document.getElementById("pause-button").textContent = "Ⅱ PAUSE";
    document.querySelector(".vitals .hud-hint").textContent =
      "TAP + MED TO HEAL";
    document.querySelector(".weapon .hud-hint").textContent =
      "RIGHT STICK · AIM & FIRE";
    this.refs.crosshair.classList.add("hidden");
  }
  notice(title, message) {
    const el = document.getElementById("notice");
    if (!el) return;
    el.innerHTML = `<span class="eyebrow">${title}</span><p>${this.inputText(message)}</p>`;
    el.classList.remove("hidden");
    this.noticeUntil = performance.now() + 5500;
  }
  radio(speaker, message) {
    const name = document.querySelector("#radio-speaker"),
      text = document.querySelector("#radio-text");
    if (name) name.textContent = speaker + " / ENCRYPTED";
    if (text) text.textContent = this.inputText(message);
  }
  showPause(s) {
    const overlay = document.createElement("div");
    overlay.className = "modal-shade";
    overlay.id = "pause-modal";
    overlay.innerHTML = `<section class="pause-panel"><div class="eyebrow">SECURE CHANNEL / PAUSED</div><h2>HOLD POSITION.</h2><p>Operation time, patrols and extraction are paused.</p>${this.touchMode ? '<button class="text-button" id="pause-controls">VIEW TOUCH CONTROLS</button>' : `<div class="controls-grid">${this.controlGuide()}</div>`}<button id="resume" class="primary">RESUME OPERATION <span>→</span></button><button id="abandon" class="secondary">ABORT RAID & RETURN TO MENU</button><p class="fineprint">Aborting loses carried evidence. Transmitted evidence remains saved.</p></section>`;
    this.root.append(overlay);
    if (this.touchMode) {
      overlay.querySelector("#pause-controls").onclick = () =>
        this.showUtility("controls");
      const edit = document.createElement("button");
      edit.id = "pause-customize";
      edit.className = "secondary";
      edit.textContent = "CUSTOMIZE TOUCH CONTROLS";
      overlay.querySelector("#abandon").before(edit);
      edit.onclick = () => this.customizeTouch();
    }
    document.querySelector("#resume").onclick = () => s.resume();
    document.querySelector("#abandon").onclick = () => {
      this.game.scene.stop("Raid");
      this.showMenu();
    };
    this.clearPauseKey();
    this.pauseKeyHandler = (e) => {
      if (document.getElementById("touch-editor")) return;
      if (e.code === "Escape" && document.getElementById("pause-modal"))
        s.resume();
    };
    document.addEventListener("keydown", this.pauseKeyHandler);
  }
  showResults(s, result) {
    const first = result.success && this.progression.data.completions === 1;
    const evidence = s.raid.carried.map((id) => ({
      name: EVIDENCE[id],
      saved: this.progression.data.evidence.includes(id),
    }));
    this.root.className = "";
    this.root.innerHTML = `<main class="results screen">${this.chrome()}<div class="results-grid"><section><div class="eyebrow">AFTER ACTION REPORT / OPERATION SILENT TIDE</div><div class="result-stamp ${result.success ? "" : "failed"}">${result.success ? "OPERATOR EXTRACTED" : "SIGNAL LOST"}</div><h1 class="section-title">${result.success ? "EVIDENCE<br>OUTLIVES US." : "THE ISLAND<br>KEEPS ITS SECRETS."}</h1><p class="muted body-copy">${result.success ? "Silent Landing is complete. This was the first contract. The squad’s later disappearance remains unresolved." : "Viper is down. Carried evidence was lost. Any successfully transmitted packets remain in the SFA archive."}</p><div class="score-table"><div><span>TIME ON ISLAND</span><b>${timeString(result.elapsed)}</b></div><div><span>OBJECTIVES</span><b>+${s.raid.objectiveXP} XP</b></div><div><span>EXTRACTION BONUS</span><b>+${result.success ? 300 : 0} XP</b></div><div><span>LOW SIGNATURE BONUS</span><b>+${result.success && s.raid.quiet ? 100 : 0} XP</b></div><div><span>NEW EVIDENCE</span><b>+${result.evidenceXP + s.raid.bankedXP} XP</b></div><div class="total-row"><span>RAID AWARD</span><b>+${result.totalXP} XP</b></div></div><div class="brief-buttons"><button class="primary" id="replay">${result.success ? "NEXT CONTRACT" : "RETRY OPERATION"} <span>→</span></button><button class="secondary" id="menu">MAIN MENU</button></div></section><aside><div class="transmission-card"><div class="eyebrow"><span class="status-dot"></span> ARCHIVE FRAGMENT / FUTURE INTERCEPT</div><h2>THE LAST<br>TRANSMISSION</h2><blockquote>“SFA Command…<br>the island is not what we expected.<br>Do not send another team until<br>you know who—”</blockquote><div class="waveform">${Array.from({ length: 60 }, (_, i) => `<i style="height:${8 + (Math.sin(i * 2.3) * 0.5 + 0.5) * 34}px"></i>`).join("")}</div><div class="fineprint warning-text">TRANSMISSION ENDS / VIPER ONE LATER CLASSIFIED MIA</div></div><div class="evidence-results"><div class="eyebrow">SFA EVIDENCE ARCHIVE</div>${evidence.length ? evidence.map((e) => `<div><span>${e.name}</span><b class="${e.saved ? "cyan-text" : "warning-text"}">${e.saved ? "BANKED" : "LOST"}</b></div>`).join("") : '<p class="muted">No evidence recovered this raid.</p>'}</div>${this.progression.data.signalFilter ? `<div class="replay-note"><b>${first ? "UPGRADE UNLOCKED" : "UPGRADE EQUIPPED"} / SIGNAL FILTER</b><p>Transmission: 4.0s → 2.5s. Next contract: recover the optional Nightglass fragment at the northern relay. North patrol route changed.</p></div>` : '<p class="fineprint">Extract successfully to unlock the signal filter and a new optional objective.</p>'}<p class="fineprint">${this.progression.available ? "Progress saved in this browser." : "Storage unavailable. Progress remains in memory for this session."} Total career XP: ${this.progression.data.xp}.</p></aside></div></main>`;
    const level = levelProgress(this.progression.data.xp);
    document.querySelector(".results .body-copy").textContent = result.success
      ? s.mission.ending
      : "Recovery failed. Carried evidence was lost; completed transmissions remain in the SFA archive.";
    if (s.raid.valuableXP) {
      const row = document.createElement("div");
      row.innerHTML =
        "<span>VALUABLES EXTRACTED</span><b>+" +
        (result.success ? s.raid.valuableXP : 0) +
        " XP</b>";
      document
        .querySelector(".score-table")
        .insertBefore(row, document.querySelector(".total-row"));
    }
    const lev = document.createElement("div");
    lev.className = "level-progress";
    lev.innerHTML = `<b>LEVEL ${level.level}</b><progress value="${level.current}" max="600"></progress><small>${level.current} / 600 XP</small>`;
    document.querySelector(".score-table").after(lev);
    const upgrade = document.querySelector(".results .replay-note");
    if (upgrade)
      upgrade.innerHTML =
        "<b>SIGNAL SCRAMBLER LEVEL 1 / " +
        (first ? "UNLOCKED" : "EQUIPPED") +
        "</b><p>2.5s uplink. Mission 02: Dead Frequency is playable on Lighthouse Ridge, reached by boat. Missions 03–04 are future expansion milestones.</p>";
    this.bindChrome();
    if (result.success && s.mission.id === "frequency")
      document.querySelector("#replay").innerHTML =
        "REPLAY CONTRACT <span>→</span>";
    document.querySelector("#replay").onclick = () => {
      this.selectedMission =
        result.success && s.mission.id === "landing"
          ? "frequency"
          : s.mission.id;
      this.showBriefing();
    };
    document.querySelector("#menu").onclick = () => {
      this.game.scene.stop("Raid");
      this.showMenu();
    };
  }
  showCredits() {
    this.audio.setMenuMusic(true);
    this.clearPauseKey();
    this.root.className = "";
    this.root.innerHTML = `<main class="credits screen">${this.chrome()}<section class="credits-content"><header class="credits-intro"><div class="eyebrow">SFA ARCHIVE / PROJECT DOSSIER</div><h1 class="section-title">INTEL &amp; CREDITS</h1><p>Created by <b>Aniket [UGZ]</b>. EXFIL PROTOCOL: FIRST CONTACT follows Viper One's first reconnaissance mission on Mon Breakwater Island, before the squad falls silent.</p></header><div class="credits-grid"><section class="credit-section"><h2>OPERATION SILENT TIDE</h2><p>Recover the shipping manifest in Silent Landing. Follow the evidence by boat to Lighthouse Ridge in Dead Frequency. Transmit what you find or risk carrying it home. Doc and Spectre support the optional squad deployment.</p></section><section class="credit-section"><h2>WORLD &amp; INSPIRATION</h2><p>Inspired by the tactical atmosphere of Counter-Strike 1.6 and the island geography of <b>de_mon by MaMuS</b>. This independent 2D interpretation has its own missions and routes. EXFIL's setting, story, title artwork and logo are presented by Aniket [UGZ].</p></section><section class="credit-section"><h2>ART &amp; VISUAL INSPIRATION</h2><p>Counter-Strike 1.6 inspired the tactical look, atmosphere and sound direction. Character and weapon designs were developed with Auto Sprite AI. EXFIL's interface, island layout and animated boat journey were created for this game. Selected ambience, radio and music come from the supplied EXFIL audio library.</p></section><section class="credit-section"><h2>DEVELOPMENT &amp; TECHNOLOGY</h2><p>Built with Phaser, JavaScript and Vite. AI-assisted programming helped bring the gameplay systems, interface and prototype to life, with creative direction and game design by Aniket [UGZ]. Enemies use authored behavior and pathfinding. Progress and control preferences stay in your browser; no accounts, purchases or analytics.</p></section></div><div class="brief-buttons"><button class="primary" id="credits-back">BACK TO OPERATIONS <span>&rarr;</span></button><button class="secondary" id="reset-progress" aria-expanded="false" aria-controls="reset-confirm">RESET SAVED PROGRESS</button></div><div id="reset-confirm" class="hidden"><p>Delete this browser's XP, saved evidence and mission unlocks? This cannot be undone.</p><button class="secondary" id="confirm-reset">DELETE PROGRESS</button><button class="text-button" id="cancel-reset">CANCEL</button></div></section></main>`;
    this.bindChrome();
    document.querySelector("#credits-back").onclick = () => this.showMenu();
    const reset = document.querySelector("#reset-progress"),
      confirm = document.querySelector("#reset-confirm");
    reset.onclick = () => {
      confirm.classList.remove("hidden");
      reset.setAttribute("aria-expanded", "true");
      document.querySelector("#cancel-reset").focus();
    };
    document.querySelector("#cancel-reset").onclick = () => {
      confirm.classList.add("hidden");
      reset.setAttribute("aria-expanded", "false");
      reset.focus();
    };
    document.querySelector("#confirm-reset").onclick = () => {
      this.progression.reset();
      this.audio.muted = this.progression.data.muted;
      if (this.audio.gameBus)
        this.audio.gameBus.gain.value = this.audio.muted ? 0 : 1;
      this.audio.musicMuted = this.progression.data.musicMuted;
      this.audio.syncMenuMusic();
      this.selectedMission = "landing";
      this.showMenu();
    };
  }
}
