import { levelFromXp, threshold } from "./xp.ts";

/** The five challenges already stored on a profile. Nothing else counts as an award. */
export const ACHIEVEMENTS = [
  { id: "first", name: "أول صكة", detail: "أكمل صكة واحدة." },
  { id: "win", name: "أول فوز", detail: "سجّل أول فوز." },
  { id: "streak", name: "سلسلة ثلاث", detail: "ثلاث انتصارات متتالية." },
  { id: "kaboot", name: "كبوت", detail: "كبوت واحد." },
  { id: "ten", name: "عشر صكات", detail: "عشر صكات." },
] as const;

const FACES = ["٧", "٨", "٩", "١٠", "ولد", "بنت", "شايب", "إكة"] as const;
const SUITS = ["♦", "♣", "♥", "♠"] as const;
const TITLES = ["جديد", "مبتدئ", "هاوي", "محترف", "مخضرم", "خبير", "شيخ", "قيد"] as const;

export type Activity = "offline" | "online" | "room" | "live";

export function knownAchievements(raw: unknown): string[] {
  const ids = new Set<string>(ACHIEVEMENTS.map((item) => item.id));
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && ids.has(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

/** Escape a player-typed search so % and _ stay literal. */
export function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function isAdminId(userId: string, env: string | undefined) {
  return (env || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .includes(userId);
}

/** A seat heartbeat newer than the stale window wins over a quiet profile. */
export function activityOf(profileOnline: boolean, phase: string | null): Activity {
  if (phase === "live") return "live";
  if (phase === "lobby") return "room";
  return profileOnline ? "online" : "offline";
}

export function countField(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(1_000_000, Math.floor(n));
}

export function rankCard(total: number) {
  const xp = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const stage = levelFromXp(xp);
  if (stage >= 32) {
    return {
      stage, xp, into: 0, need: 0, pct: 100,
      face: "الجوكر", suit: "", title: "قراند ماستر",
      line: "الجوكر — قراند ماستر", red: false,
    };
  }
  const face = FACES[Math.floor(stage / 4)];
  const suit = SUITS[stage % 4];
  const title = TITLES[Math.floor(stage / 4)];
  const from = threshold(stage);
  const need = threshold(stage + 1) - from;
  const into = Math.max(0, xp - from);
  const pct = need > 0 ? Math.max(0, Math.min(100, Math.round((into / need) * 100))) : 100;
  return {
    stage, xp, into, need, pct, face, suit, title,
    line: `${face}${suit} — ${title}`,
    red: suit === "♥" || suit === "♦",
  };
}
