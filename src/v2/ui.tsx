import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";

/** The three looks of the table; every v2 screen follows the one the player picked in the game. */
export { PALETTES } from "@/lib/qayd/theme";
import { PALETTES } from "@/lib/qayd/theme";
export function readTheme(): string {
  try { const t = (JSON.parse(localStorage.getItem("sb") || "{}") as { theme?: unknown }).theme; return typeof t === "string" && PALETTES[t] ? t : "trad"; } catch { return "trad"; }
}
export const themeStyle = (name: string): CSSProperties => PALETTES[name] as CSSProperties;

export const AVATARS: Record<string, { glyph: string; bg: string }> = {
  default: { glyph: "♠", bg: "#39271F" }, heart: { glyph: "♥", bg: "#9D3048" }, diamond: { glyph: "♦", bg: "#B5541F" }, club: { glyph: "♣", bg: "#2F6B45" },
  crown: { glyph: "♛", bg: "#8A6A1F" }, falcon: { glyph: "🦅", bg: "#37506B" }, coffee: { glyph: "☕", bg: "#6B4A2F" }, star: { glyph: "★", bg: "#5B3F8C" },
};

export function Avatar({ name, avatar, size = 40, online }: { name?: string; avatar?: string; size?: number; online?: boolean }) {
  const a = AVATARS[avatar ?? "default"] ?? AVATARS.default;
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: a.bg, fontSize: size * 0.46 }} aria-label={name}>
      {a.glyph}
      {online !== undefined && (
        <i className="absolute -bottom-0.5 -end-0.5 rounded-full border-2" style={{ width: size * 0.3, height: size * 0.3, background: online ? "#3DBE6B" : "#8A8F94", borderColor: "var(--q-surface)" }} aria-label={online ? "متصل" : "غير متصل"} />
      )}
    </span>
  );
}

export function Coin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="inline-block shrink-0 align-[-0.2em]">
      <circle cx="16" cy="16" r="15" fill="#e6b842" stroke="#7d5408" strokeWidth="1" /><circle cx="16" cy="16" r="11.5" fill="#f9d76e" stroke="#fff4c8" strokeWidth="1" />
      <text x="16" y="21.5" textAnchor="middle" fontSize="14" fontWeight="700" fill="#5d1020">♠</text>
    </svg>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger" | "soft"; busy?: boolean; wide?: boolean };
export function Btn({ tone = "soft", busy, wide, className = "", children, disabled, ...rest }: BtnProps) {
  const tones = {
    primary: "bg-[var(--q-primary)] text-[var(--q-primary-ink)]",
    ghost: "border border-[var(--q-line)] bg-transparent text-[var(--q-ink)]",
    danger: "bg-[var(--q-error)] text-white",
    soft: "bg-[var(--q-card)] text-[var(--q-ink)] border border-[var(--q-line)]",
  } as const;
  return (
    <button type="button" disabled={disabled || busy} {...rest}
      className={`min-h-11 rounded-xl px-4 text-sm font-bold transition active:scale-[.98] disabled:opacity-50 ${wide ? "w-full" : ""} ${tones[tone]} ${className}`}>
      {busy ? "…" : children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-bold text-[var(--q-ink)]">{label}</span>
      {children}
      {error ? <span className="text-xs text-[var(--q-error)]" role="alert">{error}</span> : hint ? <span className="text-xs text-[var(--q-muted)]">{hint}</span> : null}
    </label>
  );
}
export const inputCls = "min-h-11 w-full rounded-xl border border-[var(--q-line)] bg-[var(--q-input)] px-3 text-base text-[var(--q-ink)] outline-none focus:border-[var(--q-primary)]";

export function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`min-h-11 rounded-xl border px-3 text-sm font-bold transition disabled:opacity-45 ${on ? "border-[var(--q-primary)] bg-[var(--q-primary)] text-[var(--q-primary-ink)]" : "border-[var(--q-line)] bg-[var(--q-surface)] text-[var(--q-ink)]"}`}>
      {children}
    </button>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[var(--q-line)] bg-[var(--q-surface)] px-3 py-2 text-start">
      <span><b className="block text-sm text-[var(--q-ink)]">{label}</b>{hint && <small className="text-xs text-[var(--q-muted)]">{hint}</small>}</span>
      <i className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-[var(--q-primary)]" : "bg-[var(--q-line)]"}`}><b className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "start-0.5" : "start-[1.375rem]"}`} /></i>
    </button>
  );
}

/** Bottom sheet on phones, centered card on larger screens. Closes on Escape or a tap on the veil. */
export function Sheet({ open, title, onClose, children, theme }: { open: boolean; title: string; onClose: () => void; children: ReactNode; theme: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid items-end bg-black/55 sm:place-items-center" onClick={onClose} style={themeStyle(theme)} dir="rtl">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--q-line)] bg-[var(--q-surface)] text-[var(--q-ink)] shadow-2xl outline-none sm:max-w-lg sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--q-line)] px-4 py-3">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-11 w-11 place-items-center rounded-full border border-[var(--q-line)] text-lg">✕</button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; badge?: number }[] }) {
  return (
    <div role="tablist" className="mb-4 grid gap-1 rounded-2xl bg-[var(--q-card)] p-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`min-h-11 rounded-xl text-sm font-bold ${value === t.id ? "bg-[var(--q-surface)] text-[var(--q-primary)] shadow" : "text-[var(--q-muted)]"}`}>
          {t.label}{t.badge ? <em className="ms-1 rounded-full bg-[var(--q-error)] px-1.5 text-[11px] not-italic text-white">{t.badge}</em> : null}
        </button>
      ))}
    </div>
  );
}

export function Note({ kind = "info", children }: { kind?: "info" | "error" | "ok"; children: ReactNode }) {
  const c = kind === "error" ? "var(--q-error)" : kind === "ok" ? "var(--q-ok)" : "var(--q-muted)";
  return <p role={kind === "error" ? "alert" : "status"} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: c, color: c }}>{children}</p>;
}

export const MODE_LABEL = { friendly: "محدود", free: "حر" } as const;
export const reasonLabel = (r: string) => ({ welcome: "هدية البداية", win: "ربح صكة", loss: "خسارة صكة", stake: "دخول صكة", refund: "استرجاع" } as Record<string, string>)[r] ?? r;
