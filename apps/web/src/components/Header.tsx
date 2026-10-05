import type { AppView } from '../lib/types';
import type { Theme } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';

type HeaderProps = {
  view: AppView;
  theme: Theme;
  onNavigate: (view: AppView) => void;
  onToggleTheme: () => void;
};

export function Header({ view, theme, onNavigate, onToggleTheme }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <button
          type="button"
          className="app-header__home"
          onClick={() => onNavigate('dashboard')}
          aria-label="PrivacyGuard — go to dashboard"
          aria-current={view === 'dashboard' ? 'page' : undefined}
        >
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor">
              <path
                d="M12 3 5 6v5.5c0 4.4 2.9 8.3 7 9.5 4.1-1.2 7-5.1 7-9.5V6l-7-3Z"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path d="m9.5 12.2 1.8 1.8 3.4-3.6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="app-header__names">
            <span className="app-header__name">PrivacyGuard</span>
            <span className="app-header__tagline">Detect, protect, and verify before you share.</span>
          </span>
        </button>
      </div>

      <div className="app-header__actions">
        <nav className="app-nav" aria-label="Sections">
          <button
            type="button"
            className={`app-nav__link${view === 'dashboard' ? ' app-nav__link--current' : ''}`}
            aria-current={view === 'dashboard' ? 'page' : undefined}
            onClick={() => onNavigate('dashboard')}
          >
            Home
          </button>
          <button
            type="button"
            className={`app-nav__link${view === 'text' ? ' app-nav__link--current' : ''}`}
            aria-current={view === 'text' ? 'page' : undefined}
            onClick={() => onNavigate('text')}
          >
            Text
          </button>
          <button
            type="button"
            className={`app-nav__link${view === 'image' ? ' app-nav__link--current' : ''}`}
            aria-current={view === 'image' ? 'page' : undefined}
            onClick={() => onNavigate('image')}
          >
            Image
          </button>
        </nav>

        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  );
}