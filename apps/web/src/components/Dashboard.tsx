import type { ReactNode } from 'react';
import type { AppView } from '../lib/types';

type DashboardProps = {
  onNavigate: (view: AppView) => void;
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

const WORKFLOW: { step: string; title: string; description: string }[] = [
  {
    step: '1',
    title: 'Analyze',
    description:
      'Your content is scanned by a deterministic pattern engine for emails, phone numbers, credentials, API keys, URLs, addresses and more.',
  },
  {
    step: '2',
    title: 'Assess Risk',
    description:
      'The findings are scored into a 0–100 risk assessment, with the severity and weight of each detection shown.',
  },
  {
    step: '3',
    title: 'Protect',
    description:
      'Detected spans are replaced with category placeholders, and sensitive regions of an image are covered.',
  },
  {
    step: '4',
    title: 'Rescan',
    description:
      'The protected content is analysed again to verify that nothing recognisable is still there.',
  },
  {
    step: '5',
    title: 'Get Final Verdict',
    description:
      'You get a clear safe-to-share verdict backed by the rescan, not by the original content.',
  },
];

export function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <p className="hero__eyebrow">Sensitive data detection</p>
        <h1 className="hero__title" id="hero-title">
          Detect sensitive information before you share it.
        </h1>
        <p className="hero__lead">
          Scan text or an image for emails, phone numbers, credentials, API keys, URLs and addresses.
          PrivacyGuard explains what each finding means, redacts it, and verifies the protected result
          before anything leaves your hands.
        </p>
      </section>

      <section className="actions" aria-labelledby="actions-title">
        <div className="section-head">
          <h2 className="section-head__title" id="actions-title">
            Choose what to analyze
          </h2>
          <p className="section-head__hint">Both options run the same five-step flow.</p>
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

      <section className="panel" aria-labelledby="workflow-title">
        <div className="section-head">
          <h2 className="section-head__title" id="workflow-title">
            How it works
          </h2>
          <p className="section-head__hint">
            PrivacyGuard identifies sensitive information, calculates a risk assessment, redacts what it
            found, and verifies the protected result.
          </p>
        </div>

        <ol className="workflow">
          {WORKFLOW.map((item) => (
            <li key={item.step} className="workflow__step">
              <span className="workflow__marker" aria-hidden="true">
                {item.step}
              </span>
              <span className="workflow__body">
                <span className="workflow__title">{item.title}</span>
                <span className="workflow__description">{item.description}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="trust" aria-labelledby="trust-title">
        <span className="trust__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 3.5 5.8 6v5.2c0 4.1 2.6 7.7 6.2 8.9 3.6-1.2 6.2-4.8 6.2-8.9V6L12 3.5Z" strokeLinejoin="round" />
            <path d="m9.8 11.9 1.6 1.6 3-3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="trust__body">
          <span className="trust__title" id="trust-title">
            Your content is processed in memory and is not persistently stored.
          </span>
          <span className="trust__description">
            Detection is pattern-based and deterministic: it reports only what it recognises, so review
            content yourself before sharing it.
          </span>
        </span>
      </section>
    </>
  );
}