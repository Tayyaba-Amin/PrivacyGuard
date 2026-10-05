import type { Theme } from '../lib/theme';

type ThemeToggleProps = {
  theme: Theme;
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const next = theme === 'dark' ? 'Light' : 'Dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={`Switch to ${next} theme (currently ${theme} theme)`}
      title={`Switch to ${next} theme`}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {theme === 'dark' ? (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="12" r="4.1" />
            <path
              d="M12 2.6v2.1M12 19.3v2.1M21.4 12h-2.1M4.7 12H2.6m15.2-6.4-1.5 1.5M7.7 16.3l-1.5 1.5m11.4 0-1.5-1.5M7.7 7.7 6.2 6.2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="theme-toggle__label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}