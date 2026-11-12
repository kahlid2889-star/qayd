/** Server-authoritative Baloot XP ladder. 32 cards + joker. */

export const JOKER_COLOR = "#1A1A1A";
export const ACE_SPADES_XP = 29_450;
export const JOKER_XP = 59_450;

export const RANK_META = [
  { rank: "7", titleAr: "جديد", color: "#C0C0C0" },
  { rank: "8", titleAr: "مبتدئ", color: "#F5F5DC" },
  { rank: "9", titleAr: "هاوي", color: "#FFFDD0" },
  { rank: "10", titleAr: "محترف", color: "#D4AF37" },
  { rank: "J", titleAr: "مخضرم", color: "#4A0E17" },
  { rank: "Q", titleAr: "خبير", color: "#808000" },
  { rank: "K", titleAr: "شيخ", color: "#800020" },
  { rank: "A", titleAr: "قيد", color: "#F8F8FF" },
] as const;

const SUITS = ["♦", "♣", "♥", "♠"] as const;

export const EVAL_XP = [0, 10, 20, 30, 50] as const;
export const MAX_HIDDEN_CUTS = 12;
export const MAX_CAUGHT_CUTS = 40;

export type CutReport = {
  hidden: [number, number, number, number];
  caught: [number, number, number, number];
};

/** Four seat grades from the host. Anything else becomes 0. */
export function clampEvalList(value: unknown): [number, number, number, number] {
  const src = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((i) => {
    const n = Number(src[i]);
    return (EVAL_XP as readonly number[]).includes(n) ? n : 0;
  }) as [number, number, number, number];
}

/**
 * Online tables take the buyer's grade from the host's report.
 * Until that report is stored, only the table owner may use the value he just computed.
 * Everyone else gets 0 rather than a number their own browser invented.
 */
export function roomEvalXp(stored: unknown, seat: number, claimed: number, isOwner: boolean): number {
  if (Array.isArray(stored)) {
    const n = Number(stored[seat]);
    if ((EVAL_XP as readonly number[]).includes(n)) return n;
  }
  if (isOwner && (EVAL_XP as readonly number[]).includes(Number(claimed))) return Number(claimed);
  return 0;
}

function clampCutCount(value: unknown, max: number) {
  const n = Math.floor(Number(value));
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(max, n);
}

/** Four seats, host-reported. Anything else becomes zero. */
export function clampCutReport(value: unknown): CutReport {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as { hidden?: unknown; caught?: unknown } : {};
  const hiddenSrc = Array.isArray(obj.hidden) ? obj.hidden : [];
  const caughtSrc = Array.isArray(obj.caught) ? obj.caught : [];
  return {
    hidden: [0, 1, 2, 3].map((i) => clampCutCount(hiddenSrc[i], MAX_HIDDEN_CUTS)) as CutReport["hidden"],
    caught: [0, 1, 2, 3].map((i) => clampCutCount(caughtSrc[i], MAX_CAUGHT_CUTS)) as CutReport["caught"],
  };
}

function reportPresent(value: unknown) {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return false; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const obj = raw as { hidden?: unknown; caught?: unknown };
  return Array.isArray(obj.hidden) || Array.isArray(obj.caught);
}

/**
 * Online tables take cut counts from the host's report.
 * Until that report is stored, only the table owner may use the counts he just computed.
 * Everyone else gets 0 rather than a number their own browser invented.
 */
export function roomCuts(
  stored: unknown,
  seat: number,
  claimedHidden: number,
  claimedCaught: number,
  isOwner: boolean,
): { hidden: number; caught: number } {
  if (reportPresent(stored)) {
    const report = clampCutReport(stored);
    const i = seat | 0;
    if (i >= 0 && i < 4) return { hidden: report.hidden[i], caught: report.caught[i] };
  }
  if (isOwner) {
    return {
      hidden: clampCutCount(claimedHidden, MAX_HIDDEN_CUTS),
      caught: clampCutCount(claimedCaught, MAX_CAUGHT_CUTS),
    };
  }
  return { hidden: 0, caught: 0 };
}

/** XP required to occupy stage index `k` (0 = 7♦, 32 = joker). */
export function threshold(stage: number): number {
  const k = Math.max(0, Math.min(32, stage | 0));
  if (k >= 32) return 200 * 31 + 25 * 31 * 30 + 30_000;
  return 200 * k + 25 * k * (k - 1);
}

export function levelFromXp(total: number): number {
  const xp = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  let k = 0;
  while (k < 32 && threshold(k + 1) <= xp) k += 1;
  return k;
}

export function stageLabel(index: number): string {
  const i = Math.max(0, Math.min(32, index | 0));
  if (i === 32) return "الجوكر ★ — قراند ماستر";
  const value = RANK_META[Math.floor(i / 4)];
  const suit = SUITS[i % 4];
  return `${value.rank}${suit} — ${value.titleAr}`;
}

function clampInt(value: unknown, min: number, max: number) {
  const n = Math.floor(Number(value) || 0);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export type SettleKind = "result" | "abandon";

export type SettleInput = {
  kind: SettleKind;
  won?: boolean;
  evalXp?: number;
  hidden?: number;
  caught?: number;
};

export type Settlement = {
  kind: SettleKind;
  baseXp: number;
  evalXp: number;
  cheatXp: number;
  netXp: number;
  hidden: number;
  caught: number;
  before: number;
  after: number;
  fromLevel: number;
  toLevel: number;
};

/** Apply one match. Disconnect is exactly −200 and skips eval and cheat. */
export function settleMatch(before: number, input: SettleInput): Settlement {
  const old = Math.max(0, Math.floor(Number.isFinite(before) ? before : 0));
  const fromLevel = levelFromXp(old);
  if (input.kind === "abandon") {
    const after = Math.max(0, old - 200);
    return {
      kind: "abandon",
      baseXp: -200,
      evalXp: 0,
      cheatXp: 0,
      netXp: -200,
      hidden: 0,
      caught: 0,
      before: old,
      after,
      fromLevel,
      toLevel: levelFromXp(after),
    };
  }
  const baseXp = input.won ? 100 : -100;
  const evalXp = (EVAL_XP as readonly number[]).includes(Number(input.evalXp)) ? Number(input.evalXp) : 0;
  const hidden = clampInt(input.hidden, 0, 40);
  const caught = clampInt(input.caught, 0, 40);
  const cheatXp = hidden * 20 - caught * 10;
  const netXp = baseXp + evalXp + cheatXp;
  const after = Math.max(0, old + netXp);
  return {
    kind: "result",
    baseXp,
    evalXp,
    cheatXp,
    netXp,
    hidden,
    caught,
    before: old,
    after,
    fromLevel,
    toLevel: levelFromXp(after),
  };
}
