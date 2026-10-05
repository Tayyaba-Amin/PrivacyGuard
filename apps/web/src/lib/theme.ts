/**
 * Light/dark theme state for the whole UI.
 *
 * The selected theme is stored on `document.documentElement` as
 * `data-theme="light" | "dark"` so every component can follow the tokens in
 * `index.css` instead of hard-coding colours. A manual choice is persisted in
 * localStorage; with no stored choice the system preference is followed live.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'privacyguard:theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

function prefersDark(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? (prefersDark() ? 'dark' : 'light');
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The theme
    // still applies for this session.
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}