export const SAVE_KEY = "exfil.first-contact.v1";
export const emptySave = () => ({
  version: 1,
  xp: 0,
  completions: 0,
  evidence: [],
  signalFilter: false,
  muted: false,
  completedMissions: [],
  lastMission: "landing",
});
export const levelProgress = (xp) => ({
  level: Math.floor(Math.max(0, xp) / 600) + 1,
  current: Math.max(0, xp) % 600,
  needed: 600,
});
export function validateSave(raw) {
  const base = emptySave();
  if (!raw || raw.version !== 1 || typeof raw !== "object") return base;
  return {
    ...base,
    xp: Number.isFinite(raw.xp) ? Math.max(0, Math.floor(raw.xp)) : 0,
    completions: Number.isFinite(raw.completions)
      ? Math.max(0, Math.floor(raw.completions))
      : 0,
    evidence: Array.isArray(raw.evidence)
      ? [
          ...new Set(
            raw.evidence.filter((id) =>
              ["manifest", "nightglass", "radioLogs", "surveillance"].includes(
                id,
              ),
            ),
          ),
        ]
      : [],
    completedMissions: Array.isArray(raw.completedMissions)
      ? [
          ...new Set(
            raw.completedMissions.filter((id) =>
              ["landing", "frequency"].includes(id),
            ),
          ),
        ]
      : raw.completions > 0
        ? ["landing"]
        : [],
    lastMission: raw.lastMission === "frequency" ? "frequency" : "landing",
    signalFilter: raw.signalFilter === true || raw.completions > 0,
    muted: raw.muted === true,
  };
}
export class Progression {
  constructor(storage) {
    this.storage = storage;
    this.available = true;
    this.data = emptySave();
    try {
      this.data = validateSave(JSON.parse(storage.getItem(SAVE_KEY)));
    } catch {
      this.available = false;
    }
  }
  save() {
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.available = true;
    } catch {
      this.available = false;
    }
    return this.available;
  }
  bank(ids) {
    const newIds = [...new Set(ids)].filter(
      (id) =>
        ["manifest", "nightglass", "radioLogs", "surveillance"].includes(id) &&
        !this.data.evidence.includes(id),
    );
    this.data.evidence = [...new Set([...this.data.evidence, ...newIds])];
    this.data.xp += newIds.length * 150;
    this.save();
    return newIds.length * 150;
  }
  complete(raid) {
    if (raid.settled) return null;
    raid.settled = true;
    const evidenceXP = raid.success ? this.bank(raid.carried) : 0;
    const missionXP =
      raid.objectiveXP +
      (raid.success ? 300 + (raid.valuableXP || 0) : 0) +
      (raid.success && raid.quiet ? 100 : 0);
    this.data.xp += missionXP;
    if (raid.success) {
      this.data.completions++;
      this.data.signalFilter = true;
      const id = raid.missionId || "landing";
      if (!this.data.completedMissions.includes(id))
        this.data.completedMissions.push(id);
      this.data.lastMission = id === "landing" ? "frequency" : id;
    }
    this.save();
    return {
      missionXP,
      evidenceXP,
      totalXP: missionXP + evidenceXP + (raid.bankedXP || 0),
    };
  }
  reset() {
    this.data = emptySave();
    this.save();
  }
}
