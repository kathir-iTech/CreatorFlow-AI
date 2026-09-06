const KEY = "creatorflow:theme";
export type Theme = "dark" | "light";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem(KEY) as Theme | null;
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* storage blocked (private mode) — fall through to default */
  }
  return "dark";
}

export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
}
