/**
 * قيد QAYD — the official colour identity for the account, online and friends windows.
 * The same nine colours per theme as public/qayd-theme.css (the game). Change a colour in both
 * places, or add a theme to both, and every surface follows.
 */
export type ThemeName = "trad" | "light" | "dark";

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
  /* الفاتح — White & Blue */
  light: {
    bg: "#FFFFFF", surface: "#F2F6FA", primary: "#397DB8", secondary: "#20547F", deep: "#173B5B",
    accent: "#DCEAF7", text: "#243447", text2: "#718096", border: "#DCE4EC",
    onPrimary: "#FFFFFF", link: "#20547F", danger: "#C0394B", success: "#2E8B62",
  },
  /* الداكن — Charcoal & Green */
  dark: {
    bg: "#101211", surface: "#191E1B", primary: "#315B40", secondary: "#6C9A72", deep: "#25352B",
    accent: "#6C9A72", text: "#E8EEE8", text2: "#A5B1A7", border: "#303B33",
    onPrimary: "#E8EEE8", link: "#6C9A72", danger: "#E0707F", success: "#7FC79A",
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
    "--q-accent": c.link, "--q-gold": name === "light" ? c.primary : c.accent,
    "--q-error": c.danger, "--q-ok": c.success,
    "--q-selected": `color-mix(in srgb, ${c.primary} ${name === "dark" ? 42 : 14}%, ${name === "dark" ? c.surface : c.bg})`,
    "--q-overlay": name === "dark" ? "rgba(0, 0, 0, 0.68)" : `color-mix(in srgb, ${c.deep} 64%, transparent)`,
    "--q-shadow": name === "dark" ? "rgba(0, 0, 0, 0.5)" : `color-mix(in srgb, ${c.deep} 30%, transparent)`,
  };
}

export const PALETTES: Record<string, Record<string, string>> = Object.fromEntries(THEME_NAMES.map((n) => [n, themeVars(n)]));
