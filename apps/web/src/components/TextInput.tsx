type TextInputProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  disabled: boolean;
};

/** Matches the server-side MAX_TEXT_CHARS budget, used only as a UI hint. */
const SOFT_LIMIT = 20_000;

export function TextInput({ value, onChange, onClear, disabled }: TextInputProps) {
  const characters = value.length;
  const overLimit = characters > SOFT_LIMIT;

  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label" htmlFor="privacyguard-text">
          Content to analyse
        </label>
        <span className={`counter${overLimit ? ' counter--warn' : ''}`} aria-live="polite">
          {characters.toLocaleString()} character{characters === 1 ? '' : 's'}
        </span>
      </div>

      <textarea
        id="privacyguard-text"
        className="textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        spellCheck={false}
        placeholder="Paste the text you are about to share — a message, an email, or a config file with keys."
      />

      <div className="field__foot">
        {overLimit ? (
          <p className="field__hint">
            This is above the {SOFT_LIMIT.toLocaleString()} character limit the analyzer will accept.
          </p>
        ) : null}
        <button type="button" className="button button--ghost" onClick={onClear} disabled={disabled || characters === 0}>
          Clear text
        </button>
      </div>
    </div>
  );
}