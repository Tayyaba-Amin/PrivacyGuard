import type { ReactNode } from 'react';
import type { AppView } from '../lib/types';
import { Icon } from './Icon';

type DashboardProps = {
  onNavigate: (view: AppView) => void;
  activity: DashboardActivity[];
};

export type DashboardActivity = {
  id: string;
  type: 'text' | 'image';
  findingCount: number;
  at: string;
  status: 'safe' | 'review' | 'attention';
  charactersAnalyzed: number;
};

type ActionCard = {
  view: 'text' | 'image';
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
  points: string[];
  note: string;
};

const CARDS: ActionCard[] = [
  {
    view: 'text',
    icon: (
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M7 4h7l5 5v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
        <path d="M14 4v5h5M9 13h6M9 17h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Text Analysis',
    description: 'Analyze pasted text for sensitive information.',
    cta: 'Analyze Text',
    points: ['Messages, emails and documents', 'Code and configuration with keys', 'Support tickets and logs'],
    note: 'Every match is reported with its exact location.',
  },
  {
    view: 'image',
    icon: (
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3.5" y="5" width="17" height="14" rx="2" strokeLinejoin="round" />
        <path d="m4.5 16 4-4.2 3 3 3.2-3.4 4.8 5.1" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9.2" cy="9.4" r="1.3" />
      </svg>
    ),
    title: 'Image Analysis',
    description: 'Upload an image and scan it using OCR.',
    cta: 'Analyze Image',
    points: ['Screenshots and scanned documents', 'Photos of receipts and ID cards', 'Anything with text in it'],
    note: 'Sensitive regions are covered on a redacted copy.',
  },
];

export function Dashboard({ onNavigate, activity }: DashboardProps) {
  return (
    <div className="dashboard">
      <section className="dashboard__welcome">
        <div>
          <p className="hero__eyebrow">Private by design</p>
          <h2 className="dashboard__title">Welcome to PrivacyGuard</h2>
          <p className="dashboard__lead">
            Keep your information private and share with confidence. Choose what you want to check.
          </p>
        </div>
        <span className="dashboard__shield" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 3 5 6v5.5c0 4.4 2.9 8.3 7 9.5 4.1-1.2 7-5.1 7-9.5V6l-7-3Z" strokeLinejoin="round" />
            <path d="m9.5 12.2 1.8 1.8 3.4-3.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </section>
      <section className="actions" aria-labelledby="actions-title">
        <div className="section-head">
          <h2 className="section-head__title" id="actions-title">
            Start a privacy check
          </h2>
          <p className="section-head__hint">Each check guides you from detection to a final verdict.</p>
        </div>

        <div className="actions__grid">
          {CARDS.map((card) => (
            <button
              key={card.view}
              type="button"
              className="action-card"
              onClick={() => onNavigate(card.view)}
            >
              <span className="action-card__icon" aria-hidden="true">
                {card.icon}
              </span>

              <span className="action-card__title">{card.title}</span>
              <span className="action-card__description">{card.description}</span>

              <span className="action-card__points">
                {card.points.map((point) => (
                  <span key={point} className="action-card__point">
                    {point}
                  </span>
                ))}
              </span>

              <span className="action-card__cta">
                {card.cta}
                <span aria-hidden="true" className="action-card__arrow">
                  &rarr;
                </span>
              </span>

              <span className="action-card__note">{card.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard__lower">
        <div className="dashboard__activity panel">
          <div className="section-head">
            <h2 className="section-head__title">Recent activity</h2>
            <span className="dashboard__session-label">This session</span>
          </div>
          {activity.length > 0 ? (
            <ul className="dashboard__activity-list">
              {activity.slice(0, 5).map((entry) => (
                <li className="dashboard__activity-row" key={entry.id}>
                  <span className="dashboard__empty-icon"><Icon name={entry.type} size={18} /></span>
                  <span className="dashboard__activity-copy">
                    <strong>{entry.type === 'text' ? 'Text Analysis' : 'Image Analysis'}</strong>
                    <span>
                      {activityDescription(entry)}
                    </span>
                  </span>
                  <time className="dashboard__activity-time" dateTime={entry.at}>
                    {new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </time>
                  <span className={`dashboard__complete dashboard__complete--${entry.status}`}>
                    {activityStatus(entry.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="dashboard__empty">
              <span className="dashboard__empty-icon"><Icon name="arrow" size={18} /></span>
              <p>No checks in this session yet.</p>
              <span>Recent activity is kept in memory only.</span>
            </div>
          )}
        </div>
        <div className="trust" aria-labelledby="trust-title">
          <span className="trust__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 3.5 5.8 6v5.2c0 4.1 2.6 7.7 6.2 8.9 3.6-1.2 6.2-4.8 6.2-8.9V6L12 3.5Z" strokeLinejoin="round" />
              <path d="m9.8 11.9 1.6 1.6 3-3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="trust__body">
            <span className="trust__title" id="trust-title">
              Your content is processed in memory.
            </span>
            <span className="trust__description">
              Your scans are not persistently stored. Review every result before sharing.
            </span>
          </span>
        </div>
      </section>
    </div>
  );
}

export function activityDescription(entry: DashboardActivity): string {
  if (entry.type === 'image' && entry.charactersAnalyzed === 0) {
    return 'No readable text detected; review the image manually';
  }
  if (entry.findingCount === 0) return 'No sensitive items found';
  return `${entry.findingCount} sensitive ${entry.findingCount === 1 ? 'item' : 'items'} found`;
}

export function activityStatus(status: DashboardActivity['status']): string {
  if (status === 'safe') return 'No findings';
  if (status === 'attention') return 'Needs attention';
  return 'Review';
}