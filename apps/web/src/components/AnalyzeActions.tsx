type AnalyzeActionsProps = {
  canAnalyze: boolean;
  busy: boolean;
  onAnalyze: () => void;
  onReset: () => void;
  blockedHint: string;
  hasAnyInput: boolean;
};

export function AnalyzeActions({
  canAnalyze,
  busy,
  onAnalyze,
  onReset,
  blockedHint,
  hasAnyInput,
}: AnalyzeActionsProps) {
  return (
    <div className="analyze">
      <div className="analyze__main">
        <button
          type="button"
          className="button button--primary button--lg"
          onClick={onAnalyze}
          disabled={!canAnalyze || busy}
        >
          {busy ? 'Analyzing…' : 'Analyze for Privacy Risks'}
        </button>
        <p className="analyze__hint">{busy ? 'Running the analysis…' : blockedHint}</p>
      </div>

      <button
        type="button"
        className="button button--ghost"
        onClick={onReset}
        disabled={busy || !hasAnyInput}
      >
        Reset
      </button>
    </div>
  );
}