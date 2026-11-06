import { OWNER_MEDIA, MEDIA_ROOT, SOUND_FILES } from "../data/media.js";
const VOICES = {
  cover: ["team-cover", "TEAM / COVERING YOU"],
  deploy: ["team-deploy", "TEAM / MOVE OUT"],
  objective: ["team-objective", "TEAM / OBJECTIVE SECURED"],
  extract: ["team-extract", "TEAM / EXTRACTION POINT"],
  hold: ["team-hold", "TEAM / HOLD POSITION"],
  success: ["team-success", "TEAM / MISSION ACCOMPLISHED"],
  failed: ["team-failed", "TEAM / OBJECTIVE LOST"],
  kill: ["team-kill", "TEAM / TARGET NEUTRALIZED"],
  contact: ["team-spotted", "TEAM / ENEMY SPOTTED"],
  enemyContact: ["enemy-contact", "PMC / TARGET SPOTTED"],
  enemySearch: ["enemy-search", "PMC / HEARD SOMETHING"],
  enemyLost: ["enemy-lost", "PMC / LOST CONTACT"],
  ack: ["radio-ack", "TEAM / ROGER"],
};
export class AudioSystem {
  constructor(progression) {
    this.progression = progression;
    this.muted = progression.data.muted;
    this.buffers = new Map();
    this.cooldowns = new Map();
    this.stats = { decoded: 0, effects: 0, voices: [], failures: [] };
    this.voiceBusy = 0;
    this.voicePriority = 0;
    this.stepIndex = 0;
  }
  start() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.34;
        this.master.connect(this.ctx.destination);
        this.sfx = this.ctx.createGain();
        this.sfx.gain.value = 0.58;
        this.sfx.connect(this.master);
        this.voiceBus = this.ctx.createGain();
        this.voiceBus.gain.value = 1.1;
        this.voiceBus.connect(this.master);
        const count = this.ctx.sampleRate * 4,
          buffer = this.ctx.createBuffer(1, count, this.ctx.sampleRate),
          data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < count; i++) {
          last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
          data[i] = last * 4;
        }
        this.sea = this.ctx.createBufferSource();
        this.sea.buffer = buffer;
        this.sea.loop = true;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 420;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.14;
        this.sea.connect(filter).connect(gain).connect(this.master);
        this.sea.start();
        this.ready = this.loadMedia();
      }
      this.ctx.resume().catch(() => {});
    } catch {
      /* Audio is optional on browsers without Web Audio. */
    }
  }
  toggle() {
    this.muted = !this.muted;
    this.progression.data.muted = this.muted;
    this.progression.save();
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.34;
    return this.muted;
  }
  async loadMedia() {
    if (!OWNER_MEDIA) {
      this.mediaLoaded = true;
      return;
    }
    await Promise.all(
      SOUND_FILES.map(async (name) => {
        try {
          const response = await fetch(MEDIA_ROOT + "audio/" + name + ".wav");
          if (!response.ok) throw Error(response.status);
          const buffer = await this.ctx.decodeAudioData(
            await response.arrayBuffer(),
          );
          this.buffers.set(name, buffer);
          this.stats.decoded++;
        } catch (error) {
          this.stats.failures.push(name + ": " + error.message);
        }
      }),
    );
    this.mediaLoaded = true;
    const buffer = this.buffers.get("ocean");
    if (buffer) {
      this.ocean = this.ctx.createBufferSource();
      this.ocean.buffer = buffer;
      this.ocean.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.1;
      this.ocean.connect(gain).connect(this.master);
      this.ocean.start();
    }
  }
  sample(
    name,
    { volume = 1, rate = 1, pan = 0, bus = this.sfx, loop = false } = {},
  ) {
    const buffer = this.buffers.get(name);
    if (!buffer || !this.ctx || this.muted) return null;
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.loop = loop;
    gain.gain.value = volume;
    source.connect(gain);
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(p).connect(bus);
    } else gain.connect(bus);
    source.start();
    this.stats.effects++;
    return source;
  }
  voice(event, { priority = 1, position, listener } = {}) {
    if (!OWNER_MEDIA || this.muted || !this.ctx) return;
    const entry = VOICES[event];
    if (!entry) return;
    if (!this.mediaLoaded) {
      this.ready?.then(() =>
        this.voice(event, { priority, position, listener }),
      );
      return;
    }
    const now = this.ctx.currentTime;
    if (now < (this.cooldowns.get(event) || 0)) return;
    let volume = 0.9,
      pan = 0;
    if (position && listener) {
      const d = Math.hypot(position.x - listener.x, position.y - listener.y);
      if (d > 420) return;
      volume = Math.max(0.1, 1 - d / 500) * 0.7;
      pan = (position.x - listener.x) / 350;
    }
    if (now < this.voiceBusy && priority <= this.voicePriority) {
      if (priority >= 3 && !event.startsWith("enemy")) {
        clearTimeout(this.pendingVoice);
        this.pendingVoice = setTimeout(
          () => this.voice(event, { priority, position, listener }),
          (this.voiceBusy - now + 0.08) * 1000,
        );
      }
      return;
    }
    clearTimeout(this.pendingVoice);
    if (this.voiceSource)
      try {
        this.voiceSource.stop();
      } catch {}
    this.voiceSource = this.sample(entry[0], {
      volume,
      pan,
      bus: this.voiceBus,
    });
    if (!this.voiceSource) return;
    this.cooldowns.set(event, now + (event.startsWith("enemy") ? 8 : 5));
    this.voicePriority = priority;
    this.voiceBusy = now + this.buffers.get(entry[0]).duration + 0.2;
    this.stats.voices.push(event);
    this.onVoice?.({
      event,
      label: entry[1],
      duration: this.buffers.get(entry[0]).duration,
    });
  }
  footstep({ quiet = false, wood = false } = {}) {
    if (!quiet)
      this.sample(wood ? "wood1" : ++this.stepIndex % 2 ? "step1" : "step2", {
        volume: 0.13,
        rate: 0.94 + Math.random() * 0.12,
      });
  }
  boatStart() {
    if (!this.boat)
      this.boat = this.sample("boat", { loop: true, volume: 0.12 });
  }
  boatStop() {
    if (this.boat) {
      try {
        this.boat.stop();
      } catch {}
      this.boat = null;
    }
  }
  tone(freq = 600, duration = 0.09, type = "sine", volume = 0.15, end = freq) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime,
      osc = this.ctx.createOscillator(),
      gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, end),
      now + duration,
    );
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(now + duration);
  }
  play(name, options = {}) {
    const sample = {
      shot:
        options.weapon === "usp"
          ? "usp"
          : options.weapon === "ak47"
            ? "ak"
            : "m4",
      enemy: "ak",
      reload: "clip-out",
      reloadFinish: "bolt",
      hit: "hit",
      death: "death",
      switch: "clip-in",
    }[name];
    if (
      sample &&
      this.sample(sample, {
        volume: name === "enemy" ? 0.3 : name === "hit" ? 0.5 : 0.7,
        pan: options.pan || 0,
      })
    )
      return;
    if (name === "knife") this.tone(950, 0.1, "triangle", 0.13, 130);
    else if (name === "shot")
      this.tone(
        options.weapon === "usp" ? 240 : 125,
        0.07,
        "sawtooth",
        0.2,
        32,
      );
    else if (name === "enemy") this.tone(95, 0.08, "square", 0.1, 25);
    else if (name === "reload" || name === "switch" || name === "reloadFinish")
      this.tone(1300, 0.07, "triangle", 0.17, 500);
    else if (name === "hit" || name === "death")
      this.tone(70, 0.12, "sawtooth", 0.25, 24);
    else if (name === "alert") this.tone(480, 0.3, "square", 0.1, 260);
    else if (name === "transmit") this.tone(720, 0.14, "sine", 0.2, 1450);
    else if (name === "success") {
      this.tone(440, 0.45, "triangle", 0.2, 880);
    } else this.tone(820, 0.08, "sine", 0.16, 1100);
  }
}
