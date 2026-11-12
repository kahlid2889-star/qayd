export type OutMail = { kind: string; toUser?: string | null; body?: unknown };

function cuesOf(body: unknown): { id?: number }[] {
  if (!body || typeof body !== "object") return [];
  const cues = (body as { cues?: unknown }).cues;
  if (!Array.isArray(cues)) return [];
  return cues.filter((cue) => cue && typeof cue === "object") as { id?: number }[];
}

/** Keep one snapshot per seat. Sound cues from a dropped frame are kept. */
export function pushMail<T extends OutMail>(box: T[], item: T): void {
  if (item.kind === "qayd-watch") {
    const seat = item.body && typeof item.body === "object" ? (item.body as { seat?: number }).seat : undefined;
    const idx = box.findIndex((mail) => mail.kind === "qayd-watch" && (mail.body && typeof mail.body === "object" ? (mail.body as { seat?: number }).seat : undefined) === seat);
    if (idx >= 0) box.splice(idx, 1);
  }
  if (item.kind === "view" && item.toUser) {
    const idx = box.findIndex((mail) => mail.kind === "view" && mail.toUser === item.toUser);
    if (idx >= 0) {
      const seen = new Set<number>();
      const cues = [];
      for (const cue of [...cuesOf(box[idx].body), ...cuesOf(item.body)]) {
        if (cue.id == null || seen.has(cue.id)) continue;
        seen.add(cue.id);
        cues.push(cue);
      }
      item = { ...item, body: { ...(item.body && typeof item.body === "object" ? item.body : {}), cues: cues.slice(-12) } };
      box.splice(idx, 1);
    }
  }
  box.push(item);
}

/** The server stores eight messages per poll. Take that many and leave the rest queued. */
export function takeBatch<T>(box: T[], limit = 8): T[] {
  const n = Math.max(0, Math.min(box.length, limit | 0));
  return n ? box.splice(0, n) : [];
}

/**
 * Put a batch back after a failed poll.
 * A newer snapshot for the same seat replaces the one that was in flight.
 */
export function restoreBatch<T extends OutMail>(box: T[], sent: T[]): void {
  for (let i = sent.length - 1; i >= 0; i--) {
    const item = sent[i];
    if (
      item.kind === "view" &&
      item.toUser &&
      box.some((mail) => mail.kind === "view" && mail.toUser === item.toUser)
    ) {
      continue;
    }
    box.unshift(item);
  }
}
