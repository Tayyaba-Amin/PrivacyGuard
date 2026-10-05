export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="app-footer__brand">
        <p className="app-footer__name">PrivacyGuard</p>
        <p className="app-footer__tagline">Detect. Protect. Share with confidence.</p>
      </div>

      <div className="app-footer__meta">
        <p className="app-footer__privacy">
          Content is processed in memory and is not persistently stored.
        </p>
      </div>

      <p className="app-footer__legal">
        &copy; {year} PrivacyGuard &middot; Built for the hackathon
      </p>
    </footer>
  );
}