import type { AppView } from '../lib/types';

type HeaderProps = {
  view: AppView;
};

export function Header({ view }: HeaderProps) {
  const title = {
    landing: 'Welcome',
    dashboard: 'Dashboard',
    text: 'Text Analysis',
    image: 'Image Analysis',
    'text-results': 'Analysis Results',
    'image-results': 'Image Analysis Results',
    protected: 'Protected Copy',
    rescan: 'Rescan & Final Verdict',
    history: 'History',
  }[view];

  return (
    <header className="app-header">
      <div className="app-header__heading">
        <p className="app-header__eyebrow">Privacy workspace</p>
        <h1 className="app-header__title">{title}</h1>
      </div>
    </header>
  );
}