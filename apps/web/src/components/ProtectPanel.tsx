import type { ProtectionState, DisplayRisk } from '../lib/types';
import { LEVEL_HEADLINE } from '../lib/findings';
import { TechnicalDetails } from './TechnicalDetails';

type TextRedaction = { findingId: string; category: string; start: number; end: number; replacement: string };
type ImageRedaction = { findingId: string; category: string; bbox: { x: number; y: number; width: number; height: number }; replacement: string };

type ProtectPanelProps = {
  findingCount: number;
  text: string;
  state: ProtectionState;
  protectedText: string | null;
  protectedImagePreviewUrl: string | null;
  originalImagePreviewUrl: string | null;
  redactionCount: number;
  redactions: TextRedaction[];
  imageRedactions: ImageRedaction[];
  initialRisk: DisplayRisk | null;
  rescanState: 'idle' | 'rescanning' | 'complete';
  rescanRisk: DisplayRisk | null;
  /** True while a protect request is in flight, owned by the page. */
  protectBusy: boolean;
  onProtect: () => Promise<void>;
  onReset: () => void;
};

export function ProtectPanel({
  findingCount,
  text,
  state,
  protectedText,
  protectedImagePreviewUrl,
  originalImagePreviewUrl,
  redactionCount,
  redactions,
  imageRedactions,
  initialRisk,
  rescanState,
  rescanRisk,
  protectBusy,
  onProtect,
  onReset,
}: ProtectPanelProps) {
  if (findingCount === 0) {
    return (
      <p className="placeholder-note">
        There is nothing to protect yet. Run a scan first, then come back here to protect it.
      </p>
    );
  }

  const isImageMode = protectedImagePreviewUrl !== null;
  const currentRedactions = isImageMode ? imageRedactions : redactions;

  return (
    <div className="protect">
      <p className="protect__intro">
        {isImageMode
          ? 'Protection covers sensitive regions in the image with solid boxes.'
          : 'Protection replaces each detected span with a placeholder such as'
        }
        {isImageMode ? '' : (
          <>
            {' '}
            <code>[REDACTED_EMAIL]</code>, so the text stays readable but carries nothing real.
          </>
        )}
      </p>

      <div className="protect__actions">
        <button
          type="button"
          className="button button--primary button--lg"
          onClick={() => void onProtect()}
          disabled={state === 'protected' || protectBusy}
        >
          {protectBusy
            ? 'Protecting…'
            : state === 'protected'
            ? 'Protected copy ready'
            : 'Protect My Content'}
        </button>
        <p className="analyze__hint">
          {findingCount} sensitive {findingCount === 1 ? 'item' : 'items'} will be protected.
        </p>
      </div>

      {state === 'protected' && (protectedText || protectedImagePreviewUrl) ? (
        <div className="protect__preview">
          <p className="notice notice--warning">
            Protected copy created. Run the final safety check next.
          </p>

          <p className="protect__summary">
            {redactionCount} sensitive {redactionCount === 1 ? 'item' : 'items'} protected.
          </p>

          {isImageMode ? (
            <div className="image-diff">
              <div className="diff__column">
                <p className="diff__label">Original</p>
                <img className="diff__image" src={originalImagePreviewUrl ?? undefined} alt="Original image" />
              </div>
              <div className="diff__column">
                <p className="diff__label">Protected</p>
                <img className="diff__image" src={protectedImagePreviewUrl ?? undefined} alt="Protected image" />
              </div>
            </div>
          ) : (
            <div className="diff">
              <div className="diff__column">
                <p className="diff__label">Original</p>
                <pre className="diff__code diff__code--before">{text}</pre>
              </div>
              <div className="diff__column">
                <p className="diff__label">Protected</p>
                <pre className="diff__code diff__code--after">{protectedText}</pre>
              </div>
            </div>
          )}

          <TechnicalDetails label="Redaction details">
            {currentRedactions.length > 0 ? (
              <ul className="protect__redaction-list">
                {currentRedactions.map((redaction, index) => (
                  <li key={redaction.findingId ?? index}>
                    <code>{redaction.replacement}</code> —{' '}
                    {redaction.category.replace(/_/g, ' ').toLowerCase()}
                    {isImageMode
                      ? ` at (${(redaction as ImageRedaction).bbox.x}, ${(redaction as ImageRedaction).bbox.y}) ${(redaction as ImageRedaction).bbox.width}×${(redaction as ImageRedaction).bbox.height}`
                      : ` at ${(redaction as TextRedaction).start}–${(redaction as TextRedaction).end}`}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="field__hint">Redaction is deterministic. No AI involved.</p>
          </TechnicalDetails>

          <div className="protect__actions">
            <button type="button" className="button button--secondary" onClick={onReset}>
              Start over
            </button>
          </div>

          {rescanState === 'complete' && initialRisk && rescanRisk && (
            <div className="protect__comparison">
              <h3 className="block__title">Before and after</h3>
              <div className="comparison">
                <div className="comparison__column comparison__column--initial">
                  <p className="comparison__label">Before</p>
                  <p className={`comparison__score comparison__score--${initialRisk.level}`}>
                    {initialRisk.score} / 100
                  </p>
                  <p className={`comparison__verdict comparison__verdict--${initialRisk.level}`}>
                    {LEVEL_HEADLINE[initialRisk.level]}
                  </p>
                  <p className="comparison__findings">
                    {initialRisk.factors.length} {initialRisk.factors.length === 1 ? 'finding' : 'findings'}
                  </p>
                </div>

                <div className="comparison__arrow" aria-hidden="true">
                  <span>&rarr;</span>
                </div>

                <div className="comparison__column comparison__column--final">
                  <p className="comparison__label">After</p>
                  <p className={`comparison__score comparison__score--${rescanRisk.level}`}>
                    {rescanRisk.score} / 100
                  </p>
                  <p className={`comparison__verdict comparison__verdict--${rescanRisk.level}`}>
                    {LEVEL_HEADLINE[rescanRisk.level]}
                  </p>
                  <p className="comparison__findings">
                    {rescanRisk.factors.length} {rescanRisk.factors.length === 1 ? 'finding' : 'findings'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}