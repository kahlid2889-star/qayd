import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { api } from "./api";

export type LiveStatus = "off" | "connecting" | "live" | "degraded";
type Handlers = { onRoom: () => void; onNotify: () => void };

/**
 * One private-channel socket per tab: `user:<id>` always, `room:<code>` while in a room.
 * Phase 0 showed supabase-js can report SUBSCRIBED on a deaf channel, so the recipe is strict:
 *   1. await setAuth(token) once  2. join every channel in the same tick  3. prove delivery with a canary.
 * If the canary never arrives the socket is rebuilt; after three tries the status is "degraded" and the
 * screens fall back to polling, so the lobby keeps working either way.
 */
export function useLive(userId: string | null, roomCode: string | null, h: Handlers): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("off");
  const handlers = useRef(h); handlers.current = h;

  useEffect(() => {
    if (!userId) { setStatus("off"); return; }
    const sb = supabase();
    let dead = false; let attempt = 0; let timer: ReturnType<typeof setTimeout> | undefined;
    let gotPong: ((v: boolean) => void) | null = null;

    async function build() {
      if (dead) return;
      setStatus("connecting");
      await sb.removeAllChannels();
      const { data } = await sb.auth.getSession();
      if (!data.session) return;
      await sb.realtime.setAuth(data.session.access_token);
      const topics = [`user:${userId}`, ...(roomCode ? [`room:${roomCode}`] : [])];
      const joined = await Promise.all(topics.map((t) => new Promise<boolean>((resolve) => {
        const ch = sb.channel(t, { config: { private: true } });
        ch.on("broadcast", { event: "pong" }, () => gotPong?.(true));
        ch.on("broadcast", { event: "notify" }, () => handlers.current.onNotify());
        ch.on("broadcast", { event: "room" }, () => handlers.current.onRoom());
        const timeout = setTimeout(() => resolve(false), 6000);
        ch.subscribe((s) => { if (s === "SUBSCRIBED") { clearTimeout(timeout); resolve(true); } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") { clearTimeout(timeout); resolve(false); } });
      })));
      if (dead) return;
      let alive = joined.every(Boolean);
      if (alive) {
        alive = await new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(false), 4000);
          gotPong = (v) => { clearTimeout(t); resolve(v); };
          void api.pingMe().catch(() => resolve(false));
        });
      }
      gotPong = null;
      if (dead) return;
      if (alive) { attempt = 0; setStatus("live"); handlers.current.onRoom(); handlers.current.onNotify(); return; }
      attempt += 1;
      if (attempt >= 3) { setStatus("degraded"); return; }
      timer = setTimeout(() => void build(), 800 * attempt);
    }
    void build();

    const { data: sub } = sb.auth.onAuthStateChange((event) => { if (event === "TOKEN_REFRESHED") { attempt = 0; void build(); } });
    return () => { dead = true; clearTimeout(timer); sub.subscription.unsubscribe(); void sb.removeAllChannels(); };
  }, [userId, roomCode]);

  return status;
}

/** Keeps "online" and room presence fresh while the tab is visible. */
export function useHeartbeat(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    const beat = () => { if (document.visibilityState === "visible") void api.heartbeat().catch(() => undefined); };
    beat();
    const t = setInterval(beat, 25_000);
    document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", beat); };
  }, [signedIn]);
}
