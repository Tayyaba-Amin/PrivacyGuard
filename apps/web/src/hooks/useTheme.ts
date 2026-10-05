import { useCallback, useEffect, useState } from 'react';
import { applyTheme, readStoredTheme, resolveInitialTheme, storeTheme } from '../lib/theme';
import type { Theme } from '../lib/theme';

export type ThemeControls = {
  theme: Theme;
  toggleTheme: () => void;
};

export function useTheme(): ThemeControls {
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Until the user picks a theme themselves, follow the operating system.
  useEffect(() => {
    if (readStoredTheme()) return;
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setTheme(event.matches ? 'dark' : 'light');
    };

    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    storeTheme(next);
    setTheme(next);
  }, [theme]);

  return { theme, toggleTheme };
}