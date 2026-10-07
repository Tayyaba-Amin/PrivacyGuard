import { Icon } from './Icon';
import { ThemeToggle } from './ThemeToggle';
import type { Theme } from '../lib/theme';

type LandingPageProps = {
  theme: Theme;
  onToggleTheme: () => void;
  onGetStarted: () => void;
};

const FEATURES = [
  ['shield', 'Private by design', 'Your content is processed in memory and never persistently stored.'],
  ['text', 'Understand the risk', 'Find emails, phone numbers, credentials, API keys and more.'],
  ['image', 'Protect and verify', 'Create a protected copy, then rescan before you share.'],
] as const;

export function LandingPage({ theme, onToggleTheme, onGetStarted }: LandingPageProps) {
  return (
    <div className="landing">
      <header className="landing__header">
        <a className="landing__brand" href="#top" aria-label="PrivacyGuard home">
          <span className="landing__logo"><Icon name="shield" size={21} /></span>
          <span>PrivacyGuard</span>
        </a>
        <nav className="landing__nav" aria-label="Landing page navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="landing__actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button type="button" className="button button--primary landing__nav-cta" onClick={onGetStarted}>
            Get started
          </button>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <span className="landing-hero__badge">
              <span className="landing-hero__badge-dot" />
              Your privacy comes first
            </span>
            <h1>
              Your privacy.
              <br />
              <span>Your priority.</span>
            </h1>
            <p>
              Find sensitive information before it leaves your hands. Understand the risks, protect
              what matters, and share with confidence.
            </p>
            <div className="landing-hero__actions">
              <button type="button" className="button button--primary button--lg" onClick={onGetStarted}>
                Get started free <Icon name="arrow" size={17} />
              </button>
              <a className="button button--secondary button--lg" href="#how-it-works">
                How it works
              </a>
            </div>
            <div className="landing-hero__promises">
              <span><Icon name="shield" size={18} /> Your content stays private</span>
              <span><Icon name="history" size={18} /> Nothing persistently stored</span>
            </div>
          </div>

          <div className="landing-visual" aria-label="Illustration of sensitive information detected and protected">
            <div className="landing-visual__glow" />
            <div className="landing-visual__document">
              <div className="landing-visual__window"><i /><i /><i /></div>
              <p>Hi there,</p>
              <p>You can reach me at</p>
              <strong>hello@example.com</strong>
              <p>My account key is</p>
              <strong>••••••••••••••</strong>
              <span className="landing-visual__blur">Protected content</span>
            </div>
            <div className="landing-visual__findings">
              <strong>Privacy check</strong>
              <span><i className="landing-visual__dot landing-visual__dot--purple" /> Email address <b>Found</b></span>
              <span><i className="landing-visual__dot landing-visual__dot--blue" /> API key <b>Protected</b></span>
              <div className="landing-visual__safe"><Icon name="shield" size={17} /> Ready to review</div>
            </div>
            <span className="landing-visual__spark landing-visual__spark--one" />
            <span className="landing-visual__spark landing-visual__spark--two" />
          </div>
        </section>

        <section className="landing-features" id="features">
          <div className="landing-section-heading">
            <span>Privacy, without guesswork</span>
            <h2>Know what you’re about to share.</h2>
          </div>
          <div className="landing-features__grid">
            {FEATURES.map(([icon, title, description]) => (
              <article className="landing-feature" key={title}>
                <span className="landing-feature__icon"><Icon name={icon} size={22} /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-how" id="how-it-works">
          <span>Simple, careful, clear</span>
          <h2>Three steps to a safer share.</h2>
          <div className="landing-how__steps">
            <article><i>01</i><h3>Scan</h3><p>Paste text or upload an image to detect sensitive details.</p></article>
            <article><i>02</i><h3>Protect</h3><p>Review what was found and create a protected copy.</p></article>
            <article><i>03</i><h3>Verify</h3><p>Rescan the protected version before sharing it.</p></article>
          </div>
        </section>

        <section className="landing-faq" id="faq">
          <h2>Frequently asked</h2>
          <details>
            <summary>Does PrivacyGuard save my content?</summary>
            <p>No. Content is processed in memory and is not persistently stored.</p>
          </details>
          <details>
            <summary>What can I scan?</summary>
            <p>Text and images with readable text. Image analysis uses OCR to find sensitive details.</p>
          </details>
        </section>

        <section className="landing-final-cta">
          <div><h2>Share with confidence.</h2><p>Check your content before it goes out.</p></div>
          <button type="button" className="button button--primary button--lg" onClick={onGetStarted}>
            Start a privacy check <Icon name="arrow" size={17} />
          </button>
        </section>
      </main>
      <footer className="landing__footer">
        <span>PrivacyGuard</span>
        <span>Detect. Protect. Share with confidence.</span>
        <span>Content is processed in memory and not persistently stored.</span>
      </footer>
    </div>
  );
}
