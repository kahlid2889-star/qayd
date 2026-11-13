/**
 * قيد QAYD — the official colour identity for the account, online and friends windows.
 * The same nine colours as public/qayd-theme.css (the game). One look: the heritage theme.
 */
export type ThemeName = "trad";

type Identity = {
  bg: string; surface: string; primary: string; secondary: string; deep: string;
  accent: string; text: string; text2: string; border: string;
  onPrimary: string; link: string; danger: string; success: string;
};

export const IDENTITY: Record<ThemeName, Identity> = {
  /* التراثي — Burgundy & Cream */
  trad: {
    bg: "#F3E8D5", surface: "#E5D3B8", primary: "#641F32", secondary: "#7D293F", deep: "#451523",
    accent: "#B9945B", text: "#38252A", text2: "#806D68", border: "#D4C1A9",
    onPrimary: "#F3E8D5", link: "#641F32", danger: "#A32D3F", success: "#3D7A52",
  },
};

export const THEME_NAMES = Object.keys(IDENTITY) as ThemeName[];
export const isTheme = (value: unknown): value is ThemeName => typeof value === "string" && value in IDENTITY;

/** CSS variables the windows read (`--q-*`). Built from the identity, nothing else. */
export function themeVars(name: string): Record<string, string> {
  const c = IDENTITY[isTheme(name) ? name : "trad"];
  const raise = `color-mix(in srgb, ${c.surface} 45%, ${c.bg})`;
  return {
    "--q-bg": c.bg, "--q-surface": c.bg, "--q-card": c.surface, "--q-input": raise,
    "--q-ink": c.text, "--q-muted": c.text2, "--q-line": c.border,
    "--q-primary": c.primary, "--q-primary-hover": c.secondary, "--q-primary-ink": c.onPrimary,
    "--q-secondary": c.secondary, "--q-deep": c.deep,
    "--q-accent": c.link, "--q-gold": c.accent,
    "--q-error": c.danger, "--q-ok": c.success,
    "--q-selected": `color-mix(in srgb, ${c.primary} 14%, ${c.bg})`,
    "--q-overlay": `color-mix(in srgb, ${c.deep} 64%, transparent)`,
    "--q-shadow": `color-mix(in srgb, ${c.deep} 30%, transparent)`,
  };
}

export const PALETTES: Record<string, Record<string, string>> = Object.fromEntries(THEME_NAMES.map((n) => [n, themeVars(n)]));
